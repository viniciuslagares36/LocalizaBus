// ═══════════════════════════════════════════════════════════════
//  LocalizaBus — script.js
//  Integração em tempo real com a API GraphQL do MobiliBus (OTP)
//  Atualização automática a cada 30 segundos
// ═══════════════════════════════════════════════════════════════

const OTP_GRAPHQL = "https://otp.mobilibus.com/FY7J-lwk85QGbn/otp/routers/default/index/graphql";
const SEARCH_RADIUS_M = 800;          // raio de busca de paradas (metros)
const MAX_STOPS = 5;                  // máximo de paradas a exibir
const DEPARTURES_PER_STOP = 3;        // próximas partidas por parada
const REALTIME_INTERVAL_MS = 30000;   // intervalo de atualização (30 s)

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
const suggestionsEl = document.getElementById("suggestions-list");

// ── Estado ───────────────────────────────────────────────────────
let selectedPlace             = null;
let destinationAbortController = null;
let currentOrigin             = null;
let realtimeTimer             = null;   // setInterval para atualização
let lastCountdownValue        = 0;

// ── Ícones ───────────────────────────────────────────────────────
const busIconSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="13" rx="2"/><rect x="5" y="8" width="4" height="3" rx="0.5"/><rect x="10" y="8" width="4" height="3" rx="0.5"/><rect x="15" y="8" width="3" height="3" rx="0.5"/><line x1="3" y1="13" x2="21" y2="13"/><line x1="12" y1="13" x2="12" y2="18"/><path d="M3 18v1a1 1 0 0 0 1 1h1M19 18v1a1 1 0 0 1-1 1h-1"/><circle cx="7" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/></svg>';

const liveIconSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="currentColor"/></svg>';

// ── Utilitários ──────────────────────────────────────────────────
function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

/**
 * Converte segundos desde meia-noite em string "HH:MM".
 * @param {number} secs
 */
function secsToHHMM(secs) {
  if (!Number.isFinite(secs) || secs < 0) return "--:--";
  const totalMinutes = Math.floor(secs / 60);
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

/**
 * Calcula quantos minutos faltam para uma partida (segundos desde meia-noite).
 * @param {number} departureSecs
 */
function minsUntil(departureSecs) {
  const now = new Date();
  const nowSecs = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const diff = departureSecs - nowSecs;
  return Math.round(diff / 60);
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) return "-";
  if (meters >= 1000) return (meters / 1000).toFixed(1) + " km";
  return Math.round(meters) + " m";
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

function hideStatus() {
  statusEl.classList.add("hidden");
}

function hideResults() {
  resultsEl.classList.add("hidden");
  busListEl.innerHTML = "";
}

// ── Contador regressivo na barra de status ────────────────────────
function startCountdown() {
  stopCountdown();
  let remaining = Math.round(REALTIME_INTERVAL_MS / 1000);
  lastCountdownValue = remaining;

  function tick() {
    if (remaining <= 0) return;
    remaining--;
    lastCountdownValue = remaining;
    const bar = document.getElementById("countdown-bar");
    const txt = document.getElementById("countdown-text");
    if (bar) bar.style.width = ((remaining / (REALTIME_INTERVAL_MS / 1000)) * 100) + "%";
    if (txt) txt.textContent = remaining + "s";
  }

  realtimeTimer = setInterval(tick, 1000);
}

function stopCountdown() {
  if (realtimeTimer) {
    clearInterval(realtimeTimer);
    realtimeTimer = null;
  }
}

// ── Modal ────────────────────────────────────────────────────────
function openModal() {
  modalOverlay.classList.remove("hidden");
  destInput.value = "";
  selectedPlace = null;
  suggestionsEl.innerHTML = "";
  suggestionsEl.classList.add("hidden");
  setTimeout(() => destInput.focus(), 120);
}

function closeModal() {
  modalOverlay.classList.add("hidden");
  suggestionsEl.innerHTML = "";
  suggestionsEl.classList.add("hidden");
}

if (modalClose)   modalClose.addEventListener("click", closeModal);
if (modalOverlay) modalOverlay.addEventListener("click", (e) => { if (e.target === modalOverlay) closeModal(); });

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && modalOverlay && !modalOverlay.classList.contains("hidden")) closeModal();
});

