// ═══════════════════════════════════════════════════════════════
//  LocalizaBus — script.js v3.1
//  Correção de Tema + Fluxo de Início + SVGs + GPS Live
// ═══════════════════════════════════════════════════════════════

const OTP_BASE = "https://otp.mobilibus.com/FY7J-lwk85QGbn/otp/routers/default";
const OTP_GRAPHQL = `${OTP_BASE}/index/graphql`;

// ── SVGs ──────────────────────────────────────────────────────────
const svgIcons = {
    bus: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2l.64-2.54c.24-.959.36-1.438.21-1.84s-.55-.72-1.35-.72H3.5c-.8 0-1.2 0-1.35.32s-.03.881.21 1.84L3 17h2M7 21h10M5 13l-1.33-4.66c-.12-.4-.18-.6-.11-.77s.24-.3.44-.3h16c.2 0 .37.13.44.3s.01.37-.11.77L19 13M8 10V7M16 10V7M6 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm16 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z"/></svg>`,
    walk: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 22-4-8 4-8"/><path d="M4 22l4-8-4-8"/><path d="M12 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z"/><path d="M12 12v10"/><path d="m12 12-4-4"/><path d="m12 12 4-4"/></svg>`,
    live: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="color:var(--accent)"><circle cx="12" cy="12" r="10"/></svg>`
};

// ── DOM Elements ──────────────────────────────────────────────────
const initialActions = document.getElementById('initial-actions');
const searchContainer = document.getElementById('search-container');
const btnModeNearby = document.getElementById('btn-mode-nearby');
const btnModePlan = document.getElementById('btn-mode-plan');
const btnBackToModes = document.getElementById('btn-back-to-modes');
const searchTitle = document.getElementById('search-title');
const destinationGroup = document.getElementById('destination-group');

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
let currentMode = 'plan'; // 'nearby' or 'plan'

// ── Initialization ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
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
    // Alternância de Modos
    btnModeNearby.addEventListener('click', () => switchMode('nearby'));
    btnModePlan.addEventListener('click', () => switchMode('plan'));
    btnBackToModes.addEventListener('click', backToInitial);

    btnRouteSearch.addEventListener('click', handleAction);
    btnUseGps.addEventListener('click', useCurrentLocation);
    btnSelectMap.addEventListener('click', () => openMapModal('dest'));
    
    document.getElementById('map-modal-close').addEventListener('click', closeMapModal);
    document.getElementById('btn-confirm-map').addEventListener('click', confirmMapSelection);
}

function switchMode(mode) {
    currentMode = mode;
    initialActions.classList.add('hidden');
    searchContainer.classList.remove('hidden');
    
    if (mode === 'nearby') {
        searchTitle.textContent = "Ônibus Próximos";
        destinationGroup.classList.add('hidden');
        btnRouteSearch.querySelector('span').textContent = "Ver Ônibus Próximos";
    } else {
        searchTitle.textContent = "Planejar Rota";
        destinationGroup.classList.remove('hidden');
        btnRouteSearch.querySelector('span').textContent = "Traçar Rota";
    }
}

function backToInitial() {
    searchContainer.classList.add('hidden');
    initialActions.classList.remove('hidden');
    hideResults();
    mainMapEl.classList.add('hidden');
}

// ── Theme System ──────────────────────────────────────────────────
function initTheme() {
    const themeToggle = document.getElementById("theme-toggle");
    const themeLabel = document.getElementById("theme-label");
    const html = document.documentElement;
    const logoImg = document.getElementById("logo-img");

    const applyTheme = (theme) => {
        if (theme === "light") {
            html.setAttribute("data-theme", "light");
            themeLabel.textContent = "Modo escuro";
        } else {
            html.removeAttribute("data-theme");
            themeLabel.textContent = "Modo claro";
        }
        localStorage.setItem("lb-theme", theme);
    };

    const savedTheme = localStorage.getItem("lb-theme") || 
        (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    
    applyTheme(savedTheme);

    themeToggle.addEventListener("click", () => {
        const isLight = html.getAttribute("data-theme") === "light";
        applyTheme(isLight ? "dark" : "light");
    });
}

// ── Location Services ─────────────────────────────────────────────
async function useCurrentLocation() {
    if (!navigator.geolocation) return alert("GPS não suportado");
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
        async (pos) => {
            originCoords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
            originInput.value = "Minha localização";
            setLoading(false);
        },
        (err) => {
            alert("Erro ao obter GPS. Verifique as permissões do navegador.");
            setLoading(false);
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
}

// ── Autocomplete (Photon) ─────────────────────────────────────────
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

// ── Action Handler ────────────────────────────────────────────────
async function handleAction() {
    if (currentMode === 'nearby') {
        if (!originCoords) return alert("Selecione sua localização primeiro");
        handleNearbySearch();
    } else {
        if (!originCoords || !destCoords) return alert("Selecione origem e destino");
        handleRouteSearch();
    }
}

async function handleNearbySearch() {
    setLoading(true);
    hideResults();
    mainMapEl.classList.remove('hidden');
    // Scroll para o mapa
    setTimeout(() => mainMapEl.scrollIntoView({ behavior: 'smooth' }), 100);
    showStatus('loading', 'Buscando paradas e ônibus próximos...');
    
    try {
        const query = `{ stopsByRadius(lat: ${originCoords.lat}, lon: ${originCoords.lon}, radius: 1000) { stop { id name code lat lon } distance } }`;
        const res = await fetch(OTP_GRAPHQL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });
        const data = await res.json();
        const stops = data.data.stopsByRadius;
        
        if (!stops.length) throw new Error("Nenhuma parada encontrada próxima.");
        
        renderNearbyStops(stops);
        mainMap.setView([originCoords.lat, originCoords.lon], 15);
        startRealtimeNearby(stops);
        
    } catch (err) { showStatus('error', err.message); }
    finally { setLoading(false); }
}

async function handleRouteSearch() {
    setLoading(true);
    hideResults();
    mainMapEl.classList.remove('hidden');
    // Scroll para o mapa
    setTimeout(() => mainMapEl.scrollIntoView({ behavior: 'smooth' }), 100);
    showStatus('loading', 'Calculando melhor rota...');
    
    try {
        const url = `${OTP_BASE}/plan?fromPlace=${originCoords.lat},${originCoords.lon}&toPlace=${destCoords.lat},${destCoords.lon}&mode=TRANSIT,WALK&locale=pt_BR&numItineraries=1`;
        const res = await fetch(url);
        const data = await res.json();
        
        if (!data.plan || !data.plan.itineraries.length) throw new Error("Nenhuma rota encontrada.");
        
        const itinerary = data.plan.itineraries[0];
        renderItinerary(itinerary);
        drawRouteOnMap(itinerary);
        startRealtimeTracking(itinerary);
        
    } catch (err) { showStatus('error', err.message); }
    finally { setLoading(false); }
}

// ── Rendering ─────────────────────────────────────────────────────
function renderItinerary(itinerary) {
    resultsEl.classList.remove('hidden');
    document.getElementById('results-label').textContent = "Melhor Opção";
    routeDetailsEl.innerHTML = '';
    
    itinerary.legs.forEach(leg => {
        const card = document.createElement('div');
        card.className = 'route-card';
        const isWalk = leg.mode === 'WALK';
        
        card.innerHTML = `
            <div class="route-step">
                <div class="step-icon">${isWalk ? svgIcons.walk : svgIcons.bus}</div>
                <div class="step-content">
                    <div class="step-title">${isWalk ? 'Caminhada' : 'Ônibus ' + leg.routeShortName}</div>
                    <div class="step-meta">${isWalk ? `Ande ${Math.round(leg.distance)}m (${Math.round(leg.duration/60)} min)` : `Pegue na parada ${leg.from.name} sentido ${leg.headsign}`}</div>
                    ${!isWalk ? `<div class="realtime-status" id="rt-${leg.tripId}">Buscando GPS...</div>` : ''}
                </div>
            </div>
        `;
        routeDetailsEl.appendChild(card);
    });
}

function renderNearbyStops(stops) {
    resultsEl.classList.remove('hidden');
    document.getElementById('results-label').textContent = "Paradas Próximas";
    routeDetailsEl.innerHTML = '';
    
    stops.slice(0, 5).forEach(s => {
        const card = document.createElement('div');
        card.className = 'route-card';
        card.innerHTML = `
            <div class="route-step">
                <div class="step-icon">${svgIcons.bus}</div>
                <div class="step-content">
                    <div class="step-title">${s.stop.name}</div>
                    <div class="step-meta">A ${Math.round(s.distance)}m de você · Código ${s.stop.code || '—'}</div>
                </div>
            </div>
        `;
        routeDetailsEl.appendChild(card);
    });
}

// ── GPS Realtime ──────────────────────────────────────────────────
async function startRealtimeTracking(itinerary) {
    if (activeRefreshTimer) clearInterval(activeRefreshTimer);
    const transitLegs = itinerary.legs.filter(l => l.mode !== 'WALK');
    
    const update = async () => {
        try {
            // Consulta de posições de veículos
            const query = `{ vehiclePositions { vehicleId lat lon trip { id } route { shortName } } }`;
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
                    const marker = L.marker([bus.lat, bus.lon], { 
                        icon: L.divIcon({ html: `<div class="live-bus-marker" style="background:var(--accent);width:15px;height:15px;border-radius:50%;border:2px solid white;box-shadow:var(--neon-glow);"></div>`, className:'' }) 
                    }).addTo(mainMap);
                    busMarkers.push(marker);
                } else if (statusEl) {
                    statusEl.innerHTML = `<span style="color:var(--text-secondary)">Programado</span> - GPS indisponível agora`;
                }
            });
        } catch (e) { console.warn(e); }
    };
    update();
    activeRefreshTimer = setInterval(update, 15000);
}

async function startRealtimeNearby(stops) {
    if (activeRefreshTimer) clearInterval(activeRefreshTimer);
    const update = async () => {
        try {
            const query = `{ vehiclePositions { vehicleId lat lon route { shortName } } }`;
            const res = await fetch(OTP_GRAPHQL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query })
            });
            const data = await res.json();
            const vehicles = data.data.vehiclePositions;
            
            busMarkers.forEach(m => mainMap.removeLayer(m));
            busMarkers = [];
            
            vehicles.forEach(v => {
                const marker = L.marker([v.lat, v.lon], { 
                    icon: L.divIcon({ html: `<div style="background:var(--accent);width:10px;height:10px;border-radius:50%;border:1px solid white;"></div>`, className:'' }) 
                }).bindPopup(`Linha ${v.route?.shortName || '—'}`).addTo(mainMap);
                busMarkers.push(marker);
            });
        } catch (e) { console.warn(e); }
    };
    update();
    activeRefreshTimer = setInterval(update, 20000);
}

// ── Map Picker Modal ──────────────────────────────────────────────
function openMapModal(target) {
    document.getElementById('map-modal').classList.remove('hidden');
    if (!pickerMap) {
        pickerMap = L.map('picker-map').setView([-15.7942, -47.8822], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(pickerMap);
        let marker = null;
        pickerMap.on('click', (e) => {
            if (marker) pickerMap.removeLayer(marker);
            marker = L.marker(e.latlng).addTo(pickerMap);
            document.getElementById('btn-confirm-map').disabled = false;
            window.tempCoords = { lat: e.latlng.lat, lon: e.latlng.lng };
        });
    }
    setTimeout(() => pickerMap.invalidateSize(), 200);
}

function closeMapModal() { document.getElementById('map-modal').classList.add('hidden'); }
function confirmMapSelection() {
    destCoords = window.tempCoords;
    destInput.value = "Ponto no mapa";
    closeMapModal();
}

// ── Helpers ───────────────────────────────────────────────────────
function drawRouteOnMap(itinerary) {
    routeLayers.forEach(l => mainMap.removeLayer(l));
    routeLayers = [];
    const points = [];
    itinerary.legs.forEach(leg => {
        const poly = L.polyline(decodePolyline(leg.legGeometry.points), {
            color: leg.mode === 'WALK' ? '#ADB5BD' : (leg.routeColor ? '#' + leg.routeColor : '#00ff99'),
            weight: 5, dashArray: leg.mode === 'WALK' ? '5, 10' : null
        }).addTo(mainMap);
        routeLayers.push(poly);
        points.push(...poly.getLatLngs());
    });
    mainMap.fitBounds(L.latLngBounds(points), { padding: [50, 50] });
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
