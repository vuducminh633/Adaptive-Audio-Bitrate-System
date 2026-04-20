🛠 Prerequisites
Before running the project, ensure you have the following installed on your system:

C++ Compiler: g++ or clang++ (must support C++11 or higher).

FFmpeg: Required for backend audio transcoding.

Windows: Download from gyan.dev and add to your system PATH.

macOS: brew install ffmpeg

Linux (Ubuntu): sudo apt install ffmpeg

cpp-httplib: (Assuming standard single-header HTTP library used for the C++ server).

🚀 Installation & Setup
1. Clone the Repository
Bash
git clone [https://github.com/yourusername/gapless-abr-player.git](https://github.com/yourusername/gapless-abr-player.git)
cd gapless-abr-player
2. Compile the Backend Server
Navigate to the root directory and compile the C++ server.
(Note: If you are using cpp-httplib, ensure your environment is set up or the header is included in your backend directory).

Linux / macOS:

Bash
g++ -std=c++11 backend/main.cpp -o server -lpthread
Windows (MinGW):

Bash
g++ -std=c++11 backend/main.cpp -o server.exe -lws2_32
3. Run the Server
Start the backend server, which will automatically host the frontend files on port 8080.

Bash
./server
4. Launch the Dashboard
Open your Google Chrome browser (recommended for precise DevTools network throttling) and navigate to:

Plaintext
http://localhost:8080
🧪 How to Test the ABR Engine
To see the enterprise-level network adaptation in action, you will need to torture-test the player using Chrome DevTools.

Upload Audio: Use the UI to upload an .mp3 or .wav file. The server will run FFmpeg to generate the 64k, 128k, and 256k folders. Wait for the success message.

Start Playback: Click "Start Playback". You will see the blue line rise as the player buffers.

Open DevTools: Press F12 (or Cmd+Option+I on Mac) and navigate to the Network tab.

Throttle the Network: Click the "No throttling" dropdown and select Slow 3G or a custom 100kbps profile.

Watch the Kill Switch: * Look at the console to see the [ABORT] warning.

Watch the QoE dashboard — the graph will plummet instantly, but the Stalls counter will remain at 0 as the audio flawlessly switches to 64k.

⚠️ Known Limitations
Browser Tab Sleeping: Modern browsers aggressively throttle JavaScript setTimeout loops in inactive background tabs. For the most accurate ABR mathematical rendering, keep the dashboard tab active or in its own window.

TCP "One Gulp" Behavior: On localhost with no throttling, 2-second chunks (approx. 40kB) transfer instantly through the OS network buffer. The math accounts for this using a Math.max() safety threshold to prevent Infinity kbps calculations.

