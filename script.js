const API_URL = "https://viniciuslagares36.app.n8n.cloud/webhook/consultar-onibus";
const TELEGRAM_URL = "https://t.me/localizabus_bot?start=1";

// --- DOM Elements ---
const btnSearch = document.getElementById("btn-search");
const btnText = document.getElementById("btn-text");
const btnSpinner = document.getElementById("btn-spinner");
const btnIcon = document.getElementById("btn-icon");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");
const busListEl = document.getElementById("bus-list");

// --- SVG Templates ---
const busIconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="13" rx="2"/><rect x="5" y="8" width="4" height="3" rx="0.5"/><rect x="10" y="8" width="4" height="3" rx="0.5"/><rect x="15" y="8" width="3" height="3" rx="0.5"/><line x1="3" y1="13" x2="21" y2="13"/><line x1="12" y1="13" x2="12" y2="18"/><path d="M3 18v1a1 1 0 0 0 1 1h1M19 18v1a1 1 0 0 1-1 1h-1"/><circle cx="7" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/></svg>';

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

function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocalização não suportada pelo seu navegador."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!position || !position.coords) {
          reject(new Error("Erro ao obter coordenadas."));
          return;
        }

        resolve({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        });
      },
      (err) => {
        switch (err.code) {
          case err.PERMISSION_DENIED:
            reject(new Error("Permissão de localização negada."));
            break;
          case err.POSITION_UNAVAILABLE:
            reject(new Error("Localização indisponível."));
            break;
          case err.TIMEOUT:
            reject(new Error("Tempo esgotado ao buscar localização."));
            break;
          default:
            reject(new Error("Não foi possível obter sua localização."));
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  });
}

async function fetchBuses(lat, lon) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ lat, lon }),
  });

  if (!response.ok) {
    throw new Error("Erro na comunicação com o servidor.");
  }

  return await response.json();
}

function renderBuses(buses) {
  busListEl.innerHTML = "";
  buses.forEach(function (bus, i) {
    const meters = bus.distanceKm * 1000;
    const card = document.createElement("div");
    card.className = "bus-card";
    card.style.animationDelay = (i * 0.1) + "s";

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

async function handleSearch() {
  hideResults();
  hideStatus();
  setLoading(true);

  try {
    showStatus("loading", "Pegando sua localização...");
    const location = await getLocation();

    showStatus("loading", "Consultando ônibus...");
    const data = await fetchBuses(location.lat, location.lon);

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
    console.error(err);
    showStatus("error", err.message || "Erro ao buscar dados.");
  } finally {
    setLoading(false);
  }
}

if (btnSearch) {
  btnSearch.addEventListener("click", handleSearch);
}

// --- Theme Toggle & Logo Update ---
const themeToggle = document.getElementById("theme-toggle");
const logoImg = document.getElementById("logo-img");
const themeLabel = document.getElementById("theme-label");
const html = document.documentElement;

function updateLogoForTheme() {
  const isDarkMode = html.getAttribute("data-theme") === "dark" ||
    !html.hasAttribute("data-theme");

  if (logoImg) {
    logoImg.src = isDarkMode
      ? "img/white-removebg-preview.png"
      : "img/dark-removebg-preview.png";
  }
}

if (themeToggle) {
  themeToggle.addEventListener("click", function () {
    const isDark = html.getAttribute("data-theme") === "dark";
    html.setAttribute("data-theme", isDark ? "light" : "dark");
    themeLabel.textContent = isDark ? "Modo claro" : "Modo escuro";
    updateLogoForTheme();
    localStorage.setItem("theme", isDark ? "light" : "dark");
  });
}

// Inicializar tema ao carregar
const savedTheme = localStorage.getItem("theme") || "dark";
html.setAttribute("data-theme", savedTheme);
themeLabel.textContent = savedTheme === "dark" ? "Modo escuro" : "Modo claro";
updateLogoForTheme();