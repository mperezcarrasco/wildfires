// Map configuration
const MAP_CENTER = [-38.0, -72.5];
const MAP_ZOOM = 7;
const REFRESH_INTERVAL = 600000; // 10 minutes in milliseconds

// Initialize map
const map = L.map('map').setView(MAP_CENTER, MAP_ZOOM);

// Add OpenStreetMap base layer
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | Datos: NASA FIRMS'
}).addTo(map);

// VIII + IX Region (Biobío + Araucanía) bounds for visual reference
const regionBounds = [
    [-36.0, -73.5],
    [-36.0, -71.0],
    [-39.6, -71.0],
    [-39.6, -73.5]
];

L.polygon(regionBounds, {
    color: '#666',
    weight: 2,
    fillOpacity: 0,
    dashArray: '5, 5'
}).addTo(map);

// Data storage
let allFireData = [];
let filteredFireData = [];

// Layers
let heatLayer = null;
let markerLayer = L.layerGroup().addTo(map);
let trailLayer = L.layerGroup().addTo(map);

// Time control state
let selectedTimeWindow = 24; // hours
let currentSliderValue = 100; // percentage (100 = now)
let isPlaying = false;
let animationInterval = null;
let showTrail = false;

// Countdown timer
let countdownSeconds = 600;
let countdownInterval = null;

// DOM elements
const loadingEl = document.getElementById('loading');
const fireCountEl = document.getElementById('fire-count');
const lastUpdateEl = document.getElementById('last-update');
const nextUpdateEl = document.getElementById('next-update');
const statusMessageEl = document.getElementById('status-message');
const timeWindowEl = document.getElementById('time-window');
const timeSliderEl = document.getElementById('time-slider');
const timeDisplayEl = document.getElementById('time-display');
const timeOldestEl = document.getElementById('time-oldest');
const visibleCountEl = document.getElementById('visible-count');
const totalCountEl = document.getElementById('total-count');
const btnPlayEl = document.getElementById('btn-play');
const btnPauseEl = document.getElementById('btn-pause');
const btnResetEl = document.getElementById('btn-reset');
const showTrailEl = document.getElementById('show-trail');

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
 * Format timestamp for display in Chilean time (GMT-3)
 */
function formatTimestamp(isoString) {
    const date = new Date(isoString);
    return date.toLocaleString('es-CL', {
        timeZone: 'America/Santiago',
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit'
    });
}

/**
 * Format hours ago to human readable string
 */
