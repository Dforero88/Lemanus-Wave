import maplibregl from "maplibre-gl";
import type { GeoJSONSourceSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./styles.css";
import { createGpsProvider, type GpsReading } from "./gps/provider";

const LEMAN_CENTER: [number, number] = [6.55, 46.43];
const INITIAL_ZOOM = 10.1;
const SPEED_MIN_ACCURACY_METERS = 120;

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app root element");
}

app.innerHTML = `
  <div id="map" aria-label="Carte du Leman"></div>
  <section class="speed-card" aria-live="polite">
    <span class="speed-label">Vitesse</span>
    <strong id="speedValue">--</strong>
    <span class="speed-unit">km/h</span>
  </section>
  <button id="locateButton" class="locate-button" type="button">Activer GPS</button>
  <div class="map-legend">Limite indicative 300 m</div>
  <div id="statusMessage" class="status-message" hidden></div>
`;

const speedValue = document.querySelector<HTMLElement>("#speedValue");
const locateButton = document.querySelector<HTMLButtonElement>("#locateButton");
const statusMessage = document.querySelector<HTMLDivElement>("#statusMessage");

if (!speedValue || !locateButton || !statusMessage) {
  throw new Error("Missing required UI elements");
}

const speedEl = speedValue;
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
      setStatus(null);
    },
    (message) => {
      locateEl.disabled = false;
      locateEl.textContent = "Activer GPS";
      setStatus(message);
    }
  );
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

  const speedKmh = getDisplaySpeedKmh(reading);
  speedEl.textContent = speedKmh === null ? "--" : Math.round(speedKmh).toString();
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
