import maplibregl from "maplibre-gl";
import type { GeoJSONSourceSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./styles.css";
import { createGpsProvider, type GpsReading } from "./gps/provider";
import { createOrientationProvider, type OrientationReading } from "./orientation/provider";
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
const POSITION_MAX_ACCURACY_METERS = 200;
const SPEED_MIN_ACCURACY_METERS = 120;
const SPEED_MIN_ELAPSED_SECONDS = 1.5;
const SPEED_MIN_DISTANCE_METERS = 1.5;
const SPEED_STATIONARY_ACCURACY_RATIO = 0.2;
const SPEED_ZERO_THRESHOLD_KMH = 0.8;
const SPEED_NEAR_ZERO_KMH = 2;
const SPEED_START_CONFIRM_KMH = 8;
const SPEED_START_CONFIRM_TOLERANCE_KMH = 10;
const SPEED_MAX_PLAUSIBLE_KMH = 120;
const SPEED_JUMP_MARGIN_KMH = 35;
const SPEED_JUMP_FACTOR = 1.8;
const HEADING_MAP_MIN_ROTATION_DELTA_DEGREES = 2;
const HEADING_MAP_MIN_ROTATION_INTERVAL_MS = 250;
const HEADING_MARKER_MIN_RENDER_DELTA_DEGREES = 1;
const HEADING_MARKER_MIN_RENDER_INTERVAL_MS = 120;
const FOLLOW_CAMERA_DURATION_MS = 250;
const IS_MOCK_GPS_MODE = import.meta.env.DEV && new URLSearchParams(window.location.search).get("gps") === "mock";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app root element");
}

app.innerHTML = `
  <div id="map" aria-label="Carte du Leman"></div>
  <div class="panel-stack">
    <div class="map-legend">Limite indicative 300 m</div>
    <section id="speedCard" class="speed-card is-collapsed" aria-live="polite">
      <header class="panel-header">
        <span class="panel-title">Vitesse</span>
        <button id="speedToggle" class="panel-toggle" type="button" aria-label="Afficher la vitesse">+</button>
      </header>
      <div class="speed-body">
        <strong id="speedValue">--</strong>
        <span class="speed-unit">km/h</span>
      </div>
    </section>
  </div>
  <section id="weatherView" class="weather-view" aria-label="Meteo" hidden>
    <div class="weather-screen-shell">
      <section id="weatherCard" class="weather-card weather-screen-card" aria-live="polite">
        <header class="panel-header weather-screen-header">
          <div>
            <span class="panel-title">Meteo</span>
            <h1 class="weather-screen-title">Conditions</h1>
          </div>
          <button id="weatherRefresh" class="panel-toggle" type="button" aria-label="Actualiser la meteo" disabled>↻</button>
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
    </div>
  </section>
  <button id="gpsRetryButton" class="gps-retry-button" type="button" hidden>Réessayer GPS</button>
  <div class="gps-controls" aria-label="Controle GPS carte">
    <button id="centerGpsButton" class="gps-map-button" type="button" aria-label="Centrer sur la position GPS">⌖</button>
    <button id="followGpsButton" class="gps-map-button" type="button" aria-label="Activer le suivi GPS" aria-pressed="false">◎</button>
    <button id="headingButton" class="gps-map-button" type="button" aria-label="Activer l'orientation telephone" aria-pressed="false">▲</button>
  </div>
  <div id="statusMessage" class="status-message" hidden></div>
  <nav class="bottom-nav" aria-label="Navigation principale">
    <button id="mapTab" class="bottom-nav-button is-active" type="button" aria-label="Afficher la carte" aria-current="page">
      <svg class="bottom-nav-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3z"></path>
        <path d="M9 3v15"></path>
        <path d="M15 6v15"></path>
      </svg>
      <span>Carte</span>
    </button>
    <button id="weatherTab" class="bottom-nav-button" type="button" aria-label="Afficher la meteo">
      <svg class="bottom-nav-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M17.5 18H8a5 5 0 1 1 1.1-9.9A6 6 0 0 1 20 11.5 3.5 3.5 0 0 1 17.5 18z"></path>
        <path d="M8 21h.01"></path>
        <path d="M12 21h.01"></path>
        <path d="M16 21h.01"></path>
      </svg>
      <span>Meteo</span>
    </button>
  </nav>
`;

