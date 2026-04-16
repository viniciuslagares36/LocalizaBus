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
  showStatus("loading", "Pegando sua localização...");

  if (!navigator.geolocation) {
    showStatus("error", "Geolocalização não suportada pelo seu navegador.");
    setLoading(false);
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async function(position) {
      try {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;

        showStatus("loading", "Consultando ônibus...");
        const data = await fetchBuses(lat, lon);
        hideStatus();

        if (data.success && data.buses && data.buses.length > 0) {
          const sorted = data.buses
            .slice()
            .sort(function(a, b) { return a.distanceKm - b.distanceKm; })
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
    },
    function(err) {
      switch (err.code) {
        case 1: showStatus("error", "Permissão de localização negada."); break;
        case 2: showStatus("error", "Localização indisponível."); break;
        case 3: showStatus("error", "Tempo esgotado ao buscar localização."); break;
        default: showStatus("error", "Não foi possível obter sua localização.");
      }
      setLoading(false);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

if (btnSearch) {
  btnSearch.addEventListener("click", handleSearch);
}

// --- Theme Toggle & Logo Update ---
const themeToggle = document.getElementById("theme-toggle");
const themeLabel = document.getElementById("theme-label");
const logoImg = document.getElementById("logo-img");
const html = document.documentElement;
const THEME_STORAGE_KEY = "lb-theme";

function updateLogoForTheme(theme) {
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
  updateLogoForTheme(theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (_) { }
}

(function initTheme() {
  let savedTheme = null;
  try {
    savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  } catch (_) { }

  const defaultTheme = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  const themeToApply = savedTheme || defaultTheme;
  applyTheme(themeToApply);

  if (themeToggle) {
    themeToggle.addEventListener("click", function () {
      const isLight = html.getAttribute("data-theme") === "light";
      applyTheme(isLight ? "dark" : "light");
    });
  }
})();