// main.cpp
#include "httplib.h"
#include <iostream>
#include <string>
#include <cstdlib>
#include <fstream>

int main() {
    httplib::Server svr;

    // REGISTER STREAMING MIME TYPES
    // Tell the server exactly how to identify HLS manifests
    svr.set_file_extension_and_mimetype_mapping("m3u8", "application/vnd.apple.mpegurl");
    
    svr.set_file_extension_and_mimetype_mapping("m4a", "audio/mp4");
    // ==========================================


    // Serve frontend files (HTML, JS, CSS)
    svr.set_mount_point("/", "../frontend");

    // Serve audio chunks
    svr.set_mount_point("/audio", "./audio_file");

    // Create an API endpoint for JS graph to fetch bandwidth
    int current_bandwidth = 300;
    
    svr.Get("/api/network_status", [&](const httplib::Request& req, httplib::Response& res) {
        // Fluctuate the bandwidth
        int change = (rand() % 101) - 50;
        current_bandwidth += change;
        if (current_bandwidth < 50) current_bandwidth = 50;
        if (current_bandwidth > 400) current_bandwidth = 400;

        // Send it back as a JSON string
        std::string json = "{\"bandwidth\": " + std::to_string(current_bandwidth) + "}";
        res.set_content(json, "application/json");

        
    });
    //Ingestion end point

    svr.Post("/api/upload", [&](const httplib::Request& req, httplib::Response& res) {
        
        // Read the song name from the Custom HTTP Header
        if (!req.has_header("X-Song-Name")) {
            res.status = 400;
            res.set_content("Missing X-Song-Name header", "text/plain");
            return;
        }

        std::string songName = req.get_header_value("X-Song-Name");
        std::cout << "\n[UPLOADER] Received file for song: " << songName << "\n";

        // The file is literally the entire body of the request!
        if (req.body.empty()) {
            res.status = 400;
            res.set_content("Audio file body is empty", "text/plain");
            return;
        }

        // Save the raw binary data directly to a temporary file
        std::string tempPath = "./temp_audio.tmp";
        std::ofstream ofs(tempPath, std::ios::binary);
        ofs << req.body;
        ofs.close();

        // Create the new folder architecture
        std::string baseDir = "./audio_file/" + songName;
        std::string mkdirCmd = "mkdir -p " + baseDir + "/64k " + baseDir + "/128k " + baseDir + "/256k";
        system(mkdirCmd.c_str());

        // Run FFmpeg
      std::cout << "[UPLOADER] Encoding 64k tier...\n";
        std::string cmd64 = "ffmpeg -y -i " + tempPath + " -af \"loudnorm,agate=threshold=-50dB\" -c:a aac -b:a 64k -maxrate 70k -bufsize 128k -f segment -segment_time 2 -segment_list \"" + baseDir + "/64k/playlist.m3u8\" \"" + baseDir + "/64k/chunk_%03d.m4a\"";
        system(cmd64.c_str());

        std::cout << "[UPLOADER] Encoding 128k tier...\n";
        std::string cmd128 = "ffmpeg -y -i " + tempPath + " -af \"loudnorm,agate=threshold=-50dB\" -c:a aac -b:a 128k -maxrate 140k -bufsize 256k -f segment -segment_time 2 -segment_list \"" + baseDir + "/128k/playlist.m3u8\" \"" + baseDir + "/128k/chunk_%03d.m4a\"";
        system(cmd128.c_str());

        std::cout << "[UPLOADER] Encoding 256k tier...\n";
        std::string cmd256 = "ffmpeg -y -i " + tempPath + " -af \"loudnorm,agate=threshold=-50dB\" -c:a aac -b:a 256k -maxrate 280k -bufsize 512k -f segment -segment_time 2 -segment_list \"" + baseDir + "/256k/playlist.m3u8\" \"" + baseDir + "/256k/chunk_%03d.m4a\"";
        system(cmd256.c_str());

        // Generate the master.m3u8 file
        std::cout << "[UPLOADER] Generating master.m3u8...\n";
        std::ofstream master(baseDir + "/master.m3u8");
        master << "#EXTM3U\n";
        master << "#EXT-X-STREAM-INF:BANDWIDTH=65536,CODECS=\"mp4a.40.2\"\n64k/playlist.m3u8\n";
        master << "#EXT-X-STREAM-INF:BANDWIDTH=131072,CODECS=\"mp4a.40.2\"\n128k/playlist.m3u8\n";
        master << "#EXT-X-STREAM-INF:BANDWIDTH=262144,CODECS=\"mp4a.40.2\"\n256k/playlist.m3u8\n";
        master.close();

        // Clean up
        std::string rmCmd = "rm " + tempPath;
        system(rmCmd.c_str());

        std::cout << "[UPLOADER] Successfully processed " << songName << "!\n";
        res.set_content("Success", "text/plain");
    });
    
    std::cout << "C++ ABR Server running at http://localhost:8080\n";
    svr.listen("0.0.0.0", 8080);

    return 0;
}