const SUBGRAPH_URL = "https://api.studio.thegraph.com/query/1744392/openttt-base-sepolia/v0.2.0";

const QUERY = `
{
  _meta {
    block {
      number
    }
  }
  poTAnchors(first: 1000, orderBy: timestamp, orderDirection: desc) {
    id
    stratum
    timestamp
    txHash
    blockNumber
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
        const anchors = result.data.poTAnchors;
        const totalCount = anchors.length;
        // If we hit the 1000 limit, display "1000+" to signal truncation
        const displayCount = totalCount >= 1000 ? "1000+" : totalCount;
        return {
            anchors,
            totalCount,
            displayCount
        };
    } catch (error) {
        console.error("Failed to fetch data from subgraph:", error);
        return { anchors: [], totalCount: 0, displayCount: 0 };
    }
}

function updateStats(data) {
    const { anchors, displayCount } = data;

    // Item 6: Show "1000+" if at limit
    document.getElementById('total-pots').textContent = displayCount;

    // Item 2: grgHash not available in schema — use unique txHash as "Unique GRG Proofs"
    // txHash is unique per tx, so this gives a meaningful unique-proof count
    const uniqueGRGProofs = new Set(anchors.map(a => a.txHash)).size;
    document.getElementById('active-builders').textContent = uniqueGRGProofs;
}

function updateTable(anchors) {
    const tbody = document.querySelector('#tx-table tbody');
    tbody.innerHTML = '';

    anchors.slice(0, 10).forEach(anchor => {
        const tr = document.createElement('tr');
        // Item 1: basescan link; Item 4: clickable tx hash + blockNumber column
        const shortHash = anchor.txHash ? anchor.txHash.substring(0, 10) + '...' : 'N/A';
        const basescanUrl = `https://sepolia.basescan.org/tx/${anchor.txHash}`;
        const blockNum = anchor.blockNumber ? anchor.blockNumber : '—';
        tr.innerHTML = `
            <td>${anchor.id.substring(0, 8)}...</td>
            <td>${mapStratum(anchor.stratum)}</td>
            <td>${new Date(parseInt(anchor.timestamp) * 1000).toLocaleString()}</td>
            <td><a href="${basescanUrl}" target="_blank" rel="noopener noreferrer" style="color:#58a6ff">${shortHash}</a></td>
            <td>${blockNum}</td>
        `;
        tbody.appendChild(tr);
    });
}

// Item 5: Rename "Channel" → "PoT Type"; keep stratum-level label as "Stratum Level"
function mapStratum(stratum) {
    const s = BigInt(stratum);
    // Stratum levels — labelled clearly to avoid NTP confusion
    if (s < 1000n) return "Stratum Level 0";
    if (s < 1000000n) return "Stratum Level 1";
    return "Stratum Level 2";
}

function renderCharts(anchors) {
    // Item 5: "PoT Type" breakdown (was "Channel Breakdown")
    const counts = { "Level 0": 0, "Level 1": 0, "Level 2": 0 };
    anchors.forEach(a => {
        const label = mapStratum(a.stratum);
        if (label.includes("Level 0")) counts["Level 0"]++;
        else if (label.includes("Level 1")) counts["Level 1"]++;
        else counts["Level 2"]++;
    });

    const ctxChannel = document.getElementById('channelChart');
    if (window.channelChartInst) window.channelChartInst.destroy();
    window.channelChartInst = new Chart(ctxChannel, {
        type: 'doughnut',
        data: {
            labels: ['Stratum L0', 'Stratum L1', 'Stratum L2'],
            datasets: [{
                data: [counts["Level 0"], counts["Level 1"], counts["Level 2"]],
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

    const grouped = {};
    timeData.forEach(d => {
        const key = d.x.toISOString().substring(0, 16);
        grouped[key] = (grouped[key] || 0) + 1;
    });

    const ctxTime = document.getElementById('timeSeriesChart');
    if (window.timeChartInst) window.timeChartInst.destroy();
    window.timeChartInst = new Chart(ctxTime, {
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
    const data = await fetchData();
    if (data.anchors.length > 0) {
        updateStats(data);
        updateTable(data.anchors);
        renderCharts(data.anchors);
    } else {
        document.getElementById('total-pots').textContent = "0";
        document.getElementById('active-builders').textContent = "0";
    }
}

init();
setInterval(init, 10000); // Item 3: Auto-refresh every 10s (was 30s)
