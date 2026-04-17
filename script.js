const API_URL = "https://viniciuslagares36.app.n8n.cloud/webhook/consultar-onibus";

// --- DOM ---
const btnSearch = document.getElementById("btn-search");
const btnText = document.getElementById("btn-text");
const btnSpinner = document.getElementById("btn-spinner");
const btnIcon = document.getElementById("btn-icon");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");
const busListEl = document.getElementById("bus-list");

const modalOverlay = document.getElementById("destination-modal");
const modalClose = document.getElementById("modal-close");
const destInput = document.getElementById("destination-input");
const btnConfirm = document.getElementById("btn-confirm-dest");
const suggestionsEl = document.getElementById("suggestions-list");

// --- State ---
let selectedPlace = null;
let destinationAbortController = null;
let currentOrigin = null;

// --- Icons ---
const busIconSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="13" rx="2"/><rect x="5" y="8" width="4" height="3" rx="0.5"/><rect x="10" y="8" width="4" height="3" rx="0.5"/><rect x="15" y="8" width="3" height="3" rx="0.5"/><line x1="3" y1="13" x2="21" y2="13"/><line x1="12" y1="13" x2="12" y2="18"/><path d="M3 18v1a1 1 0 0 0 1 1h1M19 18v1a1 1 0 0 1-1 1h-1"/><circle cx="7" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/></svg>';

// --- Helpers ---
function formatDistance(meters) {
  if (!Number.isFinite(meters)) return "-";
  if (meters >= 1000) return (meters / 1000).toFixed(1) + " km";
  return Math.round(meters) + "m";
}

function setLoading(loading) {
  btnSearch.disabled = loading;
  btnText.textContent = loading ? "Buscando..." : "Ver ônibus próximos";
  btnSpinner.classList.toggle("hidden", !loading);
  if (btnIcon) btnIcon.classList.toggle("hidden", loading);
}

function showStatus(type, message) {
  statusEl.className = "status " + type;
  statusEl.textContent = message;
  statusEl.classList.remove("hidden");
}

function hideStatus() {
  statusEl.classList.add("hidden");
}

function hideResults() {
  resultsEl.classList.add("hidden");
  busListEl.innerHTML = "";
}

// --- Modal ---
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

if (modalClose) {
  modalClose.addEventListener("click", closeModal);
}

if (modalOverlay) {
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) closeModal();
  });
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && modalOverlay && !modalOverlay.classList.contains("hidden")) {
    closeModal();
  }
});

// --- Location ---
function captureLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocalização não suportada pelo seu navegador."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude
        });
      },
      (err) => {
        switch (err.code) {
          case 1:
            reject(new Error("Permissão de localização negada."));
            break;
          case 2:
            reject(new Error("Localização indisponível."));
            break;
          case 3:
            reject(new Error("Tempo esgotado ao buscar localização."));
            break;
          default:
            reject(new Error("Erro ao obter localização."));
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 30000
      }
    );
  });
}

// --- Photon ---
async function searchDestinationSuggestions(query, origin = null) {
  if (!query || query.trim().length < 3) {
    suggestionsEl.innerHTML = "";
    suggestionsEl.classList.add("hidden");
    return;
  }

  if (destinationAbortController) {
    destinationAbortController.abort();
  }

  destinationAbortController = new AbortController();

  const params = new URLSearchParams({
    q: query.trim(),
    limit: "5",
    lang: "pt"
  });

  if (origin && Number.isFinite(origin.lat) && Number.isFinite(origin.lon)) {
    params.set("lat", String(origin.lat));
    params.set("lon", String(origin.lon));
  }

  const url = `https://photon.komoot.io/api/?${params.toString()}`;
  const response = await fetch(url, { signal: destinationAbortController.signal });

  if (!response.ok) {
    throw new Error("Erro ao buscar sugestões de destino.");
  }

  const data = await response.json();
  const features = Array.isArray(data.features) ? data.features : [];

  suggestionsEl.innerHTML = "";

  if (!features.length) {
    suggestionsEl.classList.add("hidden");
    return;
  }

  for (const feature of features) {
    const props = feature.properties || {};
    const coords = feature.geometry?.coordinates || [];
    const lon = Number(coords[0]);
    const lat = Number(coords[1]);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const labelParts = [
      props.name,
      props.street,
      props.housenumber,
      props.city,
      props.state
    ].filter(Boolean);

    const label = labelParts.join(", ");

    const item = document.createElement("button");
    item.type = "button";
    item.className = "suggestion-item";
    item.textContent = label || "Destino sem nome";

    item.addEventListener("click", () => {
      selectedPlace = {
        name: props.name || label || "Destino selecionado",
        address: label || null,
        lat,
        lng: lon
      };

      destInput.value = selectedPlace.address || selectedPlace.name;
      suggestionsEl.innerHTML = "";
      suggestionsEl.classList.add("hidden");
    });

    suggestionsEl.appendChild(item);
  }

  suggestionsEl.classList.remove("hidden");
}