// ── Geolocalização ───────────────────────────────────────────────
function captureLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocalização não suportada pelo seu navegador."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => {
        const msgs = {
          1: "Permissão de localização negada.",
          2: "Localização indisponível.",
          3: "Tempo esgotado ao buscar localização."
        };
        reject(new Error(msgs[err.code] || "Erro ao obter localização."));
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  });
}

// ── Sugestões de destino (Photon / Komoot) ───────────────────────
async function searchDestinationSuggestions(query, origin = null) {
  if (!query || query.trim().length < 3) {
    suggestionsEl.innerHTML = "";
    suggestionsEl.classList.add("hidden");
    return;
  }

  if (destinationAbortController) destinationAbortController.abort();
  destinationAbortController = new AbortController();

  const params = new URLSearchParams({ q: query.trim(), limit: "5", lang: "pt" });
  if (origin && Number.isFinite(origin.lat) && Number.isFinite(origin.lon)) {
    params.set("lat", String(origin.lat));
    params.set("lon", String(origin.lon));
  }

  const response = await fetch(`https://photon.komoot.io/api/?${params}`, {
    signal: destinationAbortController.signal
  });
  if (!response.ok) throw new Error("Erro ao buscar sugestões de destino.");

  const data = await response.json();
  const features = Array.isArray(data.features) ? data.features : [];

  suggestionsEl.innerHTML = "";
  if (!features.length) { suggestionsEl.classList.add("hidden"); return; }

  for (const feature of features) {
    const props  = feature.properties || {};
    const coords = feature.geometry?.coordinates || [];
    const lon    = Number(coords[0]);
    const lat    = Number(coords[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const label = [props.name, props.street, props.housenumber, props.city, props.state]
      .filter(Boolean).join(", ");

    const item = document.createElement("button");
    item.type = "button";
    item.className = "suggestion-item";
    item.textContent = label || "Destino sem nome";
    item.addEventListener("click", () => {
      selectedPlace = { name: props.name || label || "Destino selecionado", address: label || null, lat, lng: lon };
      destInput.value = selectedPlace.address || selectedPlace.name;
      suggestionsEl.innerHTML = "";
      suggestionsEl.classList.add("hidden");
    });
    suggestionsEl.appendChild(item);
  }
  suggestionsEl.classList.remove("hidden");
}

if (destInput) {
  destInput.addEventListener("input", async () => {
    try { await searchDestinationSuggestions(destInput.value, currentOrigin); }
    catch (err) { if (err.name !== "AbortError") console.error(err); }
  });
  destInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") setTimeout(confirmDestination, 150);
  });
}

// ── API MobiliBus — paradas próximas com horários em tempo real ──
/**
 * Consulta a API GraphQL do OTP/MobiliBus para buscar paradas
 * próximas e os próximos horários de partida de cada linha.
 *
 * @param {{ lat: number, lon: number }} origin
 * @returns {Promise<Array>}  lista de paradas com departures
 */
