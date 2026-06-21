// Config & Constants
const DEFAULT_CENTER = [-6.311557397425486, 107.27259988755473]; // Mitra10 Telukjambe Timur
const TILE_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

// Default Stores
const STORES_PRESETS = {
    "Store A": [-6.311557397425486, 107.27259988755473]
};

// Global variables
let map;
let storeMarker;
let destMarker;
let routingLine;
let activeStoreCoords = [...STORES_PRESETS["Store A"]];
let activeDestCoords = null;
let calculationHistory = [];

// DOM Elements
const storeSelect = document.getElementById('store-select');
const customStoreCoords = document.getElementById('custom-store-coords');
const customStoreLat = document.getElementById('custom-store-lat');
const customStoreLng = document.getElementById('custom-store-lng');

const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const searchResults = document.getElementById('search-results');

const destLatVal = document.getElementById('dest-lat-val');
const destLngVal = document.getElementById('dest-lng-val');

const resultPlaceholder = document.getElementById('result-placeholder');
const resultContent = document.getElementById('result-content');
const resultSpinner = document.getElementById('result-spinner');

const distanceKmText = document.getElementById('distance-km');
const distanceMText = document.getElementById('distance-m');
const timeDrivingText = document.getElementById('time-driving');
const timeCyclingText = document.getElementById('time-cycling');
const timeWalkingText = document.getElementById('time-walking');

const historyList = document.getElementById('history-list');
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    initEventListeners();
    loadHistory();
});

// Initialize Map
function initMap() {
    map = L.map('map', {
        center: DEFAULT_CENTER,
        zoom: 12,
        zoomControl: false // Custom placement later or styled
    });

    // Add styled Voyager tiles
    L.tileLayer(TILE_URL, {
        attribution: TILE_ATTR,
        maxZoom: 20
    }).addTo(map);

    // Reposition zoom control to top-right
    L.control.zoom({
        position: 'topright'
    }).addTo(map);

    // Custom Store Icon (DivIcon)
    const storeIcon = L.divIcon({
        className: 'custom-map-marker',
        html: `<div class="marker-pin-store"><i data-lucide="store"></i></div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 36]
    });

    // Add Store Marker
    storeMarker = L.marker(activeStoreCoords, {
        icon: storeIcon,
        zIndexOffset: 1000
    }).addTo(map);
    
    // Bind store popup
    storeMarker.bindPopup("<strong>Lokasi Asal (Toko)</strong>");
}

// Custom Destination Icon (DivIcon)
function getDestIcon() {
    return L.divIcon({
        className: 'custom-map-marker',
        html: `<div class="marker-pin-dest"><i data-lucide="map-pin"></i></div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 36]
    });
}

// Event Listeners Setup
function initEventListeners() {
    // Map clicks to set destination
    map.on('click', (e) => {
        setDestination(e.latlng.lat, e.latlng.lng);
    });

    // Store dropdown select handler
    storeSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val === 'custom') {
            customStoreCoords.classList.add('show');
            // use values in inputs
            updateStoreFromInputs();
        } else {
            customStoreCoords.classList.remove('show');
            const coords = STORES_PRESETS[val];
            updateStoreCoords(coords[0], coords[1]);
        }
    });

    // Custom coordinates input handlers
    customStoreLat.addEventListener('input', updateStoreFromInputs);
    customStoreLng.addEventListener('input', updateStoreFromInputs);

    // Search trigger
    searchBtn.addEventListener('click', performSearch);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            performSearch();
        }
    });

    // Close search results when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-group')) {
            searchResults.classList.add('hidden');
        }
    });

    // Sidebar mobile toggle
    sidebarToggle.addEventListener('click', () => {
        sidebar.classList.toggle('active');
        // change toggle icon
        const icon = sidebarToggle.querySelector('i');
        if (sidebar.classList.contains('active')) {
            icon.setAttribute('data-lucide', 'x');
        } else {
            icon.setAttribute('data-lucide', 'menu');
        }
        lucide.createIcons();
    });
}

// Update Store coordinates from manual inputs
function updateStoreFromInputs() {
    const lat = parseFloat(customStoreLat.value);
    const lng = parseFloat(customStoreLng.value);
    if (!isNaN(lat) && !isNaN(lng)) {
        updateStoreCoords(lat, lng);
    }
}

