// ═══════════════════════════════════════════════════════════════
//  LocalizaBus — script.js  v2.0
//  Integração em tempo real com a API GraphQL do MobiliBus (OTP)
//  Correções: serviceDay + horários reais + mapa popup de localização
// ═══════════════════════════════════════════════════════════════

const OTP_GRAPHQL          = "https://otp.mobilibus.com/FY7J-lwk85QGbn/otp/routers/default/index/graphql";
const SEARCH_RADIUS_M      = 800;
const MAX_STOPS            = 5;
const DEPARTURES_PER_STOP  = 3;
const REALTIME_INTERVAL_MS = 30000;
const NOW_THRESHOLD_MIN    = 2; // minutos abaixo disso = "Agora"

// ── DOM ──────────────────────────────────────────────────────────
const btnSearch    = document.getElementById("btn-search");
const btnText      = document.getElementById("btn-text");
const btnSpinner   = document.getElementById("btn-spinner");
const btnIcon      = document.getElementById("btn-icon");
const statusEl     = document.getElementById("status");
const resultsEl    = document.getElementById("results");
const busListEl    = document.getElementById("bus-list");
const modalOverlay = document.getElementById("destination-modal");
const modalClose   = document.getElementById("modal-close");
const destInput    = document.getElementById("destination-input");
const btnConfirm   = document.getElementById("btn-confirm-dest");
const suggestionsEl= document.getElementById("suggestions-list");

// ── Ícones ───────────────────────────────────────────────────────
const busIconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="13" rx="2"/><rect x="5" y="8" width="4" height="3" rx="0.5"/><rect x="10" y="8" width="4" height="3" rx="0.5"/><rect x="15" y="8" width="3" height="3" rx="0.5"/><line x1="3" y1="13" x2="21" y2="13"/><line x1="12" y1="13" x2="12" y2="18"/><path d="M3 18v1a1 1 0 0 0 1 1h1M19 18v1a1 1 0 0 1-1 1h-1"/><circle cx="7" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/></svg>';
const liveIconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="currentColor"/></svg>';
const mapPinSvg   = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';

// ── Estado ───────────────────────────────────────────────────────
let selectedPlace              = null;
let destinationAbortController = null;
let currentOrigin              = null;
let realtimeTimer              = null;
let lastCountdownValue         = 0;
let autoRefreshInterval        = null;

// ═══════════════════════════════════════════════════════════════
//  UTILITÁRIOS DE HORÁRIO — CORREÇÃO PRINCIPAL
//
//  O OTP retorna:
//    serviceDay          → Unix timestamp (segundos) do dia de operação
//    scheduledDeparture  → segundos desde meia-noite DESSE dia
//    realtimeDeparture   → idem, com ajuste em tempo real
//
//  PROBLEMA ANTERIOR: o código calculava minsUntil() usando apenas
//  os segundos desde meia-noite e comparava com o horário atual do
//  dia — o que quebrava em viagens noturnas (>86400s) ou quando
//  serviceDay era diferente do dia atual. Resultado: tudo aparecia
//  como "Agora" porque a diferença era próxima de zero.
//
//  SOLUÇÃO: somar serviceDay + secondsSinceMidnight para obter
//  um timestamp Unix absoluto e correto.
// ═══════════════════════════════════════════════════════════════

function toAbsoluteDate(serviceDay, secondsSinceMidnight) {
  if (!Number.isFinite(serviceDay) || !Number.isFinite(secondsSinceMidnight)) return null;
  return new Date((serviceDay + secondsSinceMidnight) * 1000);
}

function minsUntilDate(targetDate) {
  if (!targetDate) return Infinity;
  return (targetDate.getTime() - Date.now()) / 60000;
}

function formatHHMM(date) {
  if (!date) return "--:--";
  return String(date.getHours()).padStart(2,"0") + ":" + String(date.getMinutes()).padStart(2,"0");
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) return "-";
  return meters >= 1000 ? (meters/1000).toFixed(1)+" km" : Math.round(meters)+" m";
}

