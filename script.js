// ═══════════════════════════════════════════════════════════════
// LocalizaBus — script.js
// GPS + Photon + OTP Planner + mapa + realtime opcional
// ═══════════════════════════════════════════════════════════════

const OTP_BASE = "https://otp.mobilibus.com/FY7J-lwk85QGbn/otp/routers/default";
const OTP_GRAPHQL = `${OTP_BASE}/index/graphql`;

// ── SVGs ───────────────────────────────────────────────────────
const svgIcons = {
  bus: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2l.64-2.54c.24-.959.36-1.438.21-1.84s-.55-.72-1.35-.72H3.5c-.8 0-1.2 0-1.35.32s-.03.881.21 1.84L3 17h2M7 21h10M5 13l-1.33-4.66c-.12-.4-.18-.6-.11-.77s.24-.3.44-.3h16c.2 0 .37.13.44.3s.01.37-.11.77L19 13M8 10V7M16 10V7M6 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm16 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z"/></svg>`,
  walk: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 22-4-8 4-8"/><path d="M4 22l4-8-4-8"/><path d="M12 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z"/><path d="M12 12v10"/><path d="m12 12-4-4"/><path d="m12 12 4-4"/></svg>`,
  live: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="color:var(--accent)"><circle cx="12" cy="12" r="10"/></svg>`
};

// ── DOM ────────────────────────────────────────────────────────
const initialActions = document.getElementById("initial-actions");
const searchContainer = document.getElementById("search-container");
const btnModeNearby = document.getElementById("btn-mode-nearby");
const btnModePlan = document.getElementById("btn-mode-plan");
const btnBackToModes = document.getElementById("btn-back-to-modes");
const searchTitle = document.getElementById("search-title");
const destinationGroup = document.getElementById("destination-group");

const originInput = document.getElementById("origin-input");
const destInput = document.getElementById("destination-input");
const btnRouteSearch = document.getElementById("btn-route-search");
const btnUseGps = document.getElementById("btn-use-gps");
const btnSelectMap = document.getElementById("btn-select-map");
const mainMapEl = document.getElementById("main-map");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");
const routeDetailsEl = document.getElementById("route-details");
const btnSpinner = document.getElementById("btn-spinner");

const mapModal = document.getElementById("map-modal");
const mapModalClose = document.getElementById("map-modal-close");
const btnConfirmMap = document.getElementById("btn-confirm-map");

const originSuggestions = document.getElementById("origin-suggestions");
const destSuggestions = document.getElementById("dest-suggestions");

// ── State ──────────────────────────────────────────────────────
let mainMap = null;
let pickerMap = null;
let originCoords = null;
let destCoords = null;
let routeLayers = [];
let busMarkers = [];
let activeRefreshTimer = null;
let currentMode = "plan";
let mapSelectionTarget = "dest";
let tempCoords = null;

// ── Init ───────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initMainMap();
  setupAutocomplete();
  setupEventListeners();
});

// ── Theme ──────────────────────────────────────────────────────
function initTheme() {
  const themeToggle = document.getElementById("theme-toggle");
  const themeLabel = document.getElementById("theme-label");
  const html = document.documentElement;

  const applyTheme = (theme) => {
    if (theme === "light") {
      html.setAttribute("data-theme", "light");
      if (themeLabel) themeLabel.textContent = "Modo escuro";
    } else {
      html.removeAttribute("data-theme");
      if (themeLabel) themeLabel.textContent = "Modo claro";
    }
    localStorage.setItem("lb-theme", theme);
  };

  const savedTheme =
    localStorage.getItem("lb-theme") ||
    (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");

  applyTheme(savedTheme);

  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const isLight = html.getAttribute("data-theme") === "light";
      applyTheme(isLight ? "dark" : "light");
    });
  }
}

// ── Map ────────────────────────────────────────────────────────
function initMainMap() {
  mainMap = L.map("main-map").setView([-15.7942, -47.8822], 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap"
  }).addTo(mainMap);
}

function drawRouteOnMap(itinerary) {
  routeLayers.forEach(layer => mainMap.removeLayer(layer));
  routeLayers = [];

  const points = [];

  itinerary.legs.forEach(leg => {
    const poly = L.polyline(decodePolyline(leg.legGeometry.points), {
      color: leg.mode === "WALK"
        ? "#ADB5BD"
        : (leg.routeColor ? `#${leg.routeColor}` : "#00ff99"),
      weight: 5,
      dashArray: leg.mode === "WALK" ? "5,10" : null
    }).addTo(mainMap);

    routeLayers.push(poly);
    points.push(...poly.getLatLngs());
  });

  if (points.length) {
    mainMap.fitBounds(L.latLngBounds(points), { padding: [50, 50] });
  }
}

