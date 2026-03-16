const SUBGRAPH_URL = "https://api.studio.thegraph.com/query/1744392/openttt-base-sepolia/v0.2.0";

const QUERY = `
{
  poTAnchors(first: 100, orderBy: timestamp, orderDirection: desc) {
    id
    stratum
    timestamp
    txHash
  }
}
`;

async function fetchData() {
    try {
        const response = await fetch(SUBGRAPH_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: QUERY })
        });
        const result = await response.json();
        return result.data.poTAnchors;
    } catch (error) {
        console.error("Failed to fetch data from subgraph:", error);
        return [];
    }
}

function updateStats(anchors) {
    document.getElementById('total-pots').textContent = anchors.length;
    // Mocking active builders for demo
    document.getElementById('active-builders').textContent = Math.ceil(anchors.length / 5);
}

function updateTable(anchors) {
    const tbody = document.querySelector('#tx-table tbody');
    tbody.innerHTML = '';
    
    anchors.slice(0, 10).forEach(anchor => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${anchor.id.substring(0, 8)}...</td>
            <td>${mapStratum(anchor.stratum)}</td>
            <td>${new Date(parseInt(anchor.timestamp) * 1000).toLocaleString()}</td>
            <td><a href="https://sepolia.etherscan.io/tx/${anchor.txHash}" target="_blank" style="color:#58a6ff">${anchor.txHash.substring(0, 10)}...</a></td>
        `;
        tbody.appendChild(tr);
    });
}

function mapStratum(stratum) {
    // Basic mapping based on tokenId / stratum ranges or values
    // In demo, we'll randomize for visual variety if values are identical
    const s = parseInt(stratum);
    if (s % 3 === 0) return "DEX (v4 Hook)";
    if (s % 3 === 1) return "Mint (Direct)";
    return "MCP (Server)";
}

function renderCharts(anchors) {
    // Channel Breakdown
    const counts = { DEX: 0, Mint: 0, MCP: 0 };
    anchors.forEach(a => {
        const label = mapStratum(a.stratum);
        if (label.includes("DEX")) counts.DEX++;
        else if (label.includes("Mint")) counts.Mint++;
        else counts.MCP++;
    });

    new Chart(document.getElementById('channelChart'), {
        type: 'doughnut',
        data: {
            labels: ['DEX', 'Mint', 'MCP'],
            datasets: [{
                data: [counts.DEX, counts.Mint, counts.MCP],
                backgroundColor: ['#58a6ff', '#238636', '#d29922']
            }]
        },
        options: { plugins: { legend: { labels: { color: '#c9d1d9' } } } }
    });

    // Time Series
    const timeData = anchors.map(a => ({
        x: new Date(parseInt(a.timestamp) * 1000),
        y: 1
    })).reverse();

    // Group by minute for chart
    const grouped = {};
    timeData.forEach(d => {
        const key = d.x.toISOString().substring(0, 16);
        grouped[key] = (grouped[key] || 0) + 1;
    });

    new Chart(document.getElementById('timeSeriesChart'), {
        type: 'line',
        data: {
            labels: Object.keys(grouped),
            datasets: [{
                label: 'Anchors per Minute',
                data: Object.values(grouped),
                borderColor: '#58a6ff',
                tension: 0.1,
                fill: true,
                backgroundColor: 'rgba(88, 166, 255, 0.1)'
            }]
        },
        options: {
            scales: {
                x: { ticks: { color: '#8b949e' }, grid: { color: '#30363d' } },
                y: { ticks: { color: '#8b949e' }, grid: { color: '#30363d' } }
            },
            plugins: { legend: { labels: { color: '#c9d1d9' } } }
        }
    });
}

async function init() {
    const anchors = await fetchData();
    if (anchors.length > 0) {
        updateStats(anchors);
        updateTable(anchors);
        renderCharts(anchors);
    } else {
        // Fallback for empty data
        document.getElementById('total-pots').textContent = "0";
        document.getElementById('active-builders').textContent = "0";
    }
}

init();
