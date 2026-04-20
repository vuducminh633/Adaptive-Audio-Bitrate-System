import { AVAILABLE_BITRATES, SAFETY_MARGIN, CROSSFADE_TIME } from './config.js';
import { updateGraph, logAndDisplay, logError, updateQoEDashboard } from './ui.js';
import { getChunkFilenameFromManifest, uploadAndEncode } from './network.js';

        
// 1. COLD START FIX: Assume a terrible network (50kbps) to guarantee the first chunk plays instantly
let fakeBandwidth = 50; 
let currentBitrate = 0;
let chunkIndex = 0; 
let currentSongFolder = ""; 
let parsedPlaylists = {}; 

// --- Performance Tracking State ---
let qoeSwitches = 0;
let qoeStalls = 0;
let totalBitrateSum = 0;
let chunksPlayed = 0;
let lastTargetBitrate = null;

// Web Audio API State
let audioCtx;
let nextPlayTime = 0; 
let isPlaying = false;

// --- Player State Management ---
function resetPlayerForNewSong(newSongName) {
    currentSongFolder = newSongName; 
    chunkIndex = 0;                  
    parsedPlaylists = {};            
    isPlaying = false;               
    
    document.getElementById('startBtn').disabled = false;
    document.getElementById('logContainer').innerHTML = ""; 
    document.getElementById('bitrateDisplay').innerText = "Ready";
    fakeBandwidth = 50; // Reset cold start

    qoeSwitches = 0;
    qoeStalls = 0;
    totalBitrateSum = 0;
    chunksPlayed = 0;
    lastTargetBitrate = null;
    updateQoEDashboard(0, 0, 0);
}

// --- UI Loop ---
setInterval(async () => {
    if (!isPlaying) return;

    // IF REAL BANDWIDTH IS CHECKED: Skip the C++ request, just update the graph
    if (document.getElementById('realBandwidthToggle') && document.getElementById('realBandwidthToggle').checked) {
        updateGraph(fakeBandwidth, currentBitrate); 
        return; 
    }
    
    // IF CHECKBOX IS OFF: Ask C++ for simulated data
    try {
        const response = await fetch('http://localhost:8080/api/network_status');
        const data = await response.json();
        
        fakeBandwidth = data.bandwidth; 
        
        document.getElementById('bandwidthDisplay').innerText = `${fakeBandwidth} kbps (SIMULATED)`;
        document.getElementById('bandwidthDisplay').style.color = "#4ade80"; 
        updateGraph(fakeBandwidth, currentBitrate);
        
    } catch (error) {
        console.error("Lost connection to C++ server!", error);
    }
}, 1000);

function calculateNextBitrate() {
    const safeBandwidth = fakeBandwidth * SAFETY_MARGIN;
    let bestBitrate = AVAILABLE_BITRATES[0]; 
    for (let i = 0; i < AVAILABLE_BITRATES.length; i++) {
        if (AVAILABLE_BITRATES[i] <= safeBandwidth) bestBitrate = AVAILABLE_BITRATES[i];
        else break; 
    }
    return bestBitrate;
}