function openMapModal(target) {
  mapSelectionTarget = target;
  tempCoords = null;
  if (btnConfirmMap) btnConfirmMap.disabled = true;
  if (mapModal) mapModal.classList.remove("hidden");

  if (!pickerMap) {
    pickerMap = L.map("picker-map").setView([-15.7942, -47.8822], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap"
    }).addTo(pickerMap);

    let marker = null;

    pickerMap.on("click", (e) => {
      if (marker) pickerMap.removeLayer(marker);
      marker = L.marker(e.latlng).addTo(pickerMap);
      tempCoords = { lat: e.latlng.lat, lon: e.latlng.lng };
      if (btnConfirmMap) btnConfirmMap.disabled = false;
    });
  }

  setTimeout(() => pickerMap.invalidateSize(), 200);
}

function closeMapModal() {
  if (mapModal) mapModal.classList.add("hidden");
}

function confirmMapSelection() {
  if (!tempCoords) return;

  if (mapSelectionTarget === "origin") {
    originCoords = tempCoords;
    if (originInput) originInput.value = "Ponto no mapa";
  } else {
    destCoords = tempCoords;
    if (destInput) destInput.value = "Ponto no mapa";
  }

  closeMapModal();
}

// ── Events ─────────────────────────────────────────────────────
function setupEventListeners() {
  if (btnModeNearby) btnModeNearby.addEventListener("click", () => switchMode("nearby"));
  if (btnModePlan) btnModePlan.addEventListener("click", () => switchMode("plan"));
  if (btnBackToModes) btnBackToModes.addEventListener("click", backToInitial);

  if (btnRouteSearch) btnRouteSearch.addEventListener("click", handleAction);
  if (btnUseGps) btnUseGps.addEventListener("click", useCurrentLocation);
  if (btnSelectMap) btnSelectMap.addEventListener("click", () => openMapModal("dest"));

  if (originInput) {
    originInput.addEventListener("dblclick", () => openMapModal("origin"));
  }

  if (mapModalClose) mapModalClose.addEventListener("click", closeMapModal);
  if (btnConfirmMap) btnConfirmMap.addEventListener("click", confirmMapSelection);
}

function switchMode(mode) {
  currentMode = mode;
  if (initialActions) initialActions.classList.add("hidden");
  if (searchContainer) searchContainer.classList.remove("hidden");

  if (mode === "nearby") {
    if (searchTitle) searchTitle.textContent = "Ônibus Próximos";
    if (destinationGroup) destinationGroup.classList.add("hidden");
    if (btnRouteSearch) btnRouteSearch.querySelector("span").textContent = "Ver Ônibus Próximos";
  } else {
    if (searchTitle) searchTitle.textContent = "Planejar Rota";
    if (destinationGroup) destinationGroup.classList.remove("hidden");
    if (btnRouteSearch) btnRouteSearch.querySelector("span").textContent = "Traçar Rota";
  }
}

function backToInitial() {
  if (searchContainer) searchContainer.classList.add("hidden");
  if (initialActions) initialActions.classList.remove("hidden");
  hideResults();
  if (mainMapEl) mainMapEl.classList.add("hidden");
  if (activeRefreshTimer) clearInterval(activeRefreshTimer);
}

