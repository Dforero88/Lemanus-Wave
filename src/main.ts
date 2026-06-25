import maplibregl from "maplibre-gl";
import type { GeoJSONSourceSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./styles.css";
import { createGpsProvider, type GpsReading } from "./gps/provider";
import {
  describeWeatherCode,
  fetchWeatherForPosition,
  formatWindDirection,
  getWeatherIconPath,
  type WeatherForecast,
  type WeatherPeriod,
  type WeatherSnapshot
} from "./weather/openMeteo";

const LEMAN_CENTER: [number, number] = [6.55, 46.43];
const INITIAL_ZOOM = 10.1;
const SPEED_MIN_ACCURACY_METERS = 120;

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app root element");
}

app.innerHTML = `
  <div id="map" aria-label="Carte du Leman"></div>
  <div class="panel-stack">
    <section id="weatherCard" class="weather-card" aria-live="polite">
      <header class="panel-header">
        <span class="panel-title">Meteo</span>
        <div class="panel-actions">
          <button id="weatherRefresh" class="panel-toggle" type="button" aria-label="Actualiser la meteo" disabled>↻</button>
          <button id="weatherToggle" class="panel-toggle" type="button" aria-label="Masquer la meteo">−</button>
        </div>
      </header>
      <div class="weather-body">
        <div class="weather-tabs" role="group" aria-label="Periode meteo">
          <button id="weatherNowTab" class="weather-tab is-active" type="button">Maintenant</button>
          <button id="weatherPlus1hTab" class="weather-tab" type="button">+1h</button>
        </div>
        <div id="weatherStatus" class="weather-status">GPS requis</div>
        <div id="weatherMetrics" class="weather-metrics" hidden>
          <div class="weather-primary">
            <span class="weather-icon-frame" aria-hidden="true">
              <img id="weatherIcon" class="weather-icon" src="/weather-icons/not-available.svg" alt="" />
            </span>
            <div class="weather-main">
              <strong id="weatherTemp">--</strong>
              <span id="weatherCondition">--</span>
            </div>
          </div>
          <div class="metric-group">
            <span class="metric-label">Vent</span>
            <div class="wind-row">
              <strong id="weatherWind">--</strong>
              <span id="weatherWindArrow" class="wind-arrow" aria-hidden="true">↑</span>
            </div>
            <span id="weatherWindDirection">--</span>
          </div>
          <div class="metric-group">
            <span class="metric-label">Pluie</span>
            <strong id="weatherRain">--</strong>
          </div>
          <span id="weatherUpdatedAt" class="weather-updated">--</span>
        </div>
      </div>
    </section>
    <section id="speedCard" class="speed-card" aria-live="polite">
      <header class="panel-header">
        <span class="panel-title">Vitesse</span>
        <button id="speedToggle" class="panel-toggle" type="button" aria-label="Masquer la vitesse">−</button>
      </header>
      <div class="speed-body">
        <strong id="speedValue">--</strong>
        <span class="speed-unit">km/h</span>
      </div>
    </section>
  </div>
  <button id="locateButton" class="locate-button" type="button">Activer GPS</button>
  <div class="gps-controls" aria-label="Controle GPS carte">
    <button id="centerGpsButton" class="gps-map-button" type="button" aria-label="Centrer sur la position GPS">⌖</button>
    <button id="followGpsButton" class="gps-map-button" type="button" aria-label="Activer le suivi GPS" aria-pressed="false">◎</button>
  </div>
  <div class="map-legend">Limite indicative 300 m</div>
  <div id="statusMessage" class="status-message" hidden></div>
`;

const speedValue = document.querySelector<HTMLElement>("#speedValue");
const speedCard = document.querySelector<HTMLElement>("#speedCard");
const speedToggle = document.querySelector<HTMLButtonElement>("#speedToggle");
const weatherCard = document.querySelector<HTMLElement>("#weatherCard");
const weatherRefresh = document.querySelector<HTMLButtonElement>("#weatherRefresh");
const weatherToggle = document.querySelector<HTMLButtonElement>("#weatherToggle");
const weatherNowTab = document.querySelector<HTMLButtonElement>("#weatherNowTab");
const weatherPlus1hTab = document.querySelector<HTMLButtonElement>("#weatherPlus1hTab");
const weatherStatus = document.querySelector<HTMLElement>("#weatherStatus");
const weatherMetrics = document.querySelector<HTMLElement>("#weatherMetrics");
const weatherIcon = document.querySelector<HTMLImageElement>("#weatherIcon");
const weatherTemp = document.querySelector<HTMLElement>("#weatherTemp");
const weatherCondition = document.querySelector<HTMLElement>("#weatherCondition");
const weatherWind = document.querySelector<HTMLElement>("#weatherWind");
const weatherWindArrow = document.querySelector<HTMLElement>("#weatherWindArrow");
const weatherWindDirection = document.querySelector<HTMLElement>("#weatherWindDirection");
const weatherRain = document.querySelector<HTMLElement>("#weatherRain");
const weatherUpdatedAt = document.querySelector<HTMLElement>("#weatherUpdatedAt");
const locateButton = document.querySelector<HTMLButtonElement>("#locateButton");
const centerGpsButton = document.querySelector<HTMLButtonElement>("#centerGpsButton");
const followGpsButton = document.querySelector<HTMLButtonElement>("#followGpsButton");
const statusMessage = document.querySelector<HTMLDivElement>("#statusMessage");

