const ctx = document.getElementById('bitrateChart').getContext('2d');
const maxDataPoints = 30;

const chart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: Array(maxDataPoints).fill(''), 
        datasets: [
            {
                label: 'Network Bandwidth (kbps)',
                borderColor: '#4ade80', 
                backgroundColor: 'rgba(74, 222, 128, 0.1)',
                data: Array(maxDataPoints).fill(0),
                fill: true,
                tension: 0.3
            },
            {
                label: 'Actual Audio Density (kbps)', // Updated the label!
                borderColor: '#60a5fa', 
                backgroundColor: 'rgba(96, 165, 250, 0.1)',
                data: Array(maxDataPoints).fill(0),
                fill: true,
                tension: 0.3,       // Swapped 'stepped: true' for 'tension: 0.3'
                pointRadius: 3      // Adds little dots where the new chunks arrive
            }
        ]
    },
    options: {
        responsive: true,
        animation: false, 
        scales: {
            y: { beginAtZero: true, max: 500 },
            x: { display: false } 
        },
        plugins: {
            legend: { labels: { color: 'white' } }
        }
    }
});

export function updateGraph(bandwidth, bitrate) {
    chart.data.datasets[0].data.shift();
    chart.data.datasets[1].data.shift();
    chart.data.datasets[0].data.push(bandwidth);
    chart.data.datasets[1].data.push(bitrate);
    chart.update();
}

export function logAndDisplay(actualVbrBitrate, index, targetFolderBitrate) {
    document.getElementById('bitrateDisplay').innerText = `${actualVbrBitrate} kbps`;
    
    const logDiv = document.getElementById('logContainer');
    const time = new Date().toLocaleTimeString();
    logDiv.insertAdjacentHTML('afterbegin', `<div class="log-entry">[${time}] Queued chunk_${index}.m4a from <strong>${targetFolderBitrate}k folder</strong> (Actual file density: ${actualVbrBitrate} kbps)</div>`);
}

export function logError(msg) {
    const logDiv = document.getElementById('logContainer');
    logDiv.insertAdjacentHTML('afterbegin', `<div class="log-entry" style="color: #f87171;">${msg}</div>`);
}

export function updateQoEDashboard(switches, stalls, avgBitrate) {
    document.getElementById('qoeSwitches').innerText = switches;
    document.getElementById('qoeStalls').innerText = stalls;
    document.getElementById('qoeAvg').innerText = `${avgBitrate} kbps`;
}