function normalizeText(text) {
  return String(text || "").replace(/\s+/g," ").trim();
}

// ── UI helpers ───────────────────────────────────────────────────
function setLoading(loading) {
  btnSearch.disabled = loading;
  btnText.textContent = loading ? "Buscando..." : "Ver ônibus próximos";
  btnSpinner.classList.toggle("hidden", !loading);
  if (btnIcon) btnIcon.classList.toggle("hidden", loading);
}
function showStatus(type, message) {
  statusEl.className = "status " + type;
  statusEl.innerHTML = message;
  statusEl.classList.remove("hidden");
}
function hideStatus() { statusEl.classList.add("hidden"); }
function hideResults() { resultsEl.classList.add("hidden"); busListEl.innerHTML = ""; }

// ── Countdown ────────────────────────────────────────────────────
function startCountdown() {
  stopCountdown();
  let remaining = Math.round(REALTIME_INTERVAL_MS / 1000);
  function tick() {
    if (remaining <= 0) return;
    remaining--;
    lastCountdownValue = remaining;
    const bar = document.getElementById("countdown-bar");
    const txt = document.getElementById("countdown-text");
    if (bar) bar.style.width = ((remaining / (REALTIME_INTERVAL_MS/1000)) * 100) + "%";
    if (txt) txt.textContent = remaining + "s";
  }
  realtimeTimer = setInterval(tick, 1000);
}
function stopCountdown() {
  if (realtimeTimer) { clearInterval(realtimeTimer); realtimeTimer = null; }
}

// ── Modal de destino ─────────────────────────────────────────────
function openModal() {
  modalOverlay.classList.remove("hidden");
  destInput.value = ""; selectedPlace = null;
  suggestionsEl.innerHTML = ""; suggestionsEl.classList.add("hidden");
  setTimeout(() => destInput.focus(), 120);
}
function closeModal() {
  modalOverlay.classList.add("hidden");
  suggestionsEl.innerHTML = ""; suggestionsEl.classList.add("hidden");
}
if (modalClose)   modalClose.addEventListener("click", closeModal);
if (modalOverlay) modalOverlay.addEventListener("click", (e) => { if (e.target === modalOverlay) closeModal(); });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && modalOverlay && !modalOverlay.classList.contains("hidden")) closeModal();
});