function formatHoursAgo(hours) {
    if (hours < 1) {
        return `hace ${Math.round(hours * 60)} min`;
    } else if (hours < 24) {
        return `hace ${Math.round(hours)}h`;
    } else {
        const days = Math.floor(hours / 24);
        const remainingHours = Math.round(hours % 24);
        return `hace ${days}d ${remainingHours}h`;
    }
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
 */
function calculateIntensity(frp) {
    const normalized = Math.min(frp / 100, 1);
    return Math.max(normalized, 0.2);
}

/**
 * Get marker color based on relative age within the current window
 * @param {number} hoursAgo - absolute hours ago of the detection
 * @param {number} windowStart - the viewpoint (most recent point in window)
 */
function getMarkerColor(hoursAgo, windowStart) {
    // Calculate relative age within the 24-hour window
    const relativeAge = hoursAgo - windowStart; // 0 = just detected at viewpoint, 24 = oldest in window

    if (relativeAge <= 6) {
        return '#d32f2f'; // Recent - red
    } else if (relativeAge <= 12) {
        return '#ff9800'; // Medium - orange
    } else {
        return '#9e9e9e'; // Old - gray
    }
}

/**
 * Get marker opacity based on relative age within window
 * @param {number} hoursAgo - absolute hours ago of the detection
 * @param {number} windowStart - the viewpoint (most recent point in window)
 */
function getMarkerOpacity(hoursAgo, windowStart) {
    // Calculate relative age within the 24-hour window
    const relativeAge = hoursAgo - windowStart;
    // More recent (smaller relativeAge) = more opaque
    const normalizedAge = relativeAge / 24; // 0-1 within 24h window
    return Math.max(0.4, 1 - (normalizedAge * 0.6));
}

/**
 * Create popup content for fire marker
 */
function createPopupContent(fire) {
    const confidenceText = fire.confidence === 'h' ? 'Alta (saturación del sensor)' : 'Nominal (>15K anomalía)';
    const hoursAgoText = formatHoursAgo(fire.hours_ago);
    return `
        <div class="fire-popup">
            <strong>Anomalía Térmica</strong><br>
            <strong>FRP: ${fire.frp.toFixed(1)} MW</strong><br>
            Detección: ${fire.acq_datetime_chile} (Chile)<br>
            Antigüedad: ${hoursAgoText}<br>
            Satélite: ${fire.satellite}<br>
            Confianza: ${confidenceText}<br>
            Período: ${fire.daynight}
        </div>
    `;
}

/**
 * Filter fires based on time window and slider position
 *
 * Logic: At each timestep, show fires from that moment + previous 24 hours
 * - Slider at 100% = "now" -> show fires from 0 to 24 hours ago
 * - Slider at 50% (if window=48h) = "24h ago" -> show fires from 24 to 48 hours ago
 * - Slider at 0% (if window=48h) = "48h ago" -> show fires from 48 to 72 hours ago
 *
 * With "Show trail" enabled: show cumulative fires from viewpoint to oldest data
 */
function filterFiresByTime() {
    // viewpointHoursAgo = the "current moment" we're viewing
    // Slider 100% = now (0 hours ago), Slider 0% = oldest point (selectedTimeWindow hours ago)
    const viewpointHoursAgo = selectedTimeWindow * (1 - currentSliderValue / 100);

    // Always show a 24-hour window from the viewpoint
    const WINDOW_SIZE = 24; // hours
    const windowStart = viewpointHoursAgo; // most recent in the window

    filteredFireData = allFireData.filter(fire => {
        // Fire must be at least as old as the viewpoint (detected before or at viewpoint time)
        if (fire.hours_ago < windowStart) return false;

        if (showTrail) {
            // With trail: show ALL fires from viewpoint back to oldest available data
            return true;
        } else {
            // Without trail: show only fires within the 24-hour window
            const windowEnd = viewpointHoursAgo + WINDOW_SIZE;
            return fire.hours_ago <= windowEnd;
        }
    });

    // Update display
    updateTimeDisplay();
    updateMap();
}

/**
 * Update the time display label
 */
function updateTimeDisplay() {
    const viewpointHoursAgo = selectedTimeWindow * (1 - currentSliderValue / 100);

    if (currentSliderValue >= 98) {
        timeDisplayEl.textContent = 'Ahora';
    } else {
        timeDisplayEl.textContent = formatHoursAgo(viewpointHoursAgo);
    }

    // Update stats
    visibleCountEl.textContent = filteredFireData.length;

    // Update oldest label (the oldest viewpoint we can scrub to)
    timeOldestEl.textContent = formatHoursAgo(selectedTimeWindow);
}

/**
 * Update the map with filtered data
 */
function updateMap() {
    // Clear existing layers
    if (heatLayer) {
        map.removeLayer(heatLayer);
    }
    markerLayer.clearLayers();
    trailLayer.clearLayers();

    if (filteredFireData.length === 0) {
        fireCountEl.textContent = '0';
        return;
    }

    // Calculate the current viewpoint for color/opacity calculations
    const windowStart = selectedTimeWindow * (1 - currentSliderValue / 100);

    // Prepare heatmap data
    const heatData = filteredFireData.map(fire => [
        fire.latitude,
        fire.longitude,
        calculateIntensity(fire.frp)
    ]);

    // Create heat layer
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

    // Add markers for all fires with time-based styling
    filteredFireData.forEach(fire => {
        const color = getMarkerColor(fire.hours_ago, windowStart);
        const opacity = getMarkerOpacity(fire.hours_ago, windowStart);
        const radius = fire.frp > 50 ? 8 : 5;

        const marker = L.circleMarker([fire.latitude, fire.longitude], {
            radius: radius,
            fillColor: color,
            color: '#fff',
            weight: 1,
            fillOpacity: opacity
        });

        marker.bindPopup(createPopupContent(fire));

        // Calculate relative age for display logic
        const relativeAge = fire.hours_ago - windowStart;

        // Show markers for high-intensity fires or recent detections (within 6h of viewpoint)
        if (fire.frp > 50 || relativeAge <= 6) {
            markerLayer.addLayer(marker);
        } else if (showTrail) {
            trailLayer.addLayer(marker);
        }
    });

    // Update fire count
    fireCountEl.textContent = filteredFireData.length;
}

/**
 * Fetch fire data from API
 */
async function fetchFireData() {
    console.log(`[${new Date().toISOString()}] Fetching fire data...`);
    setLoading(true);
    clearStatus();

    // Calculate days needed: selectedTimeWindow + 24 hours (for the sliding window)
    // e.g., if window=48h, we need 48+24=72 hours = 3 days
    const totalHoursNeeded = selectedTimeWindow + 24;
    const daysNeeded = Math.ceil(totalHoursNeeded / 24);

    try {
        const response = await fetch(`/api/fires?days=${daysNeeded}`);

        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }

        const data = await response.json();

        if (data.error) {
            showStatus(data.error, 'error');
            setLoading(false);
            return;
        }

        // Store all fire data
        allFireData = data.fires;

        // Update total count
        totalCountEl.textContent = allFireData.length;

        // Update last update timestamp
        lastUpdateEl.textContent = formatTimestamp(data.timestamp);

        // Show cached data warning
        if (data.cached) {
            showStatus('Mostrando datos en caché', 'warning');
        }

        console.log(`[${new Date().toISOString()}] Received ${data.count} detections (${daysNeeded} days)`);

        // Apply time filter and update map
        filterFiresByTime();

        // Reset countdown
        startCountdown();

    } catch (error) {
        console.error('Error fetching fire data:', error);
        showStatus('Error al cargar datos. Reintentando...', 'error');
    }

    setLoading(false);
}