if (
  !speedValue ||
  !speedCard ||
  !speedToggle ||
  !weatherCard ||
  !weatherRefresh ||
  !weatherToggle ||
  !weatherNowTab ||
  !weatherPlus1hTab ||
  !weatherStatus ||
  !weatherMetrics ||
  !weatherIcon ||
  !weatherTemp ||
  !weatherCondition ||
  !weatherWind ||
  !weatherWindArrow ||
  !weatherWindDirection ||
  !weatherRain ||
  !weatherUpdatedAt ||
  !locateButton ||
  !centerGpsButton ||
  !followGpsButton ||
  !statusMessage
) {
  throw new Error("Missing required UI elements");
}

const speedEl = speedValue;
const speedCardEl = speedCard;
const speedToggleEl = speedToggle;
const weatherCardEl = weatherCard;
const weatherRefreshEl = weatherRefresh;
const weatherToggleEl = weatherToggle;
const weatherNowTabEl = weatherNowTab;
const weatherPlus1hTabEl = weatherPlus1hTab;
const weatherStatusEl = weatherStatus;
const weatherMetricsEl = weatherMetrics;
const weatherIconEl = weatherIcon;
const weatherTempEl = weatherTemp;
const weatherConditionEl = weatherCondition;
const weatherWindEl = weatherWind;
const weatherWindArrowEl = weatherWindArrow;
const weatherWindDirectionEl = weatherWindDirection;
const weatherRainEl = weatherRain;
const weatherUpdatedAtEl = weatherUpdatedAt;
const locateEl = locateButton;
const centerGpsEl = centerGpsButton;
const followGpsEl = followGpsButton;
const statusEl = statusMessage;

const map = new maplibregl.Map({
  container: "map",
  style: "https://tiles.openfreemap.org/styles/liberty",
  center: LEMAN_CENTER,
  zoom: INITIAL_ZOOM,
  attributionControl: false
});