async function resolveDestinationFromText(query, origin = null) {
  if (!query || query.trim().length < 2) return null;

  const params = new URLSearchParams({
    q: query.trim(),
    limit: "1",
    lang: "pt"
  });

  if (origin && Number.isFinite(origin.lat) && Number.isFinite(origin.lon)) {
    params.set("lat", String(origin.lat));
    params.set("lon", String(origin.lon));
  }

  const url = `https://photon.komoot.io/api/?${params.toString()}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Erro ao localizar o destino digitado.");
  }

  const data = await response.json();
  const feature = Array.isArray(data.features) ? data.features[0] : null;
  if (!feature) return null;

  const props = feature.properties || {};
  const coords = feature.geometry?.coordinates || [];
  const lon = Number(coords[0]);
  const lat = Number(coords[1]);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const labelParts = [
    props.name,
    props.street,
    props.housenumber,
    props.city,
    props.state
  ].filter(Boolean);

  const label = labelParts.join(", ");

  return {
    destinationText: props.name || label || query.trim(),
    destinationAddress: label || null,
    destinationLat: lat,
    destinationLng: lon
  };
}

if (destInput) {
  destInput.addEventListener("input", async () => {
    try {
      await searchDestinationSuggestions(destInput.value, currentOrigin);
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error(err);
      }
    }
  });

  destInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      setTimeout(confirmDestination, 150);
    }
  });
}

// --- Destination ---
function captureDestination() {
  const text = (destInput.value || "").trim();
  if (!text) return null;

  if (selectedPlace) {
    return {
      destinationText: selectedPlace.name,
      destinationAddress: selectedPlace.address,
      destinationLat: selectedPlace.lat,
      destinationLng: selectedPlace.lng
    };
  }

  return {
    destinationText: text,
    destinationAddress: null,
    destinationLat: null,
    destinationLng: null
  };
}

function preparePayload(origin, destination) {
  return {
    originLat: origin.lat,
    originLon: origin.lon,
    destinationText: destination.destinationText,
    destinationAddress: destination.destinationAddress || null,
    destinationLat: destination.destinationLat,
    destinationLng: destination.destinationLng
  };
}

// --- API ---
async function fetchRouteSearch(payload) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error("Erro na comunicação com o servidor.");
  }

  return await response.json();
}

// --- Main Flow ---
async function handleSearch() {
  hideResults();
  hideStatus();
  setLoading(true);
  showStatus("loading", "Pegando sua localização...");

  try {
    currentOrigin = await captureLocation();
    openModal();
    hideStatus();
  } catch (err) {
    showStatus("error", err.message || "Erro ao obter localização.");
  } finally {
    setLoading(false);
  }
}

async function confirmDestination() {
  let dest = captureDestination();

  if (!dest) {
    destInput.focus();
    showStatus("error", "Digite um destino.");
    return;
  }

  hideStatus();
  setLoading(true);

  try {
    if (!currentOrigin) {
      throw new Error("Localização não disponível. Tente novamente.");
    }

    if (!dest.destinationLat || !dest.destinationLng) {
      showStatus("loading", "Buscando destino...");
      const resolved = await resolveDestinationFromText(dest.destinationText, currentOrigin);

      if (!resolved) {
        throw new Error("Não consegui localizar esse destino. Tente um nome mais completo.");
      }

      dest = resolved;
      selectedPlace = {
        name: dest.destinationText,
        address: dest.destinationAddress,
        lat: dest.destinationLat,
        lng: dest.destinationLng
      };
    }

    closeModal();
    hideResults();
    showStatus("loading", "Consultando rota...");

    const payload = preparePayload(currentOrigin, dest);
    const data = await fetchRouteSearch(payload);

    hideStatus();

    if (data.success && Array.isArray(data.buses) && data.buses.length > 0) {
      const sorted = data.buses
        .slice()
        .sort((a, b) => Number(a.distanceKm || 0) - Number(b.distanceKm || 0))
        .slice(0, 5);

      renderBuses(sorted);
    } else {
      showStatus("empty", "Não encontramos linhas compatíveis para esse destino.");
    }
  } catch (err) {
    console.error(err);
    showStatus("error", err.message || "Erro ao buscar dados.");
  } finally {
    setLoading(false);
  }
}

// --- Render ---
function renderBuses(buses) {
  busListEl.innerHTML = "";

  buses.forEach((bus, i) => {
    const meters = Number(bus.distanceKm || 0) * 1000;
    const card = document.createElement("div");
    card.className = "bus-card";
    card.style.animationDelay = `${i * 0.1}s`;

    const arrivalHtml = bus.arrivalMin != null
      ? `<p class="bus-card-arrival">Chega em ${bus.arrivalMin} min</p>`
      : "";

    const timeHtml = bus.scheduledTime
      ? `<p class="bus-card-time">Passa às ${bus.scheduledTime}</p>`
      : "";

    const distanceHtml = `<p class="bus-card-distance-label">${formatDistance(meters)} de distância</p>`;

    card.innerHTML =
      `<div class="bus-card-icon">${busIconSvg}</div>
       <div class="bus-card-info">
         <p class="bus-card-route">Linha ${bus.routeId || "-"}</p>
         ${arrivalHtml}
         ${timeHtml}
         ${distanceHtml}
       </div>
       <div class="bus-card-distance">${formatDistance(meters)}</div>`;

    busListEl.appendChild(card);
  });

  resultsEl.classList.remove("hidden");
}

// --- Events ---
if (btnSearch) btnSearch.addEventListener("click", handleSearch);
if (btnConfirm) btnConfirm.addEventListener("click", confirmDestination);

// --- Theme ---
const themeToggle = document.getElementById("theme-toggle");
const themeLabel = document.getElementById("theme-label");
const logoImg = document.getElementById("logo-img");
const html = document.documentElement;
const THEME_STORAGE_KEY = "lb-theme";

function updateLogoForTheme() {
  if (logoImg) {
    logoImg.src = "img/white-removebg-preview.png";
  }
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

  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (_) {}
}

(function initTheme() {
  let savedTheme = null;

  try {
    savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  } catch (_) {}

  const defaultTheme = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  applyTheme(savedTheme || defaultTheme);

  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const isLight = html.getAttribute("data-theme") === "light";
      applyTheme(isLight ? "dark" : "light");
    });
  }
})();