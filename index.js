const API_URL = "https://SEU-N8N/webhook/consultar-onibus";
const TELEGRAM_URL = "https://t.me/SEU_BOT";

// --- DOM Elements ---
const btnSearch = document.getElementById("btn-search");
const btnText = document.getElementById("btn-text");
const btnSpinner = document.getElementById("btn-spinner");
const btnIcon = document.getElementById("btn-icon"); // Referência direta ao SVG do botão
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");
const busListEl = document.getElementById("bus-list");

// --- SVG Templates ---
// Substituindo o emoji de ônibus pelo SVG moderno do novo código
const busIconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/></svg>';

// --- Helpers ---

function formatDistance(meters) {
  if (meters >= 1000) {
    return (meters / 1000).toFixed(1) + " km";
  }
  return Math.round(meters) + "m";
}

function setLoading(loading) {
  btnSearch.disabled = loading;
  btnText.textContent = loading ? "Buscando..." : "Ver ônibus próximos";
  btnSpinner.classList.toggle("hidden", !loading);

  // Atualizado: usando a referência específica do ID para esconder o ícone de localização
  if (btnIcon) {
    btnIcon.classList.toggle("hidden", loading);
  }
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

// --- Core Functions ---

function getLocation() {
  return new Promise(function (resolve, reject) {
    if (!navigator.geolocation) {
      reject(new Error("Geolocalização não suportada pelo seu navegador."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, function (err) {
      switch (err.code) {
        case err.PERMISSION_DENIED:
          reject(new Error("Permissão de localização negada. Abra as configurações do navegador ou dispositivo e permita o acesso à localização."));
          break;
        case err.POSITION_UNAVAILABLE:
          reject(new Error("Localização indisponível. Verifique se o GPS está ligado e tente novamente."));
          break;
        case err.TIMEOUT:
          reject(new Error("Tempo esgotado ao buscar localização. Tente novamente em um local com sinal melhor."));
          break;
        default:
          reject(new Error("Não foi possível obter sua localização. Verifique as configurações de localização e tente novamente."));
      }
    }, { enableHighAccuracy: true, timeout: 10000 });
  });
}

async function fetchBuses(lat, lon) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat: lat, lon: lon }),
  });
  if (!response.ok) throw new Error("Erro na comunicação com o servidor.");
  return response.json();
}

function renderBuses(buses) {
  busListEl.innerHTML = "";
  buses.forEach(function (bus, i) {
    const meters = bus.distanceKm * 1000;
    const card = document.createElement("div");
    card.className = "bus-card";
    card.style.animationDelay = (i * 0.1) + "s";

    // Atualizado: usando o busIconSvg em vez de emoji
    card.innerHTML =
      '<div class="bus-card-icon">' + busIconSvg + '</div>' +
      '<div class="bus-card-info">' +
      '<p class="bus-card-route">Linha ' + bus.routeId + '</p>' +
      '<p class="bus-card-distance-label">' + formatDistance(meters) + ' de distância</p>' +
      '</div>' +
      '<div class="bus-card-distance">' + formatDistance(meters) + '</div>';
    busListEl.appendChild(card);
  });
  resultsEl.classList.remove("hidden");
}

// --- Main Handler ---

async function handleSearch() {
  hideResults();
  hideStatus();
  setLoading(true);

  try {
    // Mensagens de status mais limpas conforme o código novo
    showStatus("loading", "Pegando sua localização...");
    const position = await getLocation();
    const lat = position.coords.latitude;
    const lon = position.coords.longitude;

    showStatus("loading", "Consultando ônibus...");
    const data = await fetchBuses(lat, lon);

    hideStatus();

    if (data.success && data.buses && data.buses.length > 0) {
      const sorted = data.buses
        .slice()
        .sort(function (a, b) { return a.distanceKm - b.distanceKm; })
        .slice(0, 5);
      renderBuses(sorted);
    } else {
      showStatus("empty", "Não encontramos ônibus próximos no momento.");
    }
  } catch (err) {
    showStatus("error", err.message || "Erro ao buscar dados.");
  } finally {
    setLoading(false);
  }
}