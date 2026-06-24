import maplibregl from "maplibre-gl";
import type { GeoJSONSourceSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./styles.css";
import { createGpsProvider, type GpsReading } from "./gps/provider";
import {
  describeWeatherCode,
  fetchWeatherForPosition,
  formatWindDirection,
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
        <button id="weatherToggle" class="panel-toggle" type="button" aria-label="Masquer la meteo">−</button>
      </header>
      <div class="weather-body">
        <div class="weather-tabs" role="group" aria-label="Periode meteo">
          <button id="weatherNowTab" class="weather-tab is-active" type="button">Maintenant</button>
          <button id="weatherPlus1hTab" class="weather-tab" type="button">+1h</button>
        </div>
        <div id="weatherStatus" class="weather-status">GPS requis</div>
        <div id="weatherMetrics" class="weather-metrics" hidden>
          <div class="weather-primary">
            <strong id="weatherTemp">--</strong>
            <span id="weatherCondition">--</span>
          </div>
          <div class="metric-group">
            <span class="metric-label">Vent</span>
            <strong id="weatherWind">--</strong>
            <span id="weatherWindDirection">--</span>
          </div>
          <div class="metric-group">
            <span class="metric-label">Rafales</span>
            <strong id="weatherGusts">--</strong>
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
  <div class="map-legend">Limite indicative 300 m</div>
  <div id="statusMessage" class="status-message" hidden></div>
`;

const speedValue = document.querySelector<HTMLElement>("#speedValue");
const speedCard = document.querySelector<HTMLElement>("#speedCard");
const speedToggle = document.querySelector<HTMLButtonElement>("#speedToggle");
const weatherCard = document.querySelector<HTMLElement>("#weatherCard");
const weatherToggle = document.querySelector<HTMLButtonElement>("#weatherToggle");
const weatherNowTab = document.querySelector<HTMLButtonElement>("#weatherNowTab");
const weatherPlus1hTab = document.querySelector<HTMLButtonElement>("#weatherPlus1hTab");
const weatherStatus = document.querySelector<HTMLElement>("#weatherStatus");
const weatherMetrics = document.querySelector<HTMLElement>("#weatherMetrics");
const weatherTemp = document.querySelector<HTMLElement>("#weatherTemp");
const weatherCondition = document.querySelector<HTMLElement>("#weatherCondition");
const weatherWind = document.querySelector<HTMLElement>("#weatherWind");
const weatherWindDirection = document.querySelector<HTMLElement>("#weatherWindDirection");
const weatherGusts = document.querySelector<HTMLElement>("#weatherGusts");
const weatherRain = document.querySelector<HTMLElement>("#weatherRain");
const weatherUpdatedAt = document.querySelector<HTMLElement>("#weatherUpdatedAt");
const locateButton = document.querySelector<HTMLButtonElement>("#locateButton");
const statusMessage = document.querySelector<HTMLDivElement>("#statusMessage");

if (
  !speedValue ||
  !speedCard ||
  !speedToggle ||
  !weatherCard ||
  !weatherToggle ||
  !weatherNowTab ||
  !weatherPlus1hTab ||
  !weatherStatus ||
  !weatherMetrics ||
  !weatherTemp ||
  !weatherCondition ||
  !weatherWind ||
  !weatherWindDirection ||
  !weatherGusts ||
  !weatherRain ||
  !weatherUpdatedAt ||
  !locateButton ||
  !statusMessage
) {
  throw new Error("Missing required UI elements");
}

const speedEl = speedValue;
const speedCardEl = speedCard;
const speedToggleEl = speedToggle;
const weatherCardEl = weatherCard;
const weatherToggleEl = weatherToggle;
const weatherNowTabEl = weatherNowTab;
const weatherPlus1hTabEl = weatherPlus1hTab;
const weatherStatusEl = weatherStatus;
const weatherMetricsEl = weatherMetrics;
const weatherTempEl = weatherTemp;
const weatherConditionEl = weatherCondition;
const weatherWindEl = weatherWind;
const weatherWindDirectionEl = weatherWindDirection;
const weatherGustsEl = weatherGusts;
const weatherRainEl = weatherRain;
const weatherUpdatedAtEl = weatherUpdatedAt;
const locateEl = locateButton;
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
let lastWeatherFetchKey: string | null = null;
let isSpeedPanelOpen = true;

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
  locateEl.disabled = true;
  locateEl.textContent = "GPS actif";
  setStatus("Recherche de la position...");

  stopGps = gpsProvider.watch(
    (reading) => {
      renderReading(reading);
      lastReading = reading;
      void updateWeather(reading);
      setStatus(null);
    },
    (message) => {
      locateEl.disabled = false;
      locateEl.textContent = "Activer GPS";
      setStatus(message);
    }
  );
});

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
    map.easeTo({ center: lngLat, zoom: Math.max(map.getZoom(), 12), duration: 800 });
    hasCenteredOnUser = true;
  }

  if (isSpeedPanelOpen) {
    renderSpeed(reading);
  }
}

function renderSpeed(reading: GpsReading) {
  const speedKmh = getDisplaySpeedKmh(reading);
  speedEl.textContent = speedKmh === null ? "--" : Math.round(speedKmh).toString();
}

async function updateWeather(reading: GpsReading) {
  const fetchKey = `${reading.latitude.toFixed(3)},${reading.longitude.toFixed(3)}`;

  if (lastWeatherFetchKey === fetchKey && weatherForecast) {
    return;
  }

  lastWeatherFetchKey = fetchKey;
  setWeatherStatus("Meteo en cours...");

  try {
    weatherForecast = await fetchWeatherForPosition(reading);
    renderWeather();
  } catch {
    weatherForecast = null;
    setWeatherStatus("Meteo indisponible");
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
  weatherConditionEl.textContent = describeWeatherCode(snapshot.weatherCode);
  weatherWindEl.textContent =
    snapshot.windSpeedKmh === null ? "--" : `${Math.round(snapshot.windSpeedKmh)} km/h`;
  weatherWindDirectionEl.textContent = formatWindDirection(snapshot.windDirectionDeg);
  weatherGustsEl.textContent =
    snapshot.windGustKmh === null ? "--" : `${Math.round(snapshot.windGustKmh)} km/h`;
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