// ── Sugestões de destino ─────────────────────────────────────────
async function searchDestinationSuggestions(query, origin = null) {
  if (!query || query.trim().length < 3) { suggestionsEl.innerHTML = ""; suggestionsEl.classList.add("hidden"); return; }
  if (destinationAbortController) destinationAbortController.abort();
  destinationAbortController = new AbortController();
  const params = new URLSearchParams({ q: query.trim(), limit: "5", lang: "pt" });
  if (origin && Number.isFinite(origin.lat) && Number.isFinite(origin.lon)) { params.set("lat", String(origin.lat)); params.set("lon", String(origin.lon)); }
  const response = await fetch(`https://photon.komoot.io/api/?${params}`, { signal: destinationAbortController.signal });
  if (!response.ok) throw new Error("Erro ao buscar sugestões.");
  const data = await response.json();
  const features = Array.isArray(data.features) ? data.features : [];
  suggestionsEl.innerHTML = "";
  if (!features.length) { suggestionsEl.classList.add("hidden"); return; }
  for (const feature of features) {
    const props = feature.properties || {};
    const coords = feature.geometry?.coordinates || [];
    const lon = Number(coords[0]); const lat = Number(coords[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const label = [props.name, props.street, props.housenumber, props.city, props.state].filter(Boolean).join(", ");
    const item = document.createElement("button");
    item.type = "button"; item.className = "suggestion-item"; item.textContent = label || "Destino sem nome";
    item.addEventListener("click", () => {
      selectedPlace = { name: props.name || label || "Destino selecionado", address: label || null, lat, lng: lon };
      destInput.value = selectedPlace.address || selectedPlace.name;
      suggestionsEl.innerHTML = ""; suggestionsEl.classList.add("hidden");
    });
    suggestionsEl.appendChild(item);
  }
  suggestionsEl.classList.remove("hidden");
}
if (destInput) {
  destInput.addEventListener("input", async () => { try { await searchDestinationSuggestions(destInput.value, currentOrigin); } catch (err) { if (err.name !== "AbortError") console.error(err); } });
  destInput.addEventListener("keydown", (e) => { if (e.key === "Enter") setTimeout(confirmDestination, 150); });
}

// ═══════════════════════════════════════════════════════════════
//  API — fetchNearbyStops
//  serviceDay adicionado na query
// ═══════════════════════════════════════════════════════════════
async function fetchNearbyStops(origin) {
  const query = `{
    stopsByRadius(lat: ${origin.lat}, lon: ${origin.lon}, radius: ${SEARCH_RADIUS_M}) {
      edges {
        node {
          stop {
            id name code lat lon
            stoptimesWithoutPatterns(numberOfDepartures: ${DEPARTURES_PER_STOP}, omitNonPickups: true) {
              serviceDay
              scheduledDeparture
              realtimeDeparture
              realtime
              realtimeState
              headsign
              trip {
                route { shortName longName color textColor mode }
              }
            }
          }
          distance
        }
      }
    }
  }`;

  const response = await fetch(OTP_GRAPHQL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ query })
  });
  if (!response.ok) throw new Error("Erro ao consultar a API de transporte.");
  const json = await response.json();
  if (json.errors && json.errors.length) throw new Error("Erro da API: " + json.errors[0].message);

  const edges = json?.data?.stopsByRadius?.edges || [];
  return edges
    .map(edge => ({
      id: edge.node.stop.id, name: edge.node.stop.name, code: edge.node.stop.code,
      lat: edge.node.stop.lat, lon: edge.node.stop.lon, distance: edge.node.distance,
      departures: edge.node.stop.stoptimesWithoutPatterns || []
    }))
    .filter(stop => stop.departures.length > 0)
    .slice(0, MAX_STOPS);
}

// ═══════════════════════════════════════════════════════════════
//  RENDER — usa toAbsoluteDate() para horários corretos
// ═══════════════════════════════════════════════════════════════
function renderStops(stops) {
  busListEl.innerHTML = "";

  if (!stops.length) {
    busListEl.innerHTML = `<p style="color:var(--text-secondary);text-align:center;padding:1.5rem 0;">Nenhuma parada encontrada no raio de ${SEARCH_RADIUS_M}m.</p>`;
    resultsEl.classList.remove("hidden");
    return;
  }

  stops.forEach(stop => {
    const card = document.createElement("div");
    card.className = "stop-card";

    const stopHeader = `<div class="stop-header">
      <div class="stop-icon">${busIconSvg}</div>
      <div class="stop-info">
        <div class="stop-name">${stop.name}</div>
        <div class="stop-meta">Código ${stop.code || "—"} · ${formatDistance(stop.distance)} de você</div>
      </div>
    </div>`;

    const departuresHtml = stop.departures.map(dep => {
      const isRealtime = dep.realtime === true;

      // ── HORÁRIO CORRETO ───────────────────────────────────────
      const secs    = isRealtime ? dep.realtimeDeparture : dep.scheduledDeparture;
      const depDate = toAbsoluteDate(dep.serviceDay, secs);
      const mins    = minsUntilDate(depDate);
      const timeStr = formatHHMM(depDate);
      // ─────────────────────────────────────────────────────────

      const headsign  = normalizeText(dep.headsign || dep.trip?.route?.longName || "");
      const shortName = dep.trip?.route?.shortName || "?";
      const bgColor   = dep.trip?.route?.color     ? "#" + dep.trip.route.color     : null;
      const fgColor   = dep.trip?.route?.textColor ? "#" + dep.trip.route.textColor : null;
      const badgeStyle= bgColor ? `style="background:${bgColor};color:${fgColor || '#fff'};"` : "";

      // Badge de tempo — sempre mostra o horário real
      let timeBadge;
      if (mins < NOW_THRESHOLD_MIN && mins > -5) {
        timeBadge = `<span class="dep-badge dep-now" title="Partida às ${timeStr}">Agora · ${timeStr}</span>`;
      } else if (mins <= 0) {
        timeBadge = `<span class="dep-badge dep-later">${timeStr}</span>`;
      } else if (mins <= 60) {
        const minsRounded = Math.round(mins);
        timeBadge = `<span class="dep-badge dep-soon" title="Partida às ${timeStr}">${minsRounded} min · ${timeStr}</span>`;
      } else {
        timeBadge = `<span class="dep-badge dep-later">${timeStr}</span>`;
      }

      const realtimeBadge = isRealtime
        ? `<span class="realtime-dot" title="Dado em tempo real">${liveIconSvg} Tempo real</span>`
        : `<span class="scheduled-dot" title="Horário programado">Programado</span>`;

      return `<div class="departure-row">
        <span class="route-badge" ${badgeStyle}>${shortName}</span>
        <span class="dep-headsign" title="${headsign}">${headsign}</span>
        <div class="dep-right">${realtimeBadge}${timeBadge}</div>
      </div>`;
    }).join("");

    card.innerHTML = stopHeader + `<div class="departures-list">${departuresHtml}</div>`;
    busListEl.appendChild(card);
  });

  resultsEl.classList.remove("hidden");
}

