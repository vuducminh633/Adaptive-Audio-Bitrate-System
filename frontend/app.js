
const AVAILABLE_BITRATES = [64, 128, 256]; 
const SAFETY_MARGIN = 0.8;
        
let fakeBandwidth = 300; 
let currentBitrate = 0;
let chunkIndex = 0; 

// Web Audio API State
let audioCtx;
let nextPlayTime = 0; // The exact timeline second the next chunk should start
let isPlaying = false;

const CROSSFADE_TIME = 0.01;

const ctx = document.getElementById('bitrateChart').getContext('2d');
const maxDataPoints = 30; // Keep the last 30 seconds on screen

const chart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: Array(maxDataPoints).fill(''), // X-axis (Time)
        datasets: [
            {
                label: 'Network Bandwidth (kbps)',
                borderColor: '#4ade80', // Green
                backgroundColor: 'rgba(74, 222, 128, 0.1)',
                data: Array(maxDataPoints).fill(0),
                fill: true,
                tension: 0.3
            },
            {
                label: 'Selected Audio Bitrate (kbps)',
                borderColor: '#60a5fa', // Blue
                backgroundColor: 'rgba(96, 165, 250, 0.1)',
                data: Array(maxDataPoints).fill(0),
                stepped: true, // Makes it look like distinct steps instead of curves
                fill: true
            }
        ]
    },
    options: {
        responsive: true,
        animation: false, // Turn off animations for real-time performance
        scales: {
            y: { beginAtZero: true, max: 500 },
            x: { display: false } // Hide x-axis labels to keep it clean
        },
        plugins: {
            legend: { labels: { color: 'white' } }
        }
    }
});


function updateGraph(bandwidth, bitrate) {
    // Remove the oldest data point (from the left)
    chart.data.datasets[0].data.shift();
    chart.data.datasets[1].data.shift();

    // Add the newest data point (to the right)
    chart.data.datasets[0].data.push(bandwidth);
    chart.data.datasets[1].data.push(bitrate);

    chart.update();
}


// Fluctuates the bandwidth independently every 1 second
setInterval(async () => {
    if (!isPlaying) return;
    
    try {
        // Fetch the JSON from your C++ API
        const response = await fetch('http://localhost:8080/api/network_status');
        const data = await response.json();
        
        // Update  global variable with the C++ server's data
        fakeBandwidth = data.bandwidth; 
        
        document.getElementById('bandwidthDisplay').innerText = `${fakeBandwidth} kbps`;
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

async function fetchAndScheduleNextChunk() {
    if (!isPlaying) return;

    const timeUntilQueueEmpty = nextPlayTime - audioCtx.currentTime;
    
    if (timeUntilQueueEmpty < 3) {
        const targetBitrate = calculateNextBitrate();
        const fileIndexStr = String(chunkIndex).padStart(3, '0');
        const fileUrl = `/audio/${targetBitrate}k/chunk_${fileIndexStr}.m4a`; 

        try {
            const response = await fetch(fileUrl);
            if (!response.ok) throw new Error("File not found");
            
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    
            const source = audioCtx.createBufferSource();
            source.buffer = audioBuffer;
        
            const gainNode = audioCtx.createGain();
            source.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            // If we fell behind, start immediately
            if (nextPlayTime < audioCtx.currentTime) {
                nextPlayTime = audioCtx.currentTime + 0.1; 
            }

            // Start volume at 0
            gainNode.gain.setValueAtTime(0, nextPlayTime);
        
            gainNode.gain.linearRampToValueAtTime(1, nextPlayTime + CROSSFADE_TIME);
            
        
            const chunkEndTime = nextPlayTime + audioBuffer.duration;
            gainNode.gain.setValueAtTime(1, chunkEndTime - CROSSFADE_TIME);
            // Fade down to 0 over the last 50ms
            gainNode.gain.linearRampToValueAtTime(0, chunkEndTime);

            source.start(nextPlayTime);
            
            
            nextPlayTime += (audioBuffer.duration - CROSSFADE_TIME);

            logAndDisplay(targetBitrate, fileIndexStr);
            chunkIndex++;

        } catch (error) {
            logError(`Playback ended or file missing: ${fileUrl}`);
            isPlaying = false;
            document.getElementById('startBtn').disabled = false;
            return;
        }
    }

    setTimeout(fetchAndScheduleNextChunk, 300);
}

// Browsers require a physical click before they allow audio to play
document.getElementById('startBtn').addEventListener('click', () => {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Resume context if browser suspended it
    if (audioCtx.state === 'suspended') audioCtx.resume();

    isPlaying = true;
    nextPlayTime = audioCtx.currentTime; // Reset timeline
    document.getElementById('startBtn').disabled = true;
    
    fetchAndScheduleNextChunk(); // Kick off the loop
});

function logAndDisplay(bitrate, index) {
    currentBitrate = bitrate;

    document.getElementById('bitrateDisplay').innerText = `${bitrate} kbps`;
    const logDiv = document.getElementById('logContainer');
    const time = new Date().toLocaleTimeString();
    logDiv.insertAdjacentHTML('afterbegin', `<div class="log-entry">[${time}] Queued chunk_${index}.mp3 at <strong>${bitrate}kbps</strong> (Bandwidth: ${fakeBandwidth}kbps)</div>`);


}

function logError(msg) {
    const logDiv = document.getElementById('logContainer');
    logDiv.insertAdjacentHTML('afterbegin', `<div class="log-entry" style="color: #f87171;">${msg}</div>`);
}