/**
 * Start animation playback
 */
function startAnimation() {
    if (isPlaying) return;

    isPlaying = true;
    btnPlayEl.disabled = true;
    btnPauseEl.disabled = false;

    // Reset to beginning if at end
    if (currentSliderValue >= 100) {
        currentSliderValue = 0;
        timeSliderEl.value = 0;
    }

    animationInterval = setInterval(() => {
        currentSliderValue += 2; // Increment by 2%

        if (currentSliderValue >= 100) {
            currentSliderValue = 100;
            stopAnimation();
        }

        timeSliderEl.value = currentSliderValue;
        filterFiresByTime();
    }, 200); // Update every 200ms
}

/**
 * Stop animation playback
 */
function stopAnimation() {
    isPlaying = false;
    btnPlayEl.disabled = false;
    btnPauseEl.disabled = true;

    if (animationInterval) {
        clearInterval(animationInterval);
        animationInterval = null;
    }
}

/**
 * Reset animation to beginning
 */
function resetAnimation() {
    stopAnimation();
    currentSliderValue = 0;
    timeSliderEl.value = 0;
    filterFiresByTime();
}

// Event Listeners

// Time window selector
timeWindowEl.addEventListener('change', (e) => {
    selectedTimeWindow = parseInt(e.target.value);
    fetchFireData(); // Fetch new data for the selected window
});

// Time slider
timeSliderEl.addEventListener('input', (e) => {
    stopAnimation(); // Stop animation if user manually moves slider
    currentSliderValue = parseInt(e.target.value);
    filterFiresByTime();
});

// Animation controls
btnPlayEl.addEventListener('click', startAnimation);
btnPauseEl.addEventListener('click', stopAnimation);
btnResetEl.addEventListener('click', resetAnimation);

// Show trail toggle
showTrailEl.addEventListener('change', (e) => {
    showTrail = e.target.checked;
    filterFiresByTime();
});

// Initial load
fetchFireData();

// Auto-refresh every 10 minutes
setInterval(fetchFireData, REFRESH_INTERVAL);

// Start countdown timer
startCountdown();