// ── Realtime bar ─────────────────────────────────────────────────
function updateRealtimeBar() {
  const timeStr = new Date().toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit", second:"2-digit" });
  const bar = document.getElementById("realtime-bar");
  if (bar) bar.innerHTML = `
    <span class="realtime-bar-label">${liveIconSvg} Atualizado às ${timeStr}</span>
    <span class="realtime-bar-countdown">Próxima atualização em <strong id="countdown-text">${Math.round(REALTIME_INTERVAL_MS/1000)}s</strong>
      <span class="countdown-track"><span id="countdown-bar" style="width:100%"></span></span>
    </span>`;
}
function injectRealtimeBar() {
  if (document.getElementById("realtime-bar")) return;
  const bar = document.createElement("div");
  bar.id = "realtime-bar"; bar.className = "realtime-bar";
  resultsEl.insertBefore(bar, resultsEl.querySelector("#bus-list"));
  updateRealtimeBar();
}
async function silentRefresh() {
  if (!currentOrigin) return;
  try { const stops = await fetchNearbyStops(currentOrigin); renderStops(stops); updateRealtimeBar(); startCountdown(); }
  catch (err) { console.warn("Erro na atualização silenciosa:", err.message); }
}
function stopAutoRefresh() {
  if (autoRefreshInterval) { clearInterval(autoRefreshInterval); autoRefreshInterval = null; }
  stopCountdown();
}
function startAutoRefresh() {
  stopAutoRefresh(); updateRealtimeBar(); startCountdown();
  autoRefreshInterval = setInterval(silentRefresh, REALTIME_INTERVAL_MS);
}

// ── Geolocalização ───────────────────────────────────────────────
function captureLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error("Geolocalização não suportada.")); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => { const msgs = {1:"Permissão negada.",2:"Localização indisponível.",3:"Tempo esgotado."}; reject(new Error(msgs[err.code] || "Erro ao obter localização.")); },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  });
}

// ═══════════════════════════════════════════════════════════════
//  MAPA POPUP
// ═══════════════════════════════════════════════════════════════
let mapInstance      = null;
let mapMarker        = null;
let mapSelectedLatLon= null;

