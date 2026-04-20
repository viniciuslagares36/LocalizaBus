// ═══════════════════════════════════════════════════════════════
//  LocalizaBus — script.js v3.0
//  Roteamento completo + GPS em tempo real via MobiliBus
// ═══════════════════════════════════════════════════════════════

const OTP_BASE = "https://otp.mobilibus.com/FY7J-lwk85QGbn/otp/routers/default";
const OTP_GRAPHQL = `${OTP_BASE}/index/graphql`;

// ── DOM Elements ──────────────────────────────────────────────────
const originInput = document.getElementById('origin-input');
const destInput = document.getElementById('destination-input');
const btnRouteSearch = document.getElementById('btn-route-search');
const btnUseGps = document.getElementById('btn-use-gps');
const btnSelectMap = document.getElementById('btn-select-map');
const mainMapEl = document.getElementById('main-map');
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');
const routeDetailsEl = document.getElementById('route-details');
const btnSpinner = document.getElementById('btn-spinner');

// ── State ─────────────────────────────────────────────────────────
let mainMap = null;
let pickerMap = null;
let originCoords = null;
let destCoords = null;
let routeLayers = [];
let busMarkers = [];
let activeRefreshTimer = null;

// ── Icons ─────────────────────────────────────────────────────────
const createBusIcon = (color) => L.divIcon({
    html: `<div style="background:${color || '#00ff99'};width:12px;height:12px;border-radius:50%;border:2px solid white;box-shadow:0 0 5px rgba(0,0,0,0.5);"></div>`,
    className: '', iconSize: [12, 12]
});

// ── Initialization ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initMainMap();
    setupAutocomplete();
    setupEventListeners();
});

function initMainMap() {
    mainMap = L.map('main-map').setView([-15.7942, -47.8822], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(mainMap);
}

function setupEventListeners() {
    btnRouteSearch.addEventListener('click', handleRouteSearch);
    btnUseGps.addEventListener('click', useCurrentLocation);
    btnSelectMap.addEventListener('click', () => openMapModal('dest'));
    
    document.getElementById('map-modal-close').addEventListener('click', closeMapModal);
    document.getElementById('btn-confirm-map').addEventListener('click', confirmMapSelection);
}

// ── Location Services ─────────────────────────────────────────────
async function useCurrentLocation() {
    if (!navigator.geolocation) return alert("GPS não suportado");
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
        async (pos) => {
            originCoords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
            originInput.value = "Minha localização";
            mainMap.setView([originCoords.lat, originCoords.lon], 15);
            setLoading(false);
        },
        (err) => {
            alert("Erro ao obter GPS");
            setLoading(false);
        }
    );
}