map.addControl(
  new maplibregl.AttributionControl({
    compact: true,
    customAttribution: 'Data from <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }),
  "bottom-right"
);

map.addControl(
  new maplibregl.NavigationControl({
    showCompass: false,
    visualizePitch: false
  }),
  "bottom-right"
);

let currentMarker: maplibregl.Marker | null = null;
let hasCenteredOnUser = false;
let lastReading: GpsReading | null = null;
let lastSmoothedSpeedKmh: number | null = null;
let stopGps: (() => void) | null = null;
let weatherForecast: WeatherForecast | null = null;
let selectedWeatherPeriod: WeatherPeriod = "now";
let hasLoadedInitialWeather = false;
let isWeatherLoading = false;
let isSpeedPanelOpen = true;
let isGpsActive = false;
let isFollowGpsEnabled = false;
let isProgrammaticMapMove = false;

const gpsProvider = createGpsProvider();

map.on("load", () => {
  map.addSource("leman-300m-indicative", {
    type: "geojson",
    data: "/data/leman-300m-indicative.geojson"
  } satisfies GeoJSONSourceSpecification);

  map.addLayer({
    id: "leman-300m-indicative-line",
    type: "line",
    source: "leman-300m-indicative",
    paint: {
      "line-color": "#f59e0b",
      "line-width": ["interpolate", ["linear"], ["zoom"], 8, 1.2, 12, 2.8, 15, 4],
      "line-opacity": 0.88,
      "line-dasharray": [2, 1.2]
    }
  });
});

locateEl.addEventListener("click", () => {
  startGps();
});

centerGpsEl.addEventListener("click", () => {
  if (!isGpsActive) {
    startGps();
    return;
  }

  if (lastReading) {
    centerOnGps(lastReading);
  } else {
    setStatus("Position GPS en attente...");
  }
});

followGpsEl.addEventListener("click", () => {
  if (!isGpsActive) {
    setFollowGps(true);
    startGps();
    return;
  }

  setFollowGps(!isFollowGpsEnabled);

  if (isFollowGpsEnabled && lastReading) {
    centerOnGps(lastReading);
  }
});

map.on("dragstart", disableFollowOnUserMove);
map.on("zoomstart", disableFollowOnUserMove);
map.on("rotatestart", disableFollowOnUserMove);

function startGps() {
  if (isGpsActive) {
    return;
  }

  isGpsActive = true;
  locateEl.disabled = true;
  locateEl.textContent = "GPS actif";
  setStatus("Recherche de la position...");

  stopGps = gpsProvider.watch(
    (reading) => {
      renderReading(reading);
      lastReading = reading;
      weatherRefreshEl.disabled = false;
      if (!hasLoadedInitialWeather) {
        void updateWeather(reading);
      }
      setStatus(null);
    },
    (message) => {
      locateEl.disabled = false;
      locateEl.textContent = "Activer GPS";
      isGpsActive = false;
      weatherRefreshEl.disabled = true;
      setFollowGps(false);
      setStatus(message);
    }
  );
}

speedToggleEl.addEventListener("click", () => {
  isSpeedPanelOpen = togglePanel(speedCardEl, speedToggleEl, "vitesse");

  if (!isSpeedPanelOpen) {
    lastSmoothedSpeedKmh = null;
    speedEl.textContent = "--";
  } else if (lastReading) {
    renderSpeed(lastReading);
  }
});

weatherToggleEl.addEventListener("click", () => {
  togglePanel(weatherCardEl, weatherToggleEl, "meteo");
});

weatherRefreshEl.addEventListener("click", () => {
  if (!lastReading) {
    setWeatherStatus("GPS requis");
    return;
  }

  void updateWeather(lastReading);
});

weatherNowTabEl.addEventListener("click", () => {
  selectedWeatherPeriod = "now";
  renderWeather();
});

weatherPlus1hTabEl.addEventListener("click", () => {
  selectedWeatherPeriod = "plus1h";
  renderWeather();
});

window.addEventListener("beforeunload", () => {
  stopGps?.();
});

function renderReading(reading: GpsReading) {
  const lngLat: [number, number] = [reading.longitude, reading.latitude];

  if (!currentMarker) {
    const markerElement = document.createElement("div");
    markerElement.className = "position-marker";
    currentMarker = new maplibregl.Marker({ element: markerElement, anchor: "center" })
      .setLngLat(lngLat)
      .addTo(map);
  } else {
    currentMarker.setLngLat(lngLat);
  }

  if (!hasCenteredOnUser) {
    moveMapToGps(reading, { zoom: Math.max(map.getZoom(), 12), duration: 800 });
    hasCenteredOnUser = true;
  } else if (isFollowGpsEnabled) {
    moveMapToGps(reading, { duration: 500 });
  }

  if (isSpeedPanelOpen) {
    renderSpeed(reading);
  }
}

function centerOnGps(reading: GpsReading) {
  moveMapToGps(reading, {
    zoom: Math.max(map.getZoom(), 12),
    duration: 650
  });
}

function moveMapToGps(reading: GpsReading, options: { zoom?: number; duration: number }) {
  isProgrammaticMapMove = true;
  map.easeTo({
    center: [reading.longitude, reading.latitude],
    zoom: options.zoom,
    duration: options.duration
  });
  window.setTimeout(() => {
    isProgrammaticMapMove = false;
  }, options.duration + 80);
}

function setFollowGps(enabled: boolean) {
  isFollowGpsEnabled = enabled;
  followGpsEl.classList.toggle("is-active", enabled);
  followGpsEl.setAttribute("aria-pressed", enabled ? "true" : "false");
  followGpsEl.setAttribute("aria-label", enabled ? "Desactiver le suivi GPS" : "Activer le suivi GPS");
}

function disableFollowOnUserMove() {
  if (!isProgrammaticMapMove && isFollowGpsEnabled) {
    setFollowGps(false);
  }
}

function renderSpeed(reading: GpsReading) {
  const speedKmh = getDisplaySpeedKmh(reading);
  speedEl.textContent = speedKmh === null ? "--" : Math.round(speedKmh).toString();
}

async function updateWeather(reading: GpsReading) {
  if (isWeatherLoading) {
    return;
  }

  isWeatherLoading = true;
  weatherRefreshEl.disabled = true;
  setWeatherStatus("Meteo en cours...");

  try {
    weatherForecast = await fetchWeatherForPosition(reading);
    hasLoadedInitialWeather = true;
    renderWeather();
  } catch {
    weatherForecast = null;
    setWeatherStatus("Meteo indisponible");
  } finally {
    isWeatherLoading = false;
    weatherRefreshEl.disabled = false;
  }
}

function renderWeather() {
  if (!weatherForecast) {
    setWeatherStatus("GPS requis");
    return;
  }

  const snapshot = getSelectedWeatherSnapshot();

  if (!snapshot) {
    setWeatherStatus("+1h indisponible");
    return;
  }

  weatherNowTabEl.classList.toggle("is-active", selectedWeatherPeriod === "now");
  weatherPlus1hTabEl.classList.toggle("is-active", selectedWeatherPeriod === "plus1h");
  weatherStatusEl.hidden = true;
  weatherMetricsEl.hidden = false;

  weatherTempEl.textContent =
    snapshot.temperatureC === null ? "--" : `${Math.round(snapshot.temperatureC)}°`;
  weatherIconEl.src = getWeatherIconPath(snapshot.weatherCode);
  weatherConditionEl.textContent = describeWeatherCode(snapshot.weatherCode);
  weatherWindEl.textContent =
    snapshot.windSpeedKmh === null ? "--" : `${Math.round(snapshot.windSpeedKmh)} km/h`;
  weatherWindDirectionEl.textContent = formatWindDirection(snapshot.windDirectionDeg);
  weatherWindArrowEl.style.transform =
    snapshot.windDirectionDeg === null ? "rotate(0deg)" : `rotate(${snapshot.windDirectionDeg}deg)`;
  weatherRainEl.textContent =
    snapshot.precipitationMm === null ? "--" : `${formatDecimal(snapshot.precipitationMm)} mm`;
  weatherUpdatedAtEl.textContent = `Maj ${formatTime(weatherForecast.updatedAt)} · ${snapshot.label}`;
}

function getSelectedWeatherSnapshot(): WeatherSnapshot | null {
  if (!weatherForecast) {
    return null;
  }

  return selectedWeatherPeriod === "now" ? weatherForecast.now : weatherForecast.plus1h;
}

function setWeatherStatus(message: string) {
  weatherMetricsEl.hidden = true;
  weatherStatusEl.hidden = false;
  weatherStatusEl.textContent = message;
}

function getDisplaySpeedKmh(reading: GpsReading): number | null {
  const nativeSpeed = reading.speedMetersPerSecond;

  if (typeof nativeSpeed === "number" && Number.isFinite(nativeSpeed) && nativeSpeed >= 0) {
    return smoothSpeed(nativeSpeed * 3.6);
  }

  const previous = lastReading;

  if (!previous || previous.timestamp === reading.timestamp) {
    return null;
  }

  if (reading.accuracy > SPEED_MIN_ACCURACY_METERS || previous.accuracy > SPEED_MIN_ACCURACY_METERS) {
    return lastSmoothedSpeedKmh;
  }

  const elapsedSeconds = (reading.timestamp - previous.timestamp) / 1000;

  if (elapsedSeconds <= 0) {
    return lastSmoothedSpeedKmh;
  }

  const distanceMeters = haversineDistanceMeters(previous, reading);
  const computedKmh = (distanceMeters / elapsedSeconds) * 3.6;

  if (!Number.isFinite(computedKmh) || computedKmh < 0) {
    return lastSmoothedSpeedKmh;
  }

  return smoothSpeed(computedKmh);
}

function smoothSpeed(nextKmh: number): number {
  if (lastSmoothedSpeedKmh === null) {
    lastSmoothedSpeedKmh = nextKmh;
    return nextKmh;
  }

  lastSmoothedSpeedKmh = lastSmoothedSpeedKmh * 0.65 + nextKmh * 0.35;
  return lastSmoothedSpeedKmh;
}

function haversineDistanceMeters(from: GpsReading, to: GpsReading): number {
  const earthRadiusMeters = 6371000;
  const lat1 = degreesToRadians(from.latitude);
  const lat2 = degreesToRadians(to.latitude);
  const deltaLat = degreesToRadians(to.latitude - from.latitude);
  const deltaLon = degreesToRadians(to.longitude - from.longitude);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function setStatus(message: string | null) {
  if (!message) {
    statusEl.hidden = true;
    statusEl.textContent = "";
    return;
  }

  statusEl.hidden = false;
  statusEl.textContent = message;
}

function togglePanel(card: HTMLElement, toggle: HTMLButtonElement, label: string): boolean {
  const isCollapsed = card.classList.toggle("is-collapsed");
  toggle.textContent = isCollapsed ? "+" : "−";
  toggle.setAttribute("aria-label", isCollapsed ? `Afficher ${label}` : `Masquer ${label}`);
  return !isCollapsed;
}

function formatDecimal(value: number): string {
  return value < 10 ? value.toFixed(1) : Math.round(value).toString();
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("fr-CH", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