function injectMapModalHTML() {
  if (document.getElementById("map-modal")) return;
  const div = document.createElement("div");
  div.id = "map-modal";
  div.className = "modal-overlay hidden";
  div.style.cssText = "z-index:2000;";
  div.innerHTML = `
    <div class="modal-card" style="width:min(520px,96vw);padding:0;overflow:hidden;border-radius:var(--radius);">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--border);">
        <div>
          <div style="font-weight:600;font-size:15px;color:var(--text-primary);">Escolher localização no mapa</div>
          <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">Clique no mapa para marcar sua posição</div>
        </div>
        <button id="map-modal-close" style="background:none;border:none;cursor:pointer;color:var(--text-secondary);font-size:22px;line-height:1;padding:4px 8px;">×</button>
      </div>
      <div id="leaflet-map" style="width:100%;height:360px;"></div>
      <div style="padding:12px 18px;border-top:1px solid var(--border);display:flex;align-items:center;gap:10px;justify-content:space-between;flex-wrap:wrap;">
        <div id="map-coords-label" style="font-size:12px;color:var(--text-secondary);flex:1;min-width:0;">Nenhum ponto selecionado</div>
        <div style="display:flex;gap:8px;">
          <button id="map-use-gps" class="btn-secondary" style="padding:8px 14px;font-size:13px;">📍 Usar GPS</button>
          <button id="map-confirm" class="btn-primary neon-glow" style="padding:8px 18px;font-size:13px;" disabled>Confirmar</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(div);
  div.addEventListener("click", (e) => { if (e.target === div) closeMapModal(); });
  document.getElementById("map-modal-close").addEventListener("click", closeMapModal);
  document.getElementById("map-use-gps").addEventListener("click", async () => {
    try { const c = await captureLocation(); setMapPin(c.lat, c.lon); mapInstance.setView([c.lat, c.lon], 15); }
    catch (err) { alert(err.message); }
  });
  document.getElementById("map-confirm").addEventListener("click", () => {
    if (!mapSelectedLatLon) return;
    currentOrigin = { lat: mapSelectedLatLon.lat, lon: mapSelectedLatLon.lon };
    closeMapModal();
    runSearch(currentOrigin);
  });
}

function loadLeafletIfNeeded() {
  return new Promise((resolve) => {
    if (window.L) { resolve(); return; }
    const css = document.createElement("link");
    css.rel = "stylesheet"; css.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
    document.head.appendChild(css);
    const js = document.createElement("script");
    js.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    js.onload = resolve; document.head.appendChild(js);
  });
}

async function openMapModal(initialCoords) {
  injectMapModalHTML();
  await loadLeafletIfNeeded();
  const modal = document.getElementById("map-modal");
  modal.classList.remove("hidden");

  if (!mapInstance) {
    const center = initialCoords ? [initialCoords.lat, initialCoords.lon] : [-15.7795, -47.9297];
    mapInstance = L.map("leaflet-map").setView(center, 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap", maxZoom: 19
    }).addTo(mapInstance);
    mapInstance.on("click", (e) => setMapPin(e.latlng.lat, e.latlng.lng));
  }
  setTimeout(() => mapInstance.invalidateSize(), 150);

  if (initialCoords) {
    setMapPin(initialCoords.lat, initialCoords.lon);
    mapInstance.setView([initialCoords.lat, initialCoords.lon], 15);
  } else {
    try {
      const c = await captureLocation();
      setMapPin(c.lat, c.lon);
      mapInstance.setView([c.lat, c.lon], 15);
    } catch (_) {}
  }
}

function setMapPin(lat, lon) {
  mapSelectedLatLon = { lat, lon };
  const accentColor = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#00ff99";
  const icon = L.divIcon({
    html: `<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:${accentColor};border:2px solid rgba(255,255,255,0.9);transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,0.5);"></div>`,
    className: "", iconSize: [22,22], iconAnchor: [11,22]
  });
  if (mapMarker) mapMarker.setLatLng([lat, lon]);
  else mapMarker = L.marker([lat, lon], { icon }).addTo(mapInstance);

  const label = document.getElementById("map-coords-label");
  if (label) label.textContent = `Lat: ${lat.toFixed(5)}, Lon: ${lon.toFixed(5)}`;
  const confirmBtn = document.getElementById("map-confirm");
  if (confirmBtn) confirmBtn.disabled = false;
}

