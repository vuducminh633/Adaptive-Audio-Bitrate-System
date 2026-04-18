// main.cpp
#include "httplib.h"
#include <iostream>
#include <string>
#include <cstdlib>

int main() {
    httplib::Server svr;

    // Serve your frontend files (HTML, JS, CSS)
    svr.set_mount_point("/", "../frontend");

    // Serve your audio chunks
    svr.set_mount_point("/audio", "./audio_file");

    // Create an API endpoint for your JS graph to fetch bandwidth
    int current_bandwidth = 300;
    
    svr.Get("/api/network_status", [&](const httplib::Request& req, httplib::Response& res) {
        // Fluctuate the bandwidth exactly like your JS did
        int change = (rand() % 101) - 50;
        current_bandwidth += change;
        if (current_bandwidth < 50) current_bandwidth = 50;
        if (current_bandwidth > 400) current_bandwidth = 400;

        // Send it back as a JSON string
        std::string json = "{\"bandwidth\": " + std::to_string(current_bandwidth) + "}";
        res.set_content(json, "application/json");
    });

    std::cout << "C++ ABR Server running at http://localhost:8080\n";
    svr.listen("localhost", 8080);

    return 0;
}