// ── Autocomplete (Photon API) ─────────────────────────────────────
function setupAutocomplete() {
    [originInput, destInput].forEach(input => {
        const type = input === originInput ? 'origin' : 'dest';
        const suggestionsEl = document.getElementById(`${type}-suggestions`);
        
        input.addEventListener('input', debounce(async (e) => {
            const query = e.target.value;
            if (query.length < 3) return suggestionsEl.classList.add('hidden');
            
            try {
                const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&lat=-15.79&lon=-47.88`);
                const data = await res.json();
                renderSuggestions(data.features, suggestionsEl, input, type);
            } catch (err) { console.error(err); }
        }, 300));
    });
}

function renderSuggestions(features, container, input, type) {
    container.innerHTML = '';
    if (!features.length) return container.classList.add('hidden');
    
    features.forEach(f => {
        const btn = document.createElement('button');
        btn.className = 'suggestion-item';
        const name = f.properties.name || '';
        const city = f.properties.city || '';
        btn.textContent = `${name}${city ? ', ' + city : ''}`;
        btn.onclick = () => {
            input.value = btn.textContent;
            const coords = { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] };
            if (type === 'origin') originCoords = coords; else destCoords = coords;
            container.classList.add('hidden');
        };
        container.appendChild(btn);
    });
    container.classList.remove('hidden');
}

// ── Routing Logic ─────────────────────────────────────────────────
async function handleRouteSearch() {
    if (!originCoords || !destCoords) return alert("Selecione origem e destino");
    
    setLoading(true);
    hideResults();
    showStatus('loading', 'Calculando melhor rota...');
    
    try {
        const url = `${OTP_BASE}/plan?fromPlace=${originCoords.lat},${originCoords.lon}&toPlace=${destCoords.lat},${destCoords.lon}&mode=TRANSIT,WALK&locale=pt_BR&numItineraries=1`;
        const res = await fetch(url);
        const data = await res.json();
        
        if (!data.plan || !data.plan.itineraries.length) {
            throw new Error("Nenhuma rota encontrada para este trajeto.");
        }
        
        const itinerary = data.plan.itineraries[0];
        renderItinerary(itinerary);
        drawRouteOnMap(itinerary);
        startRealtimeTracking(itinerary);
        
    } catch (err) {
        showStatus('error', err.message);
    } finally {
        setLoading(false);
    }
}

function renderItinerary(itinerary) {
    resultsEl.classList.remove('hidden');
    routeDetailsEl.innerHTML = '';
    
    itinerary.legs.forEach(leg => {
        const card = document.createElement('div');
        card.className = 'route-card';
        
        const isWalk = leg.mode === 'WALK';
        const title = isWalk ? 'Caminhada' : `Ônibus ${leg.routeShortName}`;
        const desc = isWalk 
            ? `Ande aprox. ${Math.round(leg.distance)}m (${Math.round(leg.duration/60)} min)`
            : `Pegue na parada ${leg.from.name} sentido ${leg.headsign}`;
            
        card.innerHTML = `
            <div class="route-step">
                <div class="step-icon">${isWalk ? '🚶' : '🚌'}</div>
                <div class="step-content">
                    <div class="step-title">${title}</div>
                    <div class="step-meta">${desc}</div>
                    ${!isWalk ? `<div class="realtime-status" id="rt-${leg.tripId}">Buscando GPS...</div>` : ''}
                </div>
            </div>
        `;
        routeDetailsEl.appendChild(card);
    });
}

function drawRouteOnMap(itinerary) {
    routeLayers.forEach(l => mainMap.removeLayer(l));
    routeLayers = [];
    
    const points = [];
    itinerary.legs.forEach(leg => {
        const poly = L.polyline(decodePolyline(leg.legGeometry.points), {
            color: leg.mode === 'WALK' ? '#ADB5BD' : (leg.routeColor ? '#' + leg.routeColor : '#00ff99'),
            weight: 5,
            dashArray: leg.mode === 'WALK' ? '5, 10' : null
        }).addTo(mainMap);
        routeLayers.push(poly);
        points.push(...poly.getLatLngs());
    });
    
    mainMap.fitBounds(L.latLngBounds(points), { padding: [50, 50] });
}

// ── Realtime Tracking ─────────────────────────────────────────────
async function startRealtimeTracking(itinerary) {
    if (activeRefreshTimer) clearInterval(activeRefreshTimer);
    
    const transitLegs = itinerary.legs.filter(l => l.mode !== 'WALK');
    if (!transitLegs.length) return;
    
    const update = async () => {
        try {
            const query = `{ vehiclePositions { vehicleId lat lon trip { id } } }`;
            const res = await fetch(OTP_GRAPHQL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query })
            });
            const data = await res.json();
            const vehicles = data.data.vehiclePositions;
            
            busMarkers.forEach(m => mainMap.removeLayer(m));
            busMarkers = [];
            
            transitLegs.forEach(leg => {
                const bus = vehicles.find(v => v.trip && v.trip.id === leg.tripId);
                const statusEl = document.getElementById(`rt-${leg.tripId}`);
                
                if (bus && statusEl) {
                    statusEl.innerHTML = `<span style="color:var(--accent)">● Ao vivo</span> - Localizado`;
                    const marker = L.marker([bus.lat, bus.lon], { icon: createBusIcon('#00ff99') })
                        .bindPopup(`Ônibus ${leg.routeShortName}`)
                        .addTo(mainMap);
                    busMarkers.push(marker);
                } else if (statusEl) {
                    statusEl.innerHTML = `<span style="color:var(--text-secondary)">Programado</span> - GPS indisponível`;
                }
            });
        } catch (err) { console.warn("Erro ao buscar GPS:", err); }
    };
    
    update();
    activeRefreshTimer = setInterval(update, 15000);
}

// ── Map Picker Modal ──────────────────────────────────────────────
let pickerTarget = 'dest';
function openMapModal(target) {
    pickerTarget = target;
    document.getElementById('map-modal').classList.remove('hidden');
    if (!pickerMap) {
        pickerMap = L.map('picker-map').setView([-15.7942, -47.8822], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(pickerMap);
        
        let marker = null;
        pickerMap.on('click', (e) => {
            if (marker) pickerMap.removeLayer(marker);
            marker = L.marker(e.latlng).addTo(pickerMap);
            document.getElementById('btn-confirm-map').disabled = false;
            document.getElementById('map-selection-text').textContent = `Selecionado: ${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`;
            window.tempCoords = { lat: e.latlng.lat, lon: e.latlng.lng };
        });
    }
    setTimeout(() => pickerMap.invalidateSize(), 200);
}

function closeMapModal() { document.getElementById('map-modal').classList.add('hidden'); }

function confirmMapSelection() {
    if (pickerTarget === 'origin') {
        originCoords = window.tempCoords;
        originInput.value = "Ponto no mapa";
    } else {
        destCoords = window.tempCoords;
        destInput.value = "Ponto no mapa";
    }
    closeMapModal();
}

// ── Helpers ───────────────────────────────────────────────────────
function setLoading(l) {
    btnRouteSearch.disabled = l;
    btnSpinner.classList.toggle('hidden', !l);
}

function showStatus(type, msg) {
    statusEl.className = `status ${type}`;
    statusEl.textContent = msg;
    statusEl.classList.remove('hidden');
}

function hideResults() { resultsEl.classList.add('hidden'); statusEl.classList.add('hidden'); }

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function decodePolyline(str) {
    let index = 0, lat = 0, lng = 0, coordinates = [], shift = 0, result = 0, byte = null, latitude_change, longitude_change;
    while (index < str.length) {
        byte = null; shift = 0; result = 0;
        do { byte = str.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
        latitude_change = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lat += latitude_change;
        byte = null; shift = 0; result = 0;
        do { byte = str.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
        longitude_change = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lng += longitude_change;
        coordinates.push([lat / 1e5, lng / 1e5]);
    }
    return coordinates;
}