// ── GPS ────────────────────────────────────────────────────────
async function useCurrentLocation() {
  if (!navigator.geolocation) {
    alert("GPS não suportado");
    return;
  }

  setLoading(true);

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      originCoords = {
        lat: pos.coords.latitude,
        lon: pos.coords.longitude
      };
      if (originInput) originInput.value = "Minha localização";
      setLoading(false);
    },
    () => {
      alert("Erro ao obter GPS. Verifique as permissões do navegador.");
      setLoading(false);
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

// ── Photon ─────────────────────────────────────────────────────
function setupAutocomplete() {
  [
    { input: originInput, container: originSuggestions, type: "origin" },
    { input: destInput, container: destSuggestions, type: "dest" }
  ].forEach(({ input, container, type }) => {
    if (!input || !container) return;

    input.addEventListener("input", debounce(async (e) => {
      const query = normalizeText(e.target.value);

      if (query.length < 3) {
        container.classList.add("hidden");
        container.innerHTML = "";
        return;
      }

      try {
        const res = await fetch(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&lat=-15.79&lon=-47.88`
        );
        const data = await res.json();
        renderSuggestions(data.features || [], container, input, type);
      } catch (err) {
        console.error(err);
      }
    }, 300));
  });
}

function renderSuggestions(features, container, input, type) {
  container.innerHTML = "";

  if (!features.length) {
    container.classList.add("hidden");
    return;
  }

  features.forEach((feature) => {
    const btn = document.createElement("button");
    btn.className = "suggestion-item";
    btn.type = "button";

    const name = feature.properties?.name || "";
    const city = feature.properties?.city || "";
    const state = feature.properties?.state || "";
    btn.textContent = [name, city, state].filter(Boolean).join(", ");

    btn.onclick = () => {
      input.value = btn.textContent;
      const coords = {
        lat: feature.geometry.coordinates[1],
        lon: feature.geometry.coordinates[0]
      };

      if (type === "origin") {
        originCoords = coords;
      } else {
        destCoords = coords;
      }

      container.classList.add("hidden");
    };

    container.appendChild(btn);
  });

  container.classList.remove("hidden");
}

// ── Actions ────────────────────────────────────────────────────
async function handleAction() {
  if (currentMode === "nearby") {
    if (!originCoords) {
      alert("Selecione sua localização primeiro");
      return;
    }
    await handleNearbySearch();
  } else {
    if (!originCoords || !destCoords) {
      alert("Selecione origem e destino");
      return;
    }
    await handleRouteSearch();
  }
}

async function handleNearbySearch() {
  setLoading(true);
  hideResults();
  if (mainMapEl) mainMapEl.classList.remove("hidden");
  setTimeout(() => mainMapEl.scrollIntoView({ behavior: "smooth" }), 100);
  showStatus("loading", "Buscando paradas e ônibus próximos...");

  try {
    const query = `
    {
      stopsByRadius(lat: ${originCoords.lat}, lon: ${originCoords.lon}, radius: 1000) {
        stop { id name code lat lon }
        distance
      }
    }`;

    const res = await fetch(OTP_GRAPHQL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query })
    });

    const data = await res.json();
    const stops = data?.data?.stopsByRadius || [];

    if (!stops.length) throw new Error("Nenhuma parada encontrada próxima.");

    renderNearbyStops(stops);
    mainMap.setView([originCoords.lat, originCoords.lon], 15);
    await startRealtimeNearby();

  } catch (err) {
    showStatus("error", err.message);
  } finally {
    setLoading(false);
  }
}

async function handleRouteSearch() {
  setLoading(true);
  hideResults();
  if (mainMapEl) mainMapEl.classList.remove("hidden");
  setTimeout(() => mainMapEl.scrollIntoView({ behavior: "smooth" }), 100);
  showStatus("loading", "Calculando melhor rota...");

  try {
    const url =
      `${OTP_BASE}/plan?fromPlace=${originCoords.lat},${originCoords.lon}` +
      `&toPlace=${destCoords.lat},${destCoords.lon}` +
      `&mode=TRANSIT,WALK&locale=pt_BR&numItineraries=1`;

    const res = await fetch(url);
    const data = await res.json();

    if (!data.plan || !data.plan.itineraries || !data.plan.itineraries.length) {
      throw new Error("Nenhuma rota encontrada.");
    }

    const itinerary = data.plan.itineraries[0];
    renderItinerary(itinerary);
    drawRouteOnMap(itinerary);
    if (statusEl) statusEl.classList.add("hidden");
    await startRealtimeTracking(itinerary);

  } catch (err) {
    showStatus("error", err.message);
  } finally {
    setLoading(false);
  }
}

// ── Render ─────────────────────────────────────────────────────
function renderItinerary(itinerary) {
  if (resultsEl) resultsEl.classList.remove("hidden");
  const resultsLabel = document.getElementById("results-label");
  if (resultsLabel) resultsLabel.textContent = "Melhor Opção";

  routeDetailsEl.innerHTML = "";

  const originName = normalizeText(originInput?.value) || "sua localização";

  itinerary.legs.forEach((leg) => {
    const card = document.createElement("div");
    card.className = "route-card";
    const isWalk = leg.mode === "WALK";

    const lineName = leg.routeShortName || leg.route?.shortName || "—";
    const tripDomId = sanitizeId(leg.tripId || lineName || "bus");

    card.innerHTML = `
      <div class="route-step">
        <div class="step-icon">${isWalk ? svgIcons.walk : svgIcons.bus}</div>
        <div class="step-content">
          <div class="step-title">${isWalk ? "Caminhada" : "Ônibus " + lineName}</div>
          <div class="step-meta">
            ${isWalk
              ? `Ande ${Math.round(leg.distance)}m (${Math.round(leg.duration / 60)} min)`
              : `Saindo de ${originName}, pegue na parada ${leg.from?.name || "N/A"} sentido ${leg.headsign || "N/A"}`}
          </div>
          ${!isWalk ? `<div class="realtime-status" id="rt-${tripDomId}">Buscando GPS...</div>` : ""}
        </div>
      </div>
    `;

    routeDetailsEl.appendChild(card);
  });
}

function renderNearbyStops(stops) {
  if (resultsEl) resultsEl.classList.remove("hidden");
  const resultsLabel = document.getElementById("results-label");
  if (resultsLabel) resultsLabel.textContent = "Paradas Próximas";

  routeDetailsEl.innerHTML = "";

  stops.slice(0, 5).forEach((s) => {
    const card = document.createElement("div");
    card.className = "route-card";
    card.innerHTML = `
      <div class="route-step">
        <div class="step-icon">${svgIcons.bus}</div>
        <div class="step-content">
          <div class="step-title">${s.stop.name}</div>
          <div class="step-meta">A ${Math.round(s.distance)}m de você · Código ${s.stop.code || "—"}</div>
        </div>
      </div>
    `;
    routeDetailsEl.appendChild(card);
  });
}

// ── Realtime ───────────────────────────────────────────────────
async function startRealtimeTracking(itinerary) {
  if (activeRefreshTimer) clearInterval(activeRefreshTimer);

  const transitLegs = itinerary.legs.filter((l) => l.mode !== "WALK");

  const update = async () => {
    try {
      const query = `
      {
        vehiclePositions {
          vehicleId
          lat
          lon
          trip { id }
          route { shortName }
        }
      }`;

      const res = await fetch(OTP_GRAPHQL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query })
      });

      const data = await res.json();
      const vehicles = data?.data?.vehiclePositions || [];

      busMarkers.forEach((m) => mainMap.removeLayer(m));
      busMarkers = [];

      transitLegs.forEach((leg) => {
        const tripId = leg.tripId || leg.trip?.id;
        const bus = vehicles.find((v) => v.trip && v.trip.id === tripId);
        const statusNode = document.getElementById(`rt-${sanitizeId(tripId || leg.routeShortName || "bus")}`);

        if (bus && statusNode) {
          statusNode.innerHTML = `<span style="color:var(--accent)">● Ao vivo</span> - Localizado`;

          const marker = L.marker([bus.lat, bus.lon], {
            icon: L.divIcon({
              html: `<div class="live-bus-marker" style="background:var(--accent);width:15px;height:15px;border-radius:50%;border:2px solid white;box-shadow:var(--neon-glow);"></div>`,
              className: ""
            })
          }).addTo(mainMap);

          busMarkers.push(marker);
        } else if (statusNode) {
          statusNode.innerHTML = `<span style="color:var(--text-secondary)">Programado</span> - GPS indisponível agora`;
        }
      });
    } catch (e) {
      console.warn(e);
    }
  };

  await update();
  activeRefreshTimer = setInterval(update, 15000);
}

async function startRealtimeNearby() {
  if (activeRefreshTimer) clearInterval(activeRefreshTimer);

  const update = async () => {
    try {
      const query = `
      {
        vehiclePositions {
          vehicleId
          lat
          lon
          route { shortName }
        }
      }`;

      const res = await fetch(OTP_GRAPHQL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query })
      });

      const data = await res.json();
      const vehicles = data?.data?.vehiclePositions || [];

      busMarkers.forEach((m) => mainMap.removeLayer(m));
      busMarkers = [];

      vehicles.forEach((v) => {
        const marker = L.marker([v.lat, v.lon], {
          icon: L.divIcon({
            html: `<div style="background:var(--accent);width:10px;height:10px;border-radius:50%;border:1px solid white;"></div>`,
            className: ""
          })
        }).bindPopup(`Linha ${v.route?.shortName || "—"}`).addTo(mainMap);

        busMarkers.push(marker);
      });
    } catch (e) {
      console.warn(e);
    }
  };

  await update();
  activeRefreshTimer = setInterval(update, 20000);
}

// ── Helpers ────────────────────────────────────────────────────
function setLoading(isLoading) {
  if (btnRouteSearch) btnRouteSearch.disabled = isLoading;
  if (btnSpinner) btnSpinner.classList.toggle("hidden", !isLoading);
}

function showStatus(type, msg) {
  if (!statusEl) return;
  statusEl.className = `status ${type}`;
  statusEl.textContent = msg;
  statusEl.classList.remove("hidden");
}

function hideResults() {
  if (resultsEl) resultsEl.classList.add("hidden");
  if (statusEl) statusEl.classList.add("hidden");
}

function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

function sanitizeId(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "-");
}

function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function decodePolyline(str) {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const coordinates = [];

  while (index < str.length) {
    let shift = 0;
    let result = 0;
    let byte;

    do {
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const latitudeChange = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += latitudeChange;

    shift = 0;
    result = 0;

    do {
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const longitudeChange = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += longitudeChange;

    coordinates.push([lat / 1e5, lng / 1e5]);
  }

  return coordinates;
}