// --- Core Streaming Engine ---
async function fetchAndScheduleNextChunk() {
    if (!isPlaying) return;

    const timeUntilQueueEmpty = nextPlayTime - audioCtx.currentTime;
    
    // INCREASED BUFFER: Wait until queue has less than 8 seconds (holds 4 chunks safely)
    if (timeUntilQueueEmpty < 8) {
        const targetBitrate = calculateNextBitrate();
        const nextChunkFileName = await getChunkFilenameFromManifest(currentSongFolder, targetBitrate, chunkIndex, parsedPlaylists);

        if (!nextChunkFileName) {
            console.log("End of manifest reached. Playback complete.");
            isPlaying = false;
            document.getElementById('startBtn').disabled = false;
            return;
        }

        const fileUrl = `/audio/${currentSongFolder}/${targetBitrate}k/${nextChunkFileName}`;

        try {
            const startTime = performance.now();
            const controller = new AbortController();
            const signal = controller.signal;

            // --- 1. THE WATCHDOG TIMER ---
            // If Chrome holds the request hostage for more than 2.5 seconds, KILL IT!
            const watchdogTimer = setTimeout(() => {
                if (targetBitrate > AVAILABLE_BITRATES[0]) {
                    console.warn(`[WATCHDOG] Network frozen! Aborting ${targetBitrate}k chunk!`);
                    fakeBandwidth = 50; // Instantly panic the global math!
                    updateGraph(fakeBandwidth, currentBitrate); // Force graph to drop NOW
                    controller.abort(); 
                }
            }, 2500);

            const response = await fetch(fileUrl, { signal });
            if (!response.ok) throw new Error("File not found");

            const reader = response.body.getReader();
            let receivedLength = 0; 
            let chunks = []; 
            let firstByteTime = null; 
            
            while(true) {
                const {done, value} = await reader.read();
                if (done) break; 

                if (!firstByteTime) firstByteTime = performance.now(); 

                chunks.push(value);
                receivedLength += value.length;

                const currentTime = performance.now();
                const elapsedSeconds = (currentTime - firstByteTime) / 1000;
                
                if (elapsedSeconds > 0.05) { 
                    const currentSpeedKbps = Math.round(((receivedLength * 8) / elapsedSeconds) / 1000);
                    document.getElementById('bandwidthDisplay').innerText = `${currentSpeedKbps} kbps (STREAMING)`;
                    document.getElementById('bandwidthDisplay').style.color = "#fbbf24"; 

                    if (currentSpeedKbps < (targetBitrate * 0.6) && targetBitrate > AVAILABLE_BITRATES[0]) {
                        console.warn(`[ABORT] Speed dropped to ${currentSpeedKbps}kbps. Aborting ${targetBitrate}k chunk!`);
                        fakeBandwidth = currentSpeedKbps; 
                        controller.abort(); 
                        break; 
                    }
                }
            }

            // WE SURVIVED! The chunk downloaded successfully, so cancel the Watchdog.
            clearTimeout(watchdogTimer);

            if (controller.signal.aborted) {
                setTimeout(fetchAndScheduleNextChunk, 10);
                return; 
            }

            const arrayBuffer = new Uint8Array(receivedLength);
            let position = 0;
            for(let chunk of chunks) {
                arrayBuffer.set(chunk, position);
                position += chunk.length;
            }

            const endTime = performance.now();
            const exactFileSizeBytes = arrayBuffer.byteLength;

            const isRealBandwidthEnabled = document.getElementById('realBandwidthToggle') && document.getElementById('realBandwidthToggle').checked;
            
            if (isRealBandwidthEnabled) {
                let downloadTimeSeconds = (endTime - startTime) / 1000;
                downloadTimeSeconds = Math.max(downloadTimeSeconds, 0.001); // Infinity bug fix

                const fileSizeBits = exactFileSizeBytes * 8;
                const calculatedKbps = Math.round((fileSizeBits / downloadTimeSeconds) / 1000);

                // --- 2. INSTANT PANIC MATH ---
                if (fakeBandwidth === 50) { 
                    fakeBandwidth = calculatedKbps; 
                } else if (calculatedKbps < fakeBandwidth) {
                    // THE FIX: Drop instantly! Do not use the 80% history on a slow network.
                    fakeBandwidth = calculatedKbps; 
                } else {
                    // CAUTIOUS RISE: Upgrade safely using history
                    fakeBandwidth = Math.round((fakeBandwidth * 0.8) + (calculatedKbps * 0.2)); 
                }

                document.getElementById('bandwidthDisplay').innerText = `${fakeBandwidth} kbps (REAL)`;
                document.getElementById('bandwidthDisplay').style.color = "#a855f7"; 
            }

            const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.buffer);
            const exactDurationSeconds = audioBuffer.duration;
            const actualChunkKbps = Math.round((exactFileSizeBytes * 8) / exactDurationSeconds / 1000);

            const source = audioCtx.createBufferSource();
            source.buffer = audioBuffer;
        
            const gainNode = audioCtx.createGain();
            source.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            if (nextPlayTime < audioCtx.currentTime) {
                if (chunkIndex > 0 && (audioCtx.currentTime - nextPlayTime) > 0.05) {
                    qoeStalls++; 
                }
                nextPlayTime = audioCtx.currentTime + 0.1; 
            }

            if (lastTargetBitrate !== null && lastTargetBitrate !== targetBitrate) {
                qoeSwitches++;
            }
            lastTargetBitrate = targetBitrate;

            totalBitrateSum += actualChunkKbps;
            chunksPlayed++;
            const avgBitrate = Math.round(totalBitrateSum / chunksPlayed);

            updateQoEDashboard(qoeSwitches, qoeStalls, avgBitrate);

            gainNode.gain.setValueAtTime(0, nextPlayTime);
            gainNode.gain.linearRampToValueAtTime(1, nextPlayTime + CROSSFADE_TIME);
            
            const chunkEndTime = nextPlayTime + audioBuffer.duration;
            gainNode.gain.setValueAtTime(1, chunkEndTime - CROSSFADE_TIME);
            gainNode.gain.linearRampToValueAtTime(0, chunkEndTime);

            source.start(nextPlayTime);
            nextPlayTime += (audioBuffer.duration - CROSSFADE_TIME);

            currentBitrate = actualChunkKbps; 
            logAndDisplay(actualChunkKbps, chunkIndex, targetBitrate);
            chunkIndex++;

        } catch (error) {
            if (error.name === 'AbortError') {
                console.warn(`[RECOVERY] Download aborted cleanly. Retrying immediately...`);
                setTimeout(fetchAndScheduleNextChunk, 10);
                return; 
            }

            logError(`Playback Stopped. Error: ${error.message}`);
            console.error("Audio Pipeline Error:", error);
            isPlaying = false;
            document.getElementById('startBtn').disabled = false;
            return;
        }
    }

    setTimeout(fetchAndScheduleNextChunk, 300);
}


// --- Event Listeners and Upload ---
document.getElementById('startBtn').addEventListener('click', () => {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    isPlaying = true;
    nextPlayTime = audioCtx.currentTime; 
    document.getElementById('startBtn').disabled = true;
    
    fetchAndScheduleNextChunk(); 
});

window.uploadAndEncode = () => {
    uploadAndEncode((songName) => {
        resetPlayerForNewSong(songName);
    });
};