// Update store marker position & trigger recalculate
function updateStoreCoords(lat, lng) {
    activeStoreCoords = [lat, lng];
    storeMarker.setLatLng(activeStoreCoords);
    storeMarker.setPopupContent(`<strong>Lokasi Asal (Toko):</strong> ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    
    if (activeDestCoords) {
        calculateDistance();
    } else {
        map.panTo(activeStoreCoords);
    }
}

// Set destination location
function setDestination(lat, lng) {
    activeDestCoords = [lat, lng];

    // Update panel text
    destLatVal.textContent = lat.toFixed(5);
    destLngVal.textContent = lng.toFixed(5);

    // Update marker
    if (destMarker) {
        destMarker.setLatLng(activeDestCoords);
    } else {
        destMarker = L.marker(activeDestCoords, {
            icon: getDestIcon(),
            draggable: true
        }).addTo(map);

        // Drag handlers
        destMarker.on('drag', (e) => {
            const pos = destMarker.getLatLng();
            destLatVal.textContent = pos.lat.toFixed(5);
            destLngVal.textContent = pos.lng.toFixed(5);
        });

        destMarker.on('dragend', (e) => {
            const pos = destMarker.getLatLng();
            setDestination(pos.lat, pos.lng);
        });
    }

    // Refresh lucide icons inside marker
    lucide.createIcons();

    // Trigger calculations
    calculateDistance();
}

// Calculate Distance via Flask API
function calculateDistance() {
    if (!activeStoreCoords || !activeDestCoords) return;

    // Show loading spinner
    resultPlaceholder.classList.add('hidden');
    resultContent.classList.add('hidden');
    resultSpinner.classList.remove('hidden');

    const payload = {
        dest_lat: activeDestCoords[0],
        dest_lng: activeDestCoords[1]
    };

    const storeVal = storeSelect.value;
    if (storeVal === 'custom') {
        payload.custom_store_lat = activeStoreCoords[0];
        payload.custom_store_lng = activeStoreCoords[1];
    } else {
        payload.store_id = storeVal;
    }

    fetch('/api/calculate', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Gagal menghitung jarak');
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            displayResults(data);
            drawRouteLine(data.route_geometry);
            saveToHistory(data);
        } else {
            alert('Error: ' + data.error);
        }
    })
    .catch(err => {
        console.error(err);
        alert('Terjadi kesalahan koneksi ke server.');
    })
    .finally(() => {
        resultSpinner.classList.add('hidden');
    });
}

// Display results on UI
function displayResults(data) {
    resultContent.classList.remove('hidden');
    
    // Animate numbers gently
    animateNumber(distanceKmText, data.distance_km, 2);
    animateNumber(distanceMText, data.distance_m, 0);

    timeDrivingText.textContent = data.travel_time.driving;
    timeCyclingText.textContent = data.travel_time.cycling;
    timeWalkingText.textContent = data.travel_time.walking;
}

// Animate numbers helper
function animateNumber(element, target, decimals = 0) {
    let start = 0;
    const duration = 500; // ms
    const startTime = performance.now();

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // easeOutQuad
        const easeProgress = progress * (2 - progress);
        const current = start + easeProgress * (target - start);
        
        element.textContent = current.toFixed(decimals);

        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            element.textContent = target.toFixed(decimals);
        }
    }
    requestAnimationFrame(update);
}

// Draw road route geometry connecting source and destination
function drawRouteLine(routeGeometry) {
    if (routingLine) {
        map.removeLayer(routingLine);
    }

    if (routeGeometry) {
        routingLine = L.geoJSON(routeGeometry, {
            style: {
                color: '#6366F1', // Indigo accent
                weight: 5,
                opacity: 0.8
            }
        }).addTo(map);

        // Zoom map to bounds of route
        const bounds = routingLine.getBounds();
        map.fitBounds(bounds, {
            padding: [50, 50],
            maxZoom: 15
        });
    } else {
        // Fallback to straight line if no geometry is provided
        const points = [activeStoreCoords, activeDestCoords];
        routingLine = L.polyline(points, {
            color: '#EF4444', // Red fallback
            weight: 3,
            dashArray: '8, 8',
            opacity: 0.8
        }).addTo(map);

        const bounds = L.latLngBounds(points);
        map.fitBounds(bounds, {
            padding: [50, 50],
            maxZoom: 15
        });
    }
}

// Perform Geocoding Search using Nominatim OpenStreetMap
function performSearch() {
    const query = searchInput.value.trim();
    if (!query) return;

    searchBtn.disabled = true;
    searchResults.innerHTML = '<li class="loading-search">Mencari lokasi...</li>';
    searchResults.classList.remove('hidden');

    // Nominatim geocoding API
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(query)}`;

    fetch(url)
        .then(res => res.json())
        .then(data => {
            searchResults.innerHTML = '';
            if (data.length === 0) {
                searchResults.innerHTML = '<li>Lokasi tidak ditemukan</li>';
                return;
            }

            data.forEach(item => {
                const li = document.createElement('li');
                li.textContent = item.display_name;
                li.addEventListener('click', () => {
                    const lat = parseFloat(item.lat);
                    const lon = parseFloat(item.lon);
                    
                    // Fly to search destination and set it
                    map.flyTo([lat, lon], 14);
                    setDestination(lat, lon);
                    
                    // Hide search list and populate input
                    searchResults.classList.add('hidden');
                    searchInput.value = item.display_name;
                });
                searchResults.appendChild(li);
            });
        })
        .catch(err => {
            console.error(err);
            searchResults.innerHTML = '<li>Gagal memuat hasil pencarian</li>';
        })
        .finally(() => {
            searchBtn.disabled = false;
        });
}

// Local Storage History Management
function saveToHistory(data) {
    const newItem = {
        id: Date.now(),
        store_name: data.store.name,
        store_coords: [data.store.lat, data.store.lng],
        dest_coords: [data.destination.lat, data.destination.lng],
        distance_km: data.distance_km
    };

    // Prevent duplicate entries of exact same calculations
    const isDuplicate = calculationHistory.some(item => 
        item.store_coords[0].toFixed(4) === newItem.store_coords[0].toFixed(4) &&
        item.store_coords[1].toFixed(4) === newItem.store_coords[1].toFixed(4) &&
        item.dest_coords[0].toFixed(4) === newItem.dest_coords[0].toFixed(4) &&
        item.dest_coords[1].toFixed(4) === newItem.dest_coords[1].toFixed(4)
    );

    if (isDuplicate) return;

    calculationHistory.unshift(newItem);
    if (calculationHistory.length > 5) {
        calculationHistory.pop(); // Keep max 5
    }

    localStorage.setItem('distance_calc_history', JSON.stringify(calculationHistory));
    renderHistory();
}

function loadHistory() {
    const raw = localStorage.getItem('distance_calc_history');
    if (raw) {
        try {
            calculationHistory = JSON.parse(raw);
            renderHistory();
        } catch (e) {
            calculationHistory = [];
        }
    }
}

function renderHistory() {
    historyList.innerHTML = '';
    if (calculationHistory.length === 0) {
        historyList.innerHTML = '<li class="empty-history">Belum ada riwayat perhitungan.</li>';
        return;
    }

    calculationHistory.forEach(item => {
        const li = document.createElement('li');
        li.className = 'history-item';
        
        // Display info
        li.innerHTML = `
            <div class="hist-name" title="${item.store_name} ke tujuan">${item.store_name} &rarr; Tujuan</div>
            <div class="hist-meta">
                <span class="hist-dist">${item.distance_km.toFixed(2)} km</span>
                <button class="delete-hist" title="Hapus"><i data-lucide="trash-2"></i></button>
            </div>
        `;

        // Click to reload calculation
        li.addEventListener('click', (e) => {
            if (e.target.closest('.delete-hist')) return; // ignore if clicking delete
            
            // Set store selector
            let matched = false;
            for (const [key, val] of Object.entries(STORES_PRESETS)) {
                if (val[0] === item.store_coords[0] && val[1] === item.store_coords[1]) {
                    storeSelect.value = key;
                    customStoreCoords.classList.remove('show');
                    matched = true;
                    break;
                }
            }
            if (!matched) {
                storeSelect.value = 'custom';
                customStoreCoords.classList.add('show');
                customStoreLat.value = item.store_coords[0];
                customStoreLng.value = item.store_coords[1];
            }

            activeStoreCoords = item.store_coords;
            storeMarker.setLatLng(activeStoreCoords);

            // Set destination
            setDestination(item.dest_coords[0], item.dest_coords[1]);
            
            // If on mobile, hide sidebar on history click
            if (window.innerWidth <= 768) {
                sidebar.classList.remove('active');
                const icon = sidebarToggle.querySelector('i');
                icon.setAttribute('data-lucide', 'menu');
                lucide.createIcons();
            }
        });

        // Delete handler
        const delBtn = li.querySelector('.delete-hist');
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteHistoryItem(item.id);
        });

        historyList.appendChild(li);
    });

    lucide.createIcons();
}

function deleteHistoryItem(id) {
    calculationHistory = calculationHistory.filter(item => item.id !== id);
    localStorage.setItem('distance_calc_history', JSON.stringify(calculationHistory));
    renderHistory();
}