const speedValue = document.querySelector<HTMLElement>("#speedValue");
const speedCard = document.querySelector<HTMLElement>("#speedCard");
const speedToggle = document.querySelector<HTMLButtonElement>("#speedToggle");
const weatherView = document.querySelector<HTMLElement>("#weatherView");
const weatherCard = document.querySelector<HTMLElement>("#weatherCard");
const weatherRefresh = document.querySelector<HTMLButtonElement>("#weatherRefresh");
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
const gpsRetryButton = document.querySelector<HTMLButtonElement>("#gpsRetryButton");
const centerGpsButton = document.querySelector<HTMLButtonElement>("#centerGpsButton");
const followGpsButton = document.querySelector<HTMLButtonElement>("#followGpsButton");
const headingButton = document.querySelector<HTMLButtonElement>("#headingButton");
const statusMessage = document.querySelector<HTMLDivElement>("#statusMessage");
const mapTab = document.querySelector<HTMLButtonElement>("#mapTab");
const weatherTab = document.querySelector<HTMLButtonElement>("#weatherTab");

if (
  !speedValue ||
  !speedCard ||
  !speedToggle ||
  !weatherView ||
  !weatherCard ||
  !weatherRefresh ||
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
  !gpsRetryButton ||
  !centerGpsButton ||
  !followGpsButton ||
  !headingButton ||
  !statusMessage ||
  !mapTab ||
  !weatherTab
) {
  throw new Error("Missing required UI elements");
}

const speedEl = speedValue;
const speedCardEl = speedCard;
const speedToggleEl = speedToggle;
const weatherViewEl = weatherView;
const weatherRefreshEl = weatherRefresh;
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
const gpsRetryEl = gpsRetryButton;
const centerGpsEl = centerGpsButton;
const followGpsEl = followGpsButton;
const headingEl = headingButton;
const statusEl = statusMessage;
const mapTabEl = mapTab;
const weatherTabEl = weatherTab;

const map = new maplibregl.Map({
  container: "map",
  style: "https://tiles.openfreemap.org/styles/liberty",
  center: LEMAN_CENTER,
  zoom: INITIAL_ZOOM,
  attributionControl: false
});

map.addControl(
  new maplibregl.AttributionControl({
    compact: true
  }),
  "bottom-right"
);
collapseMapAttribution();

map.addControl(
  new maplibregl.NavigationControl({
    showCompass: false,
    visualizePitch: false
  }),
  "bottom-right"
);

const geolocateControl = IS_MOCK_GPS_MODE
  ? null
  : new maplibregl.GeolocateControl({
      positionOptions: {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 12000
      },
      fitBoundsOptions: {
        maxZoom: 15,
        duration: 0
      },
      trackUserLocation: true,
      showAccuracyCircle: false,
      showUserLocation: false
    });

if (geolocateControl) {
  map.addControl(geolocateControl, "bottom-right");
  geolocateControl.on("geolocate", (event) => {
    handleGpsReading(createReadingFromGeolocateEvent(event));
  });
  geolocateControl.on("error", (event) => {
    handleGpsError(getGpsErrorMessage(event));
  });
  geolocateControl.on("trackuserlocationstart", () => {
    isGpsActive = true;
    gpsRetryEl.hidden = true;
    setFollowGps(true);
    setStatus(null);
  });
  geolocateControl.on("userlocationfocus", () => {
    setFollowGps(true);
  });
  geolocateControl.on("trackuserlocationend", () => {
    setFollowGps(false);
  });
  geolocateControl.on("userlocationlostfocus", () => {
    setFollowGps(false);
  });
}

let currentMarker: maplibregl.Marker | null = null;
let currentMarkerElement: HTMLElement | null = null;
let hasCenteredOnUser = false;
let lastReading: GpsReading | null = null;
let lastUsableReading: GpsReading | null = null;
let lastSpeedReading: GpsReading | null = null;
let lastOrientation: OrientationReading | null = null;
let lastSmoothedSpeedKmh: number | null = null;
let pendingStartSpeedKmh: number | null = null;
let stopGps: (() => void) | null = null;
let stopOrientation: (() => void) | null = null;
let weatherForecast: WeatherForecast | null = null;
let selectedWeatherPeriod: WeatherPeriod = "now";
let hasLoadedInitialWeather = false;
let isWeatherLoading = false;
let isSpeedPanelOpen = false;
let isGpsActive = false;
let isFollowGpsEnabled = false;
let isHeadingMapEnabled = false;
let isUserInteractingWithMap = false;
let isUserZoomingMap = false;
let lastAppliedMapHeadingDegrees: number | null = null;
let lastHeadingMapRotationAt = 0;
let lastRenderedHeadingDegrees: number | null = null;
let lastHeadingMarkerRenderAt = 0;