async function fetchNearbyStops(origin) {
  const query = `{
    stopsByRadius(lat: ${origin.lat}, lon: ${origin.lon}, radius: ${SEARCH_RADIUS_M}) {
      edges {
        node {
          stop {
            id
            name
            code
            lat
            lon
            stoptimesWithoutPatterns(numberOfDepartures: ${DEPARTURES_PER_STOP}, omitNonPickups: true) {
              scheduledDeparture
              realtimeDeparture
              realtime
              realtimeState
              headsign
              trip {
                route {
                  shortName
                  longName
                  color
                  textColor
                  mode
                }
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
  if (json.errors && json.errors.length) {
    throw new Error("Erro da API: " + json.errors[0].message);
  }

  const edges = json?.data?.stopsByRadius?.edges || [];
  return edges
    .map(edge => ({
      id:         edge.node.stop.id,
      name:       edge.node.stop.name,
      code:       edge.node.stop.code,
      lat:        edge.node.stop.lat,
      lon:        edge.node.stop.lon,
      distance:   edge.node.distance,
      departures: edge.node.stop.stoptimesWithoutPatterns || []
    }))
    .filter(stop => stop.departures.length > 0)
    .slice(0, MAX_STOPS);
}

// ── Renderização dos resultados ──────────────────────────────────
/**
 * Renderiza os cards de paradas com as próximas partidas.
 * @param {Array} stops
 */
function renderStops(stops) {
  busListEl.innerHTML = "";

  if (!stops || stops.length === 0) {
    showStatus("empty", "Nenhuma parada com ônibus encontrada no raio de " + SEARCH_RADIUS_M + " m.");
    hideResults();
    return;
  }

  hideStatus();

  stops.forEach((stop, i) => {
    const card = document.createElement("div");
    card.className = "bus-card";
    card.style.animationDelay = `${i * 0.08}s`;

    // ── Cabeçalho da parada ──
    const stopHeader = `
      <div class="stop-header">
        <div class="bus-card-icon">${busIconSvg}</div>
        <div class="stop-info">
          <p class="stop-name">${stop.name}</p>
          <p class="stop-meta">${stop.code ? "Código " + stop.code + " · " : ""}${formatDistance(stop.distance)} de você</p>
        </div>
      </div>`;

    // ── Lista de próximas partidas ──
    const departuresHtml = stop.departures.map(dep => {
      const route       = dep.trip?.route || {};
      const shortName   = route.shortName || "—";
      const longName    = route.longName  || "";
      const headsign    = dep.headsign    || longName || "—";
      const isRealtime  = dep.realtime === true;
      const depSecs     = isRealtime ? dep.realtimeDeparture : dep.scheduledDeparture;
      const mins        = minsUntil(depSecs);
      const timeStr     = secsToHHMM(depSecs);

      // Cor da linha (fallback verde LocalizaBus)
      const bgColor   = route.color    ? "#" + route.color.replace("#", "")    : null;
      const fgColor   = route.textColor ? "#" + route.textColor.replace("#", "") : null;
      const badgeStyle = bgColor
        ? `style="background:${bgColor};color:${fgColor || '#fff'};"`
        : "";

      // Badge de tempo
      let timeBadge;
      if (mins <= 0) {
        timeBadge = `<span class="dep-badge dep-now">Agora</span>`;
      } else if (mins <= 60) {
        timeBadge = `<span class="dep-badge dep-soon">${mins} min</span>`;
      } else {
        timeBadge = `<span class="dep-badge dep-later">${timeStr}</span>`;
      }

      // Indicador de tempo real
      const realtimeBadge = isRealtime
        ? `<span class="realtime-dot" title="Dado em tempo real">${liveIconSvg} Tempo real</span>`
        : `<span class="scheduled-dot" title="Horário programado">Programado</span>`;

      return `
        <div class="departure-row">
          <span class="route-badge" ${badgeStyle}>${shortName}</span>
          <span class="dep-headsign" title="${headsign}">${headsign}</span>
          <div class="dep-right">
            ${realtimeBadge}
            ${timeBadge}
          </div>
        </div>`;
    }).join("");

    card.innerHTML = stopHeader + `<div class="departures-list">${departuresHtml}</div>`;
    busListEl.appendChild(card);
  });

  resultsEl.classList.remove("hidden");
}

// ── Atualização em tempo real ────────────────────────────────────
let autoRefreshInterval = null;

function stopAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
  }
  stopCountdown();
}

/**
 * Busca e renderiza paradas próximas silenciosamente (sem spinner).
 */
async function silentRefresh() {
  if (!currentOrigin) return;
  try {
    const stops = await fetchNearbyStops(currentOrigin);
    renderStops(stops);
    updateRealtimeBar();
    startCountdown();
  } catch (err) {
    console.warn("Erro na atualização silenciosa:", err.message);
  }
}

/**
 * Atualiza a barra de status com o timestamp da última atualização
 * e inicia o contador regressivo.
 */
function updateRealtimeBar() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const bar = document.getElementById("realtime-bar");
  if (bar) {
    bar.innerHTML = `
      <span class="realtime-bar-label">
        ${liveIconSvg} Atualizado às ${timeStr}
      </span>
      <span class="realtime-bar-countdown">
        Próxima atualização em <strong id="countdown-text">${Math.round(REALTIME_INTERVAL_MS / 1000)}s</strong>
        <span class="countdown-track"><span id="countdown-bar" style="width:100%"></span></span>
      </span>`;
  }
}

function startAutoRefresh() {
  stopAutoRefresh();
  updateRealtimeBar();
  startCountdown();
  autoRefreshInterval = setInterval(silentRefresh, REALTIME_INTERVAL_MS);
}

// ── Fluxo principal ──────────────────────────────────────────────
async function handleSearch() {
  hideResults();
  hideStatus();
  stopAutoRefresh();
  setLoading(true);
  showStatus("loading", "📍 Obtendo sua localização...");

  try {
    currentOrigin = await captureLocation();
    hideStatus();
    showStatus("loading", "🔍 Buscando paradas próximas...");

    const stops = await fetchNearbyStops(currentOrigin);
    hideStatus();
    renderStops(stops);

    // Injetar barra de tempo real abaixo do título
    injectRealtimeBar();
    startAutoRefresh();

  } catch (err) {
    showStatus("error", err.message || "Erro ao buscar dados.");
  } finally {
    setLoading(false);
  }
}

/**
 * Injeta a barra de status de tempo real no DOM (apenas uma vez).
 */
function injectRealtimeBar() {
  if (document.getElementById("realtime-bar")) return;
  const bar = document.createElement("div");
  bar.id = "realtime-bar";
  bar.className = "realtime-bar";
  resultsEl.insertBefore(bar, resultsEl.querySelector("#bus-list"));
  updateRealtimeBar();
}

// ── Confirmação de destino (modal) ───────────────────────────────
async function confirmDestination() {
  const text = normalizeText(destInput.value);
  if (!text) { destInput.focus(); showStatus("error", "Digite um destino."); return; }

  hideStatus();
  setLoading(true);

  try {
    if (!currentOrigin) throw new Error("Localização não disponível. Tente novamente.");
    closeModal();
    hideResults();
    stopAutoRefresh();
    showStatus("loading", "🔍 Buscando paradas próximas...");

    const stops = await fetchNearbyStops(currentOrigin);
    hideStatus();
    renderStops(stops);
    injectRealtimeBar();
    startAutoRefresh();

  } catch (err) {
    console.error(err);
    showStatus("error", err.message || "Erro ao buscar dados.");
  } finally {
    setLoading(false);
  }
}

// ── Eventos ──────────────────────────────────────────────────────
if (btnSearch) btnSearch.addEventListener("click", handleSearch);
if (btnConfirm) btnConfirm.addEventListener("click", confirmDestination);

// Limpar atualização automática ao sair da página
window.addEventListener("beforeunload", stopAutoRefresh);

// ── Tema ─────────────────────────────────────────────────────────
const themeToggle     = document.getElementById("theme-toggle");
const themeLabel      = document.getElementById("theme-label");
const logoImg         = document.getElementById("logo-img");
const html            = document.documentElement;
const THEME_STORAGE_KEY = "lb-theme";

function updateLogoForTheme() {
  if (logoImg) logoImg.src = "img/white-removebg-preview.png";
}

function applyTheme(theme) {
  if (theme === "light") {
    html.setAttribute("data-theme", "light");
    themeLabel.textContent = "Modo escuro";
  } else {
    html.removeAttribute("data-theme");
    themeLabel.textContent = "Modo claro";
  }
  updateLogoForTheme();
  try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch (_) {}
}

(function initTheme() {
  let savedTheme = null;
  try { savedTheme = localStorage.getItem(THEME_STORAGE_KEY); } catch (_) {}
  const defaultTheme = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  applyTheme(savedTheme || defaultTheme);
  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const isLight = html.getAttribute("data-theme") === "light";
      applyTheme(isLight ? "dark" : "light");
    });
  }
})();
