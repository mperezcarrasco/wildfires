// Map configuration
const MAP_CENTER = [-37.5, -72.5];
const MAP_ZOOM = 8;
const REFRESH_INTERVAL = 600000; // 10 minutes in milliseconds

// Initialize map
const map = L.map('map').setView(MAP_CENTER, MAP_ZOOM);

// Add OpenStreetMap base layer
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | Datos: NASA FIRMS'
}).addTo(map);

// VIII Region bounds for visual reference
const regionBounds = [
    [-36.0, -73.5],
    [-36.0, -71.0],
    [-38.5, -71.0],
    [-38.5, -73.5]
];

L.polygon(regionBounds, {
    color: '#666',
    weight: 2,
    fillOpacity: 0,
    dashArray: '5, 5'
}).addTo(map);

// Heat layer (will be populated with fire data)
let heatLayer = null;

// Marker layer for high-intensity fires
let markerLayer = L.layerGroup().addTo(map);

// Countdown timer
let countdownSeconds = 600;
let countdownInterval = null;

// DOM elements
const loadingEl = document.getElementById('loading');
const fireCountEl = document.getElementById('fire-count');
const lastUpdateEl = document.getElementById('last-update');
const nextUpdateEl = document.getElementById('next-update');
const statusMessageEl = document.getElementById('status-message');

/**
 * Show or hide loading spinner
 */
function setLoading(show) {
    loadingEl.classList.toggle('active', show);
}

/**
 * Show status message
 */
function showStatus(message, type) {
    statusMessageEl.textContent = message;
    statusMessageEl.className = 'status-message ' + type;
}

/**
 * Clear status message
 */
function clearStatus() {
    statusMessageEl.className = 'status-message';
}

/**
 * Format timestamp for display
 */
function formatTimestamp(isoString) {
    const date = new Date(isoString);
    return date.toLocaleString('es-CL', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit'
    });
}

/**
 * Update countdown timer display
 */
function updateCountdown() {
    const minutes = Math.floor(countdownSeconds / 60);
    const seconds = countdownSeconds % 60;
    nextUpdateEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    countdownSeconds--;

    if (countdownSeconds < 0) {
        countdownSeconds = 600;
    }
}

/**
 * Start countdown timer
 */
function startCountdown() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }
    countdownSeconds = 600;
    updateCountdown();
    countdownInterval = setInterval(updateCountdown, 1000);
}

/**
 * Calculate heat intensity from FRP value
 * Normalize FRP to 0-1 range for heatmap
 */
function calculateIntensity(frp) {
    // FRP typically ranges from 0 to 500+ MW
    // Normalize to 0-1 with a cap at 100 MW
    const normalized = Math.min(frp / 100, 1);
    return Math.max(normalized, 0.2); // Minimum intensity of 0.2
}

/**
 * Create popup content for fire marker
 */
function createPopupContent(fire) {
    const confidenceText = fire.confidence === 'h' ? 'Alta (saturación del sensor)' : 'Nominal (>15K anomalía)';
    return `
        <div class="fire-popup">
            <strong>Anomalía Térmica</strong><br>
            <strong>FRP: ${fire.frp.toFixed(1)} MW</strong><br>
            Detección: ${fire.acq_datetime_chile} (Chile)<br>
            Satélite: ${fire.satellite}<br>
            Confianza: ${confidenceText}<br>
            Período: ${fire.daynight}
        </div>
    `;
}

/**
 * Fetch fire data from API and update map
 */
async function updateHeatmap() {
    console.log(`[${new Date().toISOString()}] Fetching fire data...`);
    setLoading(true);
    clearStatus();

    try {
        const response = await fetch('/api/fires');

        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }

        const data = await response.json();

        if (data.error) {
            showStatus(data.error, 'error');
            setLoading(false);
            return;
        }

        // Update fire count
        fireCountEl.textContent = data.count;

        // Update last update timestamp
        lastUpdateEl.textContent = formatTimestamp(data.timestamp);

        // Show cached data warning
        if (data.cached) {
            showStatus('Mostrando datos en caché', 'warning');
        }

        // Clear existing layers
        if (heatLayer) {
            map.removeLayer(heatLayer);
        }
        markerLayer.clearLayers();

        // Prepare heatmap data
        const heatData = data.fires.map(fire => [
            fire.latitude,
            fire.longitude,
            calculateIntensity(fire.frp)
        ]);

        // Create heat layer
        if (heatData.length > 0) {
            heatLayer = L.heatLayer(heatData, {
                radius: 25,
                blur: 15,
                maxZoom: 10,
                gradient: {
                    0.0: 'blue',
                    0.25: 'cyan',
                    0.5: 'lime',
                    0.75: 'yellow',
                    1.0: 'red'
                }
            }).addTo(map);

            // Add markers for high-intensity fires (FRP > 50 MW)
            data.fires
                .filter(fire => fire.frp > 50)
                .forEach(fire => {
                    const marker = L.circleMarker([fire.latitude, fire.longitude], {
                        radius: 8,
                        fillColor: '#d32f2f',
                        color: '#fff',
                        weight: 2,
                        fillOpacity: 0.8
                    });

                    marker.bindPopup(createPopupContent(fire));
                    markerLayer.addLayer(marker);
                });
        }

        console.log(`[${new Date().toISOString()}] Updated map with ${data.count} fires`);

        // Reset countdown
        startCountdown();

    } catch (error) {
        console.error('Error fetching fire data:', error);
        showStatus('Error al cargar datos. Reintentando...', 'error');
    }

    setLoading(false);
}

// Initial load
updateHeatmap();

// Auto-refresh every 10 minutes
setInterval(updateHeatmap, REFRESH_INTERVAL);

// Start countdown timer
startCountdown();