const gpsProvider = IS_MOCK_GPS_MODE ? createGpsProvider() : null;
const orientationProvider = createOrientationProvider();

map.on("load", () => {
  collapseMapAttribution();

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

gpsRetryEl.addEventListener("click", () => {
  startGps();
});

centerGpsEl.addEventListener("click", () => {
  if (!isGpsActive) {
    startGps();
    return;
  }

  if (lastUsableReading) {
    centerOnGps(lastUsableReading);
  } else if (geolocateControl) {
    geolocateControl.trigger();
  } else {
    setStatus("Position GPS en attente...");
  }
});

followGpsEl.addEventListener("click", () => {
  if (geolocateControl) {
    if (!isGpsActive) {
      isGpsActive = true;
      gpsRetryEl.hidden = true;
      setStatus(null);
    }

    geolocateControl.trigger();
    return;
  }

  if (!isGpsActive) {
    setFollowGps(true);
    startGps();
    return;
  }

  setFollowGps(!isFollowGpsEnabled);

  if (isFollowGpsEnabled && lastUsableReading) {
    centerOnGps(lastUsableReading);
  }
});

headingEl.addEventListener("click", () => {
  if (!stopOrientation) {
    void startOrientation({ rotateMap: true });
    return;
  }

  setHeadingMapEnabled(!isHeadingMapEnabled);
});

map.on("dragstart", disableAutoMapModesOnUserMove);
map.on("dragend", resumeAutomaticMapHeading);
map.on("rotatestart", disableAutoMapModesOnUserMove);
map.on("rotateend", resumeAutomaticMapHeading);
map.on("zoomstart", (event) => {
  if (event.originalEvent) {
    isUserInteractingWithMap = true;
    isUserZoomingMap = true;
  }
});
map.on("zoomend", () => {
  isUserZoomingMap = false;
  isUserInteractingWithMap = false;
  if (IS_MOCK_GPS_MODE) {
    syncCamera(FOLLOW_CAMERA_DURATION_MS);
  } else if (isHeadingMapEnabled && lastOrientation) {
    applyMapHeading(lastOrientation.headingDegrees);
  }
});
map.on("rotate", () => {
  if (lastOrientation) {
    renderOrientation(lastOrientation);
  }
});

const mapCanvas = map.getCanvas();
mapCanvas.addEventListener("touchstart", pauseAutomaticMapHeading, { passive: true });
mapCanvas.addEventListener("touchend", resumeAutomaticMapHeading, { passive: true });
mapCanvas.addEventListener("touchcancel", resumeAutomaticMapHeading, { passive: true });

startGps();
if (IS_MOCK_GPS_MODE) {
  void startOrientation({ rotateMap: false });
}

function startGps() {
  if (isGpsActive) {
    return;
  }

  isGpsActive = true;
  gpsRetryEl.hidden = true;
  setStatus(null);

  if (geolocateControl) {
    if (!geolocateControl.trigger()) {
      handleGpsError("GPS indisponible.");
    }
    return;
  }

  if (!gpsProvider) {
    handleGpsError("GPS indisponible.");
    return;
  }

  stopGps = gpsProvider.watch(handleGpsReading, handleGpsError);
}

speedToggleEl.addEventListener("click", () => {
  isSpeedPanelOpen = togglePanel(speedCardEl, speedToggleEl, "vitesse");

  if (!isSpeedPanelOpen) {
    lastSmoothedSpeedKmh = null;
    pendingStartSpeedKmh = null;
    lastSpeedReading = null;
    speedEl.textContent = "--";
  } else if (lastReading) {
    renderSpeed(lastReading);
  }
});

mapTabEl.addEventListener("click", () => {
  setActiveView("map");
});

weatherTabEl.addEventListener("click", () => {
  setActiveView("weather");
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
  stopOrientation?.();
});

function renderReading(reading: GpsReading) {
  const lngLat: [number, number] = [reading.longitude, reading.latitude];
  const isPositionUsable = isUsablePositionReading(reading);

  if (!currentMarker) {
    const markerElement = document.createElement("div");
    markerElement.className = "position-marker";
    markerElement.innerHTML = '<span class="position-marker-heading"></span><span class="position-marker-dot"></span>';
    currentMarkerElement = markerElement;
    currentMarker = new maplibregl.Marker({ element: markerElement, anchor: "center" })
      .setLngLat(lngLat)
      .addTo(map);
  } else {
    currentMarker.setLngLat(lngLat);
  }

  if (isPositionUsable) {
    lastUsableReading = reading;
  }

  if (lastOrientation) {
    renderOrientation(lastOrientation);
  }

  if (!IS_MOCK_GPS_MODE) {
    if (!hasCenteredOnUser && isPositionUsable) {
      hasCenteredOnUser = true;
    }
  } else if (!hasCenteredOnUser && isPositionUsable) {
    moveMapToGps(reading, { zoom: Math.max(map.getZoom(), 12), duration: 800 });
    hasCenteredOnUser = true;
  } else if (isFollowGpsEnabled) {
    syncCamera(FOLLOW_CAMERA_DURATION_MS);
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
  if (isUserZoomingMap) {
    return;
  }

  const cameraOptions: maplibregl.EaseToOptions = {
    center: [reading.longitude, reading.latitude],
    duration: options.duration
  };

  if (options.zoom !== undefined) {
    cameraOptions.zoom = options.zoom;
  }

  if (isHeadingMapEnabled && lastOrientation) {
    cameraOptions.bearing = lastOrientation.headingDegrees;
  }

  map.easeTo(cameraOptions, { geolocateSource: true });
}

function setFollowGps(enabled: boolean) {
  isFollowGpsEnabled = enabled;
  followGpsEl.classList.toggle("is-active", enabled);
  followGpsEl.setAttribute("aria-pressed", enabled ? "true" : "false");
  followGpsEl.setAttribute("aria-label", enabled ? "Desactiver le suivi GPS" : "Activer le suivi GPS");
}

function setHeadingMapEnabled(enabled: boolean) {
  isHeadingMapEnabled = enabled;
  headingEl.classList.toggle("is-active", enabled);
  headingEl.setAttribute("aria-pressed", enabled ? "true" : "false");
  headingEl.setAttribute(
    "aria-label",
    enabled ? "Desactiver l'orientation de la carte" : "Orienter la carte selon le telephone"
  );

  if (enabled && lastOrientation) {
    applyMapHeading(lastOrientation.headingDegrees);
  } else if (!enabled) {
    lastAppliedMapHeadingDegrees = null;
    lastHeadingMapRotationAt = 0;
  }
}

function disableAutoMapModesOnUserMove(event?: { originalEvent?: unknown }) {
  if (!event?.originalEvent) {
    return;
  }

  isUserInteractingWithMap = true;

  if (IS_MOCK_GPS_MODE && isFollowGpsEnabled) {
    setFollowGps(false);
  }

  if (isHeadingMapEnabled) {
    setHeadingMapEnabled(false);
  }
}

function pauseAutomaticMapHeading() {
  isUserInteractingWithMap = true;
}

function resumeAutomaticMapHeading() {
  window.setTimeout(() => {
    isUserInteractingWithMap = false;

    if (isHeadingMapEnabled && lastOrientation) {
      applyMapHeading(lastOrientation.headingDegrees);
    }
  }, 120);
}

function handleGpsReading(reading: GpsReading) {
  lastReading = reading;
  renderReading(reading);
  weatherRefreshEl.disabled = false;

  if (!hasLoadedInitialWeather) {
    void updateWeather(reading);
  }

  setStatus(null);
}

function handleGpsError(message: string) {
  isGpsActive = false;
  gpsRetryEl.hidden = false;
  weatherRefreshEl.disabled = true;
  setFollowGps(false);
  setStatus(message);
}

function createReadingFromGeolocateEvent(event: unknown): GpsReading {
  const position = event as {
    coords?: {
      latitude?: number;
      longitude?: number;
      accuracy?: number;
      speed?: number | null;
    };
    timestamp?: number;
  };

  if (
    typeof position.coords?.latitude !== "number" ||
    typeof position.coords.longitude !== "number" ||
    typeof position.coords.accuracy !== "number"
  ) {
    throw new Error("Invalid geolocation event");
  }

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    timestamp: typeof position.timestamp === "number" ? position.timestamp : Date.now(),
    speedMetersPerSecond:
      typeof position.coords.speed === "number" && Number.isFinite(position.coords.speed)
        ? position.coords.speed
        : null
  };
}

function getGpsErrorMessage(event: unknown): string {
  const geolocationError = event as { code?: number };

  if (geolocationError.code === 1) {
    return "Permission GPS refusee.";
  }

  return "GPS indisponible.";
}

async function startOrientation(options: { rotateMap: boolean }) {
  let hasOrientationError = false;

  try {
    const stop = await orientationProvider.watch(
      (reading) => {
        lastOrientation = reading;
        renderOrientation(reading);

        if (isHeadingMapEnabled) {
          applyMapHeading(reading.headingDegrees);
        }
      },
      (message) => {
        hasOrientationError = true;
        stopOrientation = null;
        setHeadingMapEnabled(false);
        setStatus(message);
      }
    );

    if (hasOrientationError) {
      return;
    }

    stopOrientation = stop;

    if (options.rotateMap) {
      setHeadingMapEnabled(true);
    }
  } catch {
    setHeadingMapEnabled(false);
    setStatus("Orientation indisponible.");
  }
}

function renderOrientation(reading: OrientationReading) {
  if (!currentMarkerElement) {
    return;
  }

  const now = Date.now();
  const previousHeadingDegrees = lastRenderedHeadingDegrees ?? reading.headingDegrees;
  const deltaDegrees = Math.abs(getShortestAngleDelta(previousHeadingDegrees, reading.headingDegrees));

  if (
    lastRenderedHeadingDegrees !== null &&
    deltaDegrees < HEADING_MARKER_MIN_RENDER_DELTA_DEGREES &&
    now - lastHeadingMarkerRenderAt < HEADING_MARKER_MIN_RENDER_INTERVAL_MS
  ) {
    return;
  }

  lastRenderedHeadingDegrees = reading.headingDegrees;
  lastHeadingMarkerRenderAt = now;
  currentMarkerElement.classList.add("has-heading");
  currentMarkerElement.style.setProperty("--heading", `${reading.headingDegrees - map.getBearing()}deg`);
}

function syncCamera(duration: number) {
  if (isUserZoomingMap) {
    return;
  }

  if (isFollowGpsEnabled && lastUsableReading) {
    moveMapToGps(lastUsableReading, { duration });
    return;
  }

  if (isHeadingMapEnabled && lastOrientation && shouldApplyMapHeading(lastOrientation.headingDegrees)) {
    map.jumpTo({ bearing: lastOrientation.headingDegrees }, { geolocateSource: true });
  }
}

function applyMapHeading(headingDegrees: number) {
  if (
    !isHeadingMapEnabled ||
    isUserInteractingWithMap ||
    isUserZoomingMap ||
    map.isMoving() ||
    !shouldApplyMapHeading(headingDegrees)
  ) {
    return;
  }

  map.jumpTo({ bearing: headingDegrees }, { geolocateSource: true });
}

function shouldApplyMapHeading(headingDegrees: number): boolean {
  const now = Date.now();
  const previousHeadingDegrees = lastAppliedMapHeadingDegrees ?? map.getBearing();
  const deltaDegrees = Math.abs(getShortestAngleDelta(previousHeadingDegrees, headingDegrees));

  if (
    deltaDegrees < HEADING_MAP_MIN_ROTATION_DELTA_DEGREES &&
    now - lastHeadingMapRotationAt < HEADING_MAP_MIN_ROTATION_INTERVAL_MS
  ) {
    return false;
  }

  lastAppliedMapHeadingDegrees = headingDegrees;
  lastHeadingMapRotationAt = now;
  return true;
}

function isUsablePositionReading(reading: GpsReading): boolean {
  return reading.accuracy <= POSITION_MAX_ACCURACY_METERS;
}

function getShortestAngleDelta(fromDegrees: number, toDegrees: number): number {
  return ((((toDegrees - fromDegrees) % 360) + 540) % 360) - 180;
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

function setActiveView(view: "map" | "weather") {
  const isWeatherView = view === "weather";

  weatherViewEl.hidden = !isWeatherView;
  mapTabEl.classList.toggle("is-active", !isWeatherView);
  weatherTabEl.classList.toggle("is-active", isWeatherView);

  if (isWeatherView) {
    mapTabEl.removeAttribute("aria-current");
    weatherTabEl.setAttribute("aria-current", "page");
  } else {
    mapTabEl.setAttribute("aria-current", "page");
    weatherTabEl.removeAttribute("aria-current");
  }

  if (!isWeatherView) {
    map.resize();
    collapseMapAttribution();
  }
}

function collapseMapAttribution() {
  const attribution = document.querySelector<HTMLDetailsElement>(".maplibregl-ctrl-attrib");

  if (!attribution) {
    return;
  }

  attribution.open = false;
  attribution.removeAttribute("open");
  attribution.classList.remove("maplibregl-compact-show");
}

function getDisplaySpeedKmh(reading: GpsReading): number | null {
  const previous = lastSpeedReading;
  const nativeSpeedKmh = getNativeSpeedKmh(reading);

  if (!previous || previous.timestamp === reading.timestamp) {
    lastSpeedReading = reading;
    return applySpeedGuards(nativeSpeedKmh);
  }

  if (reading.accuracy > SPEED_MIN_ACCURACY_METERS || previous.accuracy > SPEED_MIN_ACCURACY_METERS) {
    if (nativeSpeedKmh === null) {
      return lastSmoothedSpeedKmh;
    }

    lastSpeedReading = reading;
    return applySpeedGuards(nativeSpeedKmh);
  }

  const elapsedSeconds = (reading.timestamp - previous.timestamp) / 1000;

  if (elapsedSeconds < SPEED_MIN_ELAPSED_SECONDS) {
    return lastSmoothedSpeedKmh;
  }

  const distanceMeters = haversineDistanceMeters(previous, reading);
  const stationaryDistanceMeters = Math.max(
    SPEED_MIN_DISTANCE_METERS,
    Math.min(previous.accuracy, reading.accuracy) * SPEED_STATIONARY_ACCURACY_RATIO
  );

  if (distanceMeters <= stationaryDistanceMeters) {
    lastSpeedReading = reading;
    return nativeSpeedKmh === null ? smoothSpeed(0) : applySpeedGuards(nativeSpeedKmh);
  }

  const computedKmh = (distanceMeters / elapsedSeconds) * 3.6;

  if (!Number.isFinite(computedKmh) || computedKmh < 0) {
    return lastSmoothedSpeedKmh;
  }

  if (nativeSpeedKmh !== null && computedKmh <= SPEED_MAX_PLAUSIBLE_KMH) {
    lastSpeedReading = reading;
    return applySpeedGuards(nativeSpeedKmh);
  }

  lastSpeedReading = reading;
  return applySpeedGuards(computedKmh);
}

function getNativeSpeedKmh(reading: GpsReading): number | null {
  const nativeSpeed = reading.speedMetersPerSecond;

  if (typeof nativeSpeed !== "number" || !Number.isFinite(nativeSpeed) || nativeSpeed < 0) {
    return null;
  }

  return nativeSpeed * 3.6;
}

function applySpeedGuards(nextKmh: number | null): number | null {
  if (nextKmh === null) {
    return lastSmoothedSpeedKmh;
  }

  if (!Number.isFinite(nextKmh) || nextKmh < 0 || nextKmh > SPEED_MAX_PLAUSIBLE_KMH) {
    lastSmoothedSpeedKmh = null;
    return null;
  }

  const guardedKmh = nextKmh < SPEED_ZERO_THRESHOLD_KMH ? 0 : nextKmh;

  if (
    lastSmoothedSpeedKmh !== null &&
    lastSmoothedSpeedKmh <= SPEED_NEAR_ZERO_KMH &&
    guardedKmh >= SPEED_START_CONFIRM_KMH
  ) {
    if (
      pendingStartSpeedKmh === null ||
      Math.abs(pendingStartSpeedKmh - guardedKmh) > SPEED_START_CONFIRM_TOLERANCE_KMH
    ) {
      pendingStartSpeedKmh = guardedKmh;
      return lastSmoothedSpeedKmh;
    }
  } else {
    pendingStartSpeedKmh = null;
  }

  if (
    lastSmoothedSpeedKmh !== null &&
    lastSmoothedSpeedKmh > 5 &&
    guardedKmh > lastSmoothedSpeedKmh + SPEED_JUMP_MARGIN_KMH &&
    guardedKmh > lastSmoothedSpeedKmh * SPEED_JUMP_FACTOR
  ) {
    return lastSmoothedSpeedKmh;
  }

  pendingStartSpeedKmh = null;
  return smoothSpeed(guardedKmh);
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