function closeMapModal() {
  const modal = document.getElementById("map-modal");
  if (modal) modal.classList.add("hidden");
}

// ── Botão "Escolher no mapa" ─────────────────────────────────────
function injectMapButton() {
  if (document.getElementById("btn-open-map")) return;
  const actionsEl = document.querySelector(".actions");
  if (!actionsEl) return;
  const btn = document.createElement("button");
  btn.id = "btn-open-map"; btn.className = "btn-secondary";
  btn.innerHTML = `${mapPinSvg}<span style="margin-left:4px;">Escolher no mapa</span>`;
  btn.addEventListener("click", () => openMapModal(currentOrigin));
  const bsEl = actionsEl.querySelector("#btn-search");
  if (bsEl && bsEl.parentNode) bsEl.parentNode.insertBefore(btn, bsEl.nextSibling);
  else actionsEl.appendChild(btn);
}

// ── Fluxo principal ──────────────────────────────────────────────
async function runSearch(origin) {
  hideResults(); hideStatus(); stopAutoRefresh(); setLoading(true);
  showStatus("loading", "🔍 Buscando paradas próximas...");
  try {
    const stops = await fetchNearbyStops(origin);
    hideStatus(); renderStops(stops); injectRealtimeBar(); startAutoRefresh();
  } catch (err) {
    showStatus("error", err.message || "Erro ao buscar dados.");
  } finally { setLoading(false); }
}

async function handleSearch() {
  hideResults(); hideStatus(); stopAutoRefresh(); setLoading(true);
  showStatus("loading", "📍 Obtendo sua localização...");
  try {
    currentOrigin = await captureLocation();
    await runSearch(currentOrigin);
  } catch (err) {
    showStatus("error", err.message || "Erro ao buscar dados."); setLoading(false);
  }
}

async function confirmDestination() {
  const text = normalizeText(destInput.value);
  if (!text) { destInput.focus(); showStatus("error", "Digite um destino."); return; }
  hideStatus(); setLoading(true);
  try {
    if (!currentOrigin) throw new Error("Localização não disponível. Tente novamente.");
    closeModal(); await runSearch(currentOrigin);
  } catch (err) { console.error(err); showStatus("error", err.message || "Erro ao buscar dados."); }
  finally { setLoading(false); }
}

// ── Eventos ──────────────────────────────────────────────────────
if (btnSearch) btnSearch.addEventListener("click", handleSearch);
if (btnConfirm) btnConfirm.addEventListener("click", confirmDestination);
window.addEventListener("beforeunload", stopAutoRefresh);
document.addEventListener("DOMContentLoaded", injectMapButton);
if (document.readyState !== "loading") injectMapButton();

// ── Tema ─────────────────────────────────────────────────────────
const themeToggle = document.getElementById("theme-toggle");
const themeLabel  = document.getElementById("theme-label");
const logoImg     = document.getElementById("logo-img");
const html        = document.documentElement;
const THEME_STORAGE_KEY = "lb-theme";

function updateLogoForTheme() {
  if (logoImg) logoImg.src = "img/white-removebg-preview.png";
}
function applyTheme(theme) {
  if (theme === "light") { html.setAttribute("data-theme","light"); themeLabel.textContent = "Modo escuro"; }
  else { html.removeAttribute("data-theme"); themeLabel.textContent = "Modo claro"; }
  updateLogoForTheme();
  try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch (_) {}
}
(function initTheme() {
  let savedTheme = null;
  try { savedTheme = localStorage.getItem(THEME_STORAGE_KEY); } catch (_) {}
  applyTheme(savedTheme || (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"));
  if (themeToggle) themeToggle.addEventListener("click", () => {
    applyTheme(html.getAttribute("data-theme") === "light" ? "dark" : "light");
  });
})();
