// Add parameters so app.js can pass its variables into this file!
export async function getChunkFilenameFromManifest(currentSongFolder, bitrate, index, parsedPlaylists) {
    if (!parsedPlaylists[bitrate]) {
        const response = await fetch(`/audio/${currentSongFolder}/${bitrate}k/playlist.m3u8`);
        if (!response.ok) throw new Error(`Manifest for ${bitrate}k not found`);
        const text = await response.text();
        
        parsedPlaylists[bitrate] = text.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0 && !line.startsWith('#'))
            .map(line => line.split('/').pop()); 
    }
    return parsedPlaylists[bitrate][index];
}

// Add a callback parameter
export async function uploadAndEncode(onSuccessCallback) {
    const fileInput = document.getElementById('audioFileInput');
    const nameInput = document.getElementById('songNameInput');
    const statusText = document.getElementById('uploadStatus');

    if (!fileInput || fileInput.files.length === 0 || !nameInput || nameInput.value.trim() === "") {
        if(statusText) {
             statusText.innerText = "Error: Please provide a song name and select a file.";
             statusText.style.color = "#f87171";
        }
        return;
    }

    const safeSongName = nameInput.value.trim().replace(/\s+/g, '_').toLowerCase();
    const file = fileInput.files[0];

    statusText.innerText = "Uploading and Encoding... Please wait.";
    statusText.style.color = "#fbbf24";

    try {
        const arrayBuffer = await file.arrayBuffer();

        const response = await fetch('/api/upload', {
            method: 'POST',
            headers: {
                'X-Song-Name': safeSongName,
                'Content-Type': 'application/octet-stream'
            },
            body: arrayBuffer
        });

        if (response.ok) {
            statusText.innerText = `Success! "${safeSongName}" is ready.`;
            statusText.style.color = "#4ade80"; 
            
            // FIRE THE CALLBACK INSTEAD OF CALLING RESET DIRECTLY
            onSuccessCallback(safeSongName); 
        } else {
            const err = await response.text();
            throw new Error(err);
        }
    } catch (error) {
        statusText.innerText = "Upload failed: " + error.message;
        statusText.style.color = "#f87171"; 
    }
}