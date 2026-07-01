import maplibregl from "maplibre-gl";
import type { GeoJSONSource, GeoJSONSourceSpecification } from "maplibre-gl";
import { CloudSun, Gauge, Map, Route, Ruler, Search, Settings, X, createIcons } from "lucide";
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
const DEFAULT_FOLLOW_MAX_ZOOM = 15;
const GPS_START_TIMEOUT_MS = 15000;
const GPS_STALE_AFTER_MS = 20000;
const GPS_WATCHDOG_INTERVAL_MS = 10000;
const GPS_MAX_RECOVERY_ATTEMPTS = 2;
const SHORE_SEARCH_MARGIN_METERS = 2000;
const LEMAN_SEARCH_VIEWBOX = "6.05,46.62,6.98,46.15";
const ROUTE_DESTINATION_INSET_METERS = 60;
const ROUTE_SHORE_LIMIT_METERS = 300;
const ROUTE_GRID_CELL_METERS = 200;
const ROUTE_GRID_SPECIAL_LINKS = 16;
const ROUTE_GRID_SPECIAL_LINK_RADIUS_METERS = 1400;
const IS_MOCK_GPS_MODE = import.meta.env.DEV && new URLSearchParams(window.location.search).get("gps") === "mock";

type ScreenWakeLock = {
  release: () => Promise<void>;
  addEventListener: (type: "release", listener: () => void) => void;
};

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<ScreenWakeLock>;
  };
};

type ShorelineGeoJson = {
  type: "FeatureCollection";
  features: Array<{
    geometry?: {
      type?: string;
      coordinates?: unknown;
    };
  }>;
};

type Coordinate = [number, number];

type LakeGeometry = {
  polygon: Coordinate[];
  shoreline: Coordinate[];
};

type RouteGeometry = {
  polygon: Coordinate[];
  boundary: Coordinate[];
};

type NominatimResult = {
  osm_type?: string;
  osm_id?: number;
  lat?: string;
  lon?: string;
  name?: string;
  display_name?: string;
  class?: string;
  type?: string;
  namedetails?: {
    name?: string;
  };
};

type Place = {
  id: string;
  source: "osm";
  osmType: "node" | "way" | "relation";
  osmId: number;
  name: string;
  category: string | null;
  displayName: string;
  coordinates: Coordinate;
  distanceFromUserMeters: number | null;
  distanceFromShoreMeters: number;
  enrichment: null;
};

type RouteResult = {
  coordinates: Coordinate[];
  distanceMeters: number;
};

type NearestBoundaryPoint = {
  coordinate: Coordinate;
  segmentIndex: number;
};

type RouteGridNode = {
  coordinate: Coordinate;
  gridX: number;
  gridY: number;
  isSpecial: boolean;
};

type RouteQueueItem = {
  index: number;
  priority: number;
};

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app root element");
}

app.innerHTML = `
  <div id="map" aria-label="Carte du Léman"></div>
  <div class="panel-stack">
    <section id="speedCard" class="speed-card is-collapsed" role="button" tabindex="0" aria-label="Afficher la vitesse" aria-live="polite">
      <header class="panel-header speed-header">
        <i class="speed-icon" data-lucide="gauge" aria-hidden="true"></i>
      </header>
      <div class="speed-body">
        <strong id="speedValue">--</strong>
        <span class="speed-unit">km/h</span>
      </div>
    </section>
    <section id="shoreDistanceCard" class="shore-distance-card is-collapsed" role="button" tabindex="0" aria-label="Afficher la distance au bord" aria-live="polite">
      <header class="panel-header shore-distance-header">
        <i class="shore-distance-icon" data-lucide="ruler" aria-hidden="true"></i>
      </header>
      <div class="shore-distance-body">
        <strong id="shoreDistanceValue">--</strong>
        <span id="shoreDistanceUnit" class="shore-distance-unit">m du bord</span>
      </div>
    </section>
    <section id="placeSearchCard" class="place-search-card is-collapsed" role="button" tabindex="0" aria-label="Rechercher un lieu">
      <header class="panel-header place-search-card-header">
        <i class="place-search-icon" data-lucide="search" aria-hidden="true"></i>
      </header>
    </section>
  </div>
  <section id="placeSearchPanel" class="place-search-panel" aria-label="Recherche de lieu" hidden>
    <form id="placeSearchForm" class="place-search-form">
      <i class="place-search-form-icon" data-lucide="search" aria-hidden="true"></i>
      <input id="placeSearchInput" type="search" autocomplete="off" placeholder="Rechercher un lieu" aria-label="Rechercher un lieu" />
      <button class="place-search-submit" type="submit" aria-label="Lancer la recherche">
        <i data-lucide="search" aria-hidden="true"></i>
      </button>
      <button id="placeSearchClose" class="place-search-close" type="button" aria-label="Fermer la recherche">
        <i data-lucide="x" aria-hidden="true"></i>
      </button>
    </form>
    <div id="placeSearchStatus" class="place-search-status">Saisissez un lieu autour du Léman.</div>
    <div id="placeSearchResults" class="place-search-results" hidden></div>
  </section>
  <article id="selectedPlaceCard" class="selected-place-card" hidden>
    <div>
      <strong id="selectedPlaceName">--</strong>
      <span id="selectedPlaceMeta">--</span>
      <button id="selectedPlaceRoute" class="selected-place-route" type="button">
        <i data-lucide="route" aria-hidden="true"></i>
        <span>Itinéraire</span>
      </button>
      <span id="selectedPlaceDistance">--</span>
    </div>
    <button id="selectedPlaceClose" class="selected-place-close" type="button" aria-label="Masquer le lieu">
      <i data-lucide="x" aria-hidden="true"></i>
    </button>
  </article>
  <section id="weatherView" class="weather-view" aria-label="Météo" hidden>
    <div class="weather-screen-shell">
      <section id="weatherCard" class="weather-card weather-screen-card" aria-live="polite">
        <header class="panel-header weather-screen-header">
          <div>
            <span class="panel-title">Météo</span>
            <h1 class="weather-screen-title">Conditions</h1>
          </div>
          <button id="weatherRefresh" class="panel-toggle" type="button" aria-label="Actualiser la météo" disabled>↻</button>
        </header>
        <div class="weather-body">
          <div class="weather-tabs" role="group" aria-label="Période météo">
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
  <section id="settingsView" class="settings-view" aria-label="Réglages" hidden>
    <div class="settings-screen-shell">
      <section class="settings-card">
        <header class="settings-header">
          <span class="panel-title">Réglages</span>
          <h1 class="settings-title">Navigation</h1>
        </header>
        <div class="settings-list">
          <div class="settings-section-title">Carte</div>
          <div class="setting-row setting-info-row">
            <span class="setting-line-swatch" aria-hidden="true"></span>
            <div class="setting-copy">
              <strong>Limite indicative 300 m</strong>
              <span>Ligne orange traitillée sur la carte. Indication visuelle, pas une référence légale.</span>
            </div>
          </div>
          <div class="settings-section-title">Appareil</div>
          <div class="setting-row">
            <div class="setting-copy">
              <strong>Écran actif</strong>
              <span id="wakeLockStatus">Garde l'écran allumé pendant que l'app est visible.</span>
            </div>
            <button id="wakeLockToggle" class="setting-switch" type="button" role="switch" aria-checked="false" aria-label="Garder l'écran actif">
              <span></span>
            </button>
          </div>
        </div>
      </section>
    </div>
  </section>
  <button id="gpsRetryButton" class="gps-retry-button" type="button" hidden>Réessayer GPS</button>
  <div class="gps-controls" aria-label="Contrôle GPS carte">
    <button id="centerGpsButton" class="gps-map-button" type="button" aria-label="Centrer sur la position GPS">⌖</button>
    <button id="followGpsButton" class="gps-map-button" type="button" aria-label="Activer le suivi GPS" aria-pressed="false">◎</button>
    <button id="headingButton" class="gps-map-button" type="button" aria-label="Activer l'orientation téléphone" aria-pressed="false">▲</button>
  </div>
  <div id="statusMessage" class="status-message" hidden></div>
  <nav class="bottom-nav" aria-label="Navigation principale">
    <button id="mapTab" class="bottom-nav-button is-active" type="button" aria-label="Afficher la carte" aria-current="page">
      <i class="bottom-nav-icon" data-lucide="map" aria-hidden="true"></i>
    </button>
    <button id="weatherTab" class="bottom-nav-button" type="button" aria-label="Afficher la météo">
      <i class="bottom-nav-icon" data-lucide="cloud-sun" aria-hidden="true"></i>
    </button>
    <button id="settingsTab" class="bottom-nav-button" type="button" aria-label="Afficher les réglages">
      <i class="bottom-nav-icon" data-lucide="settings" aria-hidden="true"></i>
    </button>
  </nav>
`;

createIcons({
  icons: {
    CloudSun,
    Gauge,
    Map,
    Route,
    Ruler,
    Search,
    Settings,
    X
  }
});

const speedValue = document.querySelector<HTMLElement>("#speedValue");
const speedCard = document.querySelector<HTMLElement>("#speedCard");
const shoreDistanceValue = document.querySelector<HTMLElement>("#shoreDistanceValue");
const shoreDistanceUnit = document.querySelector<HTMLElement>("#shoreDistanceUnit");
const shoreDistanceCard = document.querySelector<HTMLElement>("#shoreDistanceCard");
const placeSearchCard = document.querySelector<HTMLElement>("#placeSearchCard");
const placeSearchPanel = document.querySelector<HTMLElement>("#placeSearchPanel");
const placeSearchForm = document.querySelector<HTMLFormElement>("#placeSearchForm");
const placeSearchInput = document.querySelector<HTMLInputElement>("#placeSearchInput");
const placeSearchClose = document.querySelector<HTMLButtonElement>("#placeSearchClose");
const placeSearchStatus = document.querySelector<HTMLElement>("#placeSearchStatus");
const placeSearchResults = document.querySelector<HTMLElement>("#placeSearchResults");
const selectedPlaceCard = document.querySelector<HTMLElement>("#selectedPlaceCard");
const selectedPlaceName = document.querySelector<HTMLElement>("#selectedPlaceName");
const selectedPlaceMeta = document.querySelector<HTMLElement>("#selectedPlaceMeta");
const selectedPlaceDistance = document.querySelector<HTMLElement>("#selectedPlaceDistance");
const selectedPlaceRoute = document.querySelector<HTMLButtonElement>("#selectedPlaceRoute");
const selectedPlaceClose = document.querySelector<HTMLButtonElement>("#selectedPlaceClose");
const weatherView = document.querySelector<HTMLElement>("#weatherView");
const settingsView = document.querySelector<HTMLElement>("#settingsView");
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
const wakeLockStatus = document.querySelector<HTMLElement>("#wakeLockStatus");
const wakeLockToggle = document.querySelector<HTMLButtonElement>("#wakeLockToggle");
const gpsRetryButton = document.querySelector<HTMLButtonElement>("#gpsRetryButton");
const centerGpsButton = document.querySelector<HTMLButtonElement>("#centerGpsButton");
const followGpsButton = document.querySelector<HTMLButtonElement>("#followGpsButton");
const headingButton = document.querySelector<HTMLButtonElement>("#headingButton");
const statusMessage = document.querySelector<HTMLDivElement>("#statusMessage");
const mapTab = document.querySelector<HTMLButtonElement>("#mapTab");
const weatherTab = document.querySelector<HTMLButtonElement>("#weatherTab");
const settingsTab = document.querySelector<HTMLButtonElement>("#settingsTab");

if (
  !speedValue ||
  !speedCard ||
  !shoreDistanceValue ||
  !shoreDistanceUnit ||
  !shoreDistanceCard ||
  !placeSearchCard ||
  !placeSearchPanel ||
  !placeSearchForm ||
  !placeSearchInput ||
  !placeSearchClose ||
  !placeSearchStatus ||
  !placeSearchResults ||
  !selectedPlaceCard ||
  !selectedPlaceName ||
  !selectedPlaceMeta ||
  !selectedPlaceDistance ||
  !selectedPlaceRoute ||
  !selectedPlaceClose ||
  !weatherView ||
  !settingsView ||
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
  !wakeLockStatus ||
  !wakeLockToggle ||
  !gpsRetryButton ||
  !centerGpsButton ||
  !followGpsButton ||
  !headingButton ||
  !statusMessage ||
  !mapTab ||
  !weatherTab ||
  !settingsTab
) {
  throw new Error("Missing required UI elements");
}

const speedEl = speedValue;
const speedCardEl = speedCard;
const shoreDistanceValueEl = shoreDistanceValue;
const shoreDistanceUnitEl = shoreDistanceUnit;
const shoreDistanceCardEl = shoreDistanceCard;
const placeSearchCardEl = placeSearchCard;
const placeSearchPanelEl = placeSearchPanel;
const placeSearchFormEl = placeSearchForm;
const placeSearchInputEl = placeSearchInput;
const placeSearchCloseEl = placeSearchClose;
const placeSearchStatusEl = placeSearchStatus;
const placeSearchResultsEl = placeSearchResults;
const selectedPlaceCardEl = selectedPlaceCard;
const selectedPlaceNameEl = selectedPlaceName;
const selectedPlaceMetaEl = selectedPlaceMeta;
const selectedPlaceDistanceEl = selectedPlaceDistance;
const selectedPlaceRouteEl = selectedPlaceRoute;
const selectedPlaceCloseEl = selectedPlaceClose;
const weatherViewEl = weatherView;
const settingsViewEl = settingsView;
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
const wakeLockStatusEl = wakeLockStatus;
const wakeLockToggleEl = wakeLockToggle;
const gpsRetryEl = gpsRetryButton;
const centerGpsEl = centerGpsButton;
const followGpsEl = followGpsButton;
const headingEl = headingButton;
const statusEl = statusMessage;
const mapTabEl = mapTab;
const weatherTabEl = weatherTab;
const settingsTabEl = settingsTab;

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
        maxZoom: DEFAULT_FOLLOW_MAX_ZOOM,
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
    scheduleGpsStartTimeout();
    gpsRetryEl.hidden = true;
    if (!isCameraLockedForPlaceOrRoute) {
      setFollowGps(true);
    }
    setStatus(null);
  });
  geolocateControl.on("userlocationfocus", () => {
    if (!isCameraLockedForPlaceOrRoute) {
      setFollowGps(true);
    }
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
let isShoreDistancePanelOpen = false;
let isPlaceSearchPanelOpen = false;
let isPlaceSearchLoading = false;
let isMapReady = false;
let isGpsActive = false;
let isFollowGpsEnabled = false;
let isHeadingMapEnabled = false;
let isUserInteractingWithMap = false;
let isUserZoomingMap = false;
let isCameraLockedForPlaceOrRoute = false;
let shouldPreserveFollowZoomAfterUserZoom = false;
let lastAppliedMapHeadingDegrees: number | null = null;
let lastHeadingMapRotationAt = 0;
let lastRenderedHeadingDegrees: number | null = null;
let lastHeadingMarkerRenderAt = 0;
let lastGpsReadingAt = 0;
let gpsStartAttemptAt = 0;
let gpsRecoveryAttemptCount = 0;
let gpsStartTimeoutId: number | null = null;
let gpsWatchdogId: number | null = null;
let isGpsAutoRecoveryBlocked = false;
let screenWakeLock: ScreenWakeLock | null = null;
let isRequestingScreenWakeLock = false;
let isScreenWakeLockEnabled = false;
let shorelineCoordinatesPromise: Promise<Coordinate[]> | null = null;
let lakeGeometryPromise: Promise<LakeGeometry> | null = null;
let routeGeometryPromise: Promise<RouteGeometry> | null = null;
let placeSearchResultsState: Place[] = [];
let selectedPlaceState: Place | null = null;
let selectedRouteDistanceMeters: number | null = null;

const gpsProvider = IS_MOCK_GPS_MODE ? createGpsProvider() : null;
const orientationProvider = createOrientationProvider();

map.on("load", () => {
  isMapReady = true;
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

  map.addSource("selected-route", {
    type: "geojson",
    data: createRouteGeoJson(null)
  } satisfies GeoJSONSourceSpecification);

  map.addLayer({
    id: "selected-route-glow",
    type: "line",
    source: "selected-route",
    paint: {
      "line-color": "#ffffff",
      "line-width": ["interpolate", ["linear"], ["zoom"], 8, 4, 12, 7, 15, 10],
      "line-opacity": 0.62,
      "line-blur": 1.2
    }
  });

  map.addLayer({
    id: "selected-route-line",
    type: "line",
    source: "selected-route",
    paint: {
      "line-color": "#9f1239",
      "line-width": ["interpolate", ["linear"], ["zoom"], 8, 2, 12, 4, 15, 6],
      "line-opacity": 0.96
    }
  });

  startGpsWatchdog();
  startGps();
});

gpsRetryEl.addEventListener("click", () => {
  unlockCameraForGpsAction();
  isGpsAutoRecoveryBlocked = false;
  gpsRecoveryAttemptCount = 0;

  if (geolocateControl) {
    triggerGeolocateControl();
    return;
  }

  isGpsActive = false;
  startGps();
});

centerGpsEl.addEventListener("click", () => {
  unlockCameraForGpsAction();

  if (!isGpsActive) {
    startGps();
    return;
  }

  if (lastUsableReading) {
    centerOnGps(lastUsableReading);
  } else if (geolocateControl) {
    triggerGeolocateControl();
  } else {
    setStatus("Position GPS en attente...");
  }
});

followGpsEl.addEventListener("click", () => {
  unlockCameraForGpsAction();

  if (geolocateControl) {
    if (!isGpsActive) {
      startGps();
      return;
    }

    triggerGeolocateControl();
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
  unlockCameraForGpsAction();

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
    shouldPreserveFollowZoomAfterUserZoom = true;
  }
});
map.on("zoomend", () => {
  isUserZoomingMap = false;
  isUserInteractingWithMap = false;

  if (shouldPreserveFollowZoomAfterUserZoom) {
    preserveCurrentFollowZoom();
    shouldPreserveFollowZoomAfterUserZoom = false;
  }

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

if (IS_MOCK_GPS_MODE) {
  void startOrientation({ rotateMap: false });
}

function startGps() {
  if (isGpsActive) {
    recoverGpsIfStale();
    return;
  }

  if (!isMapReady) {
    gpsRetryEl.hidden = true;
    setStatus(null);
    return;
  }

  isGpsActive = true;
  gpsStartAttemptAt = Date.now();
  scheduleGpsStartTimeout();
  gpsRetryEl.hidden = true;
  setStatus(null);

  if (geolocateControl) {
    triggerGeolocateControl();
    return;
  }

  if (!gpsProvider) {
    handleGpsError("GPS indisponible.");
    return;
  }

  stopGps = gpsProvider.watch(handleGpsReading, handleGpsError);
}

function triggerGeolocateControl(): boolean {
  if (!geolocateControl) {
    return false;
  }

  gpsStartAttemptAt = Date.now();
  scheduleGpsStartTimeout();

  const didTrigger = geolocateControl.trigger();

  if (!didTrigger) {
    handleGpsError("GPS indisponible.");
    return false;
  }

  isGpsActive = true;
  gpsRetryEl.hidden = true;
  setStatus(null);
  return true;
}

function scheduleGpsStartTimeout() {
  clearGpsStartTimeout();

  if (IS_MOCK_GPS_MODE) {
    return;
  }

  gpsStartTimeoutId = window.setTimeout(() => {
    recoverGpsIfStale();
  }, GPS_START_TIMEOUT_MS);
}

function clearGpsStartTimeout() {
  if (gpsStartTimeoutId === null) {
    return;
  }

  window.clearTimeout(gpsStartTimeoutId);
  gpsStartTimeoutId = null;
}

function startGpsWatchdog() {
  if (IS_MOCK_GPS_MODE || gpsWatchdogId !== null) {
    return;
  }

  gpsWatchdogId = window.setInterval(() => {
    recoverGpsIfStale();
  }, GPS_WATCHDOG_INTERVAL_MS);
}

function recoverGpsIfStale() {
  if (
    IS_MOCK_GPS_MODE ||
    document.visibilityState === "hidden" ||
    isGpsAutoRecoveryBlocked ||
    isCameraLockedForPlaceOrRoute
  ) {
    return;
  }

  if (!isMapReady) {
    return;
  }

  if (!isGpsActive) {
    startGps();
    return;
  }

  const now = Date.now();
  const lastActivityAt = lastGpsReadingAt || gpsStartAttemptAt;
  const staleAfterMs = lastGpsReadingAt ? GPS_STALE_AFTER_MS : GPS_START_TIMEOUT_MS;

  if (!lastActivityAt || now - lastActivityAt < staleAfterMs) {
    return;
  }

  if (gpsRecoveryAttemptCount >= GPS_MAX_RECOVERY_ATTEMPTS) {
    clearGpsStartTimeout();
    isGpsAutoRecoveryBlocked = true;
    handleGpsError("GPS indisponible.");
    return;
  }

  gpsRecoveryAttemptCount += 1;

  if (geolocateControl) {
    triggerGeolocateControl();
    return;
  }

  stopGps?.();
  stopGps = null;
  isGpsActive = false;
  startGps();
}

async function toggleScreenWakeLock() {
  if (isScreenWakeLockEnabled) {
    isScreenWakeLockEnabled = false;
    await releaseScreenWakeLock();
    renderWakeLockSetting("désactivé");
    return;
  }

  isScreenWakeLockEnabled = true;
  renderWakeLockSetting("demande");
  requestScreenWakeLockIfEnabled();
}

function requestScreenWakeLockIfEnabled() {
  if (!isScreenWakeLockEnabled) {
    return;
  }

  requestScreenWakeLock();
}

function requestScreenWakeLock() {
  if (document.visibilityState !== "visible" || screenWakeLock || isRequestingScreenWakeLock) {
    return;
  }

  const wakeLock = (navigator as WakeLockNavigator).wakeLock;

  if (!wakeLock) {
    renderWakeLockSetting("indisponible");
    return;
  }

  isRequestingScreenWakeLock = true;

  void wakeLock
    .request("screen")
    .then((lock) => {
      screenWakeLock = lock;
      renderWakeLockSetting("actif");
      lock.addEventListener("release", () => {
        if (screenWakeLock === lock) {
          screenWakeLock = null;
        }

        renderWakeLockSetting(isScreenWakeLockEnabled ? "demande" : "désactivé");

        if (isScreenWakeLockEnabled && document.visibilityState === "visible") {
          window.setTimeout(requestScreenWakeLockIfEnabled, 1000);
        }
      });
    })
    .catch(() => {
      screenWakeLock = null;
      renderWakeLockSetting("refusé");
    })
    .finally(() => {
      isRequestingScreenWakeLock = false;
    });
}

async function releaseScreenWakeLock() {
  const lock = screenWakeLock;
  screenWakeLock = null;
  await lock?.release();
}

function renderWakeLockSetting(status: "désactivé" | "demande" | "actif" | "refusé" | "indisponible") {
  wakeLockToggleEl.classList.toggle("is-active", isScreenWakeLockEnabled);
  wakeLockToggleEl.setAttribute("aria-checked", isScreenWakeLockEnabled ? "true" : "false");

  if (status === "actif") {
    wakeLockStatusEl.textContent = "Actif tant que l'app reste visible.";
    return;
  }

  if (status === "demande") {
    wakeLockStatusEl.textContent = "Activation en cours...";
    return;
  }

  if (status === "refusé") {
    wakeLockStatusEl.textContent = "Non activé par le navigateur.";
    return;
  }

  if (status === "indisponible") {
    wakeLockStatusEl.textContent = "Non disponible sur ce navigateur.";
    return;
  }

  wakeLockStatusEl.textContent = "Garde l'écran allumé pendant que l'app est visible.";
}

function toggleSpeedPanel() {
  isSpeedPanelOpen = speedCardEl.classList.toggle("is-collapsed") === false;
  speedCardEl.setAttribute("aria-label", isSpeedPanelOpen ? "Masquer la vitesse" : "Afficher la vitesse");

  if (!isSpeedPanelOpen) {
    lastSmoothedSpeedKmh = null;
    pendingStartSpeedKmh = null;
    lastSpeedReading = null;
    speedEl.textContent = "--";
    return;
  }

  if (lastReading) {
    renderSpeed(lastReading);
  }
}

function toggleShoreDistancePanel() {
  isShoreDistancePanelOpen = shoreDistanceCardEl.classList.toggle("is-collapsed") === false;
  shoreDistanceCardEl.setAttribute(
    "aria-label",
    isShoreDistancePanelOpen ? "Masquer la distance au bord" : "Afficher la distance au bord"
  );

  if (!isShoreDistancePanelOpen) {
    shoreDistanceValueEl.textContent = "--";
    shoreDistanceUnitEl.textContent = "m du bord";
    return;
  }

  void renderShoreDistance();
}

function setPlaceSearchPanelOpen(open: boolean) {
  isPlaceSearchPanelOpen = open;
  placeSearchPanelEl.hidden = !open;
  placeSearchCardEl.classList.toggle("is-active", open);
  placeSearchCardEl.setAttribute("aria-label", open ? "Fermer la recherche" : "Rechercher un lieu");

  if (open) {
    selectedPlaceCardEl.hidden = true;
    selectedPlaceState = null;
    clearSelectedRoute();
    resetPlaceSearchPanel();
    window.setTimeout(() => {
      placeSearchInputEl.focus();
    }, 0);
  }
}

function resetPlaceSearchPanel() {
  placeSearchInputEl.value = "";
  placeSearchResultsState = [];
  placeSearchResultsEl.replaceChildren();
  placeSearchResultsEl.hidden = true;
  placeSearchStatusEl.hidden = false;
  placeSearchStatusEl.textContent = "Saisissez un lieu autour du Léman.";
}

speedCardEl.addEventListener("click", () => {
  toggleSpeedPanel();
});

speedCardEl.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  event.preventDefault();
  toggleSpeedPanel();
});

shoreDistanceCardEl.addEventListener("click", () => {
  toggleShoreDistancePanel();
});

shoreDistanceCardEl.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  event.preventDefault();
  toggleShoreDistancePanel();
});

placeSearchCardEl.addEventListener("click", () => {
  setPlaceSearchPanelOpen(!isPlaceSearchPanelOpen);
});

placeSearchCardEl.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  event.preventDefault();
  setPlaceSearchPanelOpen(!isPlaceSearchPanelOpen);
});

placeSearchCloseEl.addEventListener("click", () => {
  setPlaceSearchPanelOpen(false);
});

selectedPlaceCloseEl.addEventListener("click", () => {
  selectedPlaceCardEl.hidden = true;
  selectedPlaceState = null;
  clearSelectedRoute();
});

selectedPlaceRouteEl.addEventListener("click", () => {
  void renderRouteToSelectedPlace();
});

placeSearchFormEl.addEventListener("submit", (event) => {
  event.preventDefault();
  void searchPlaces();
});

mapTabEl.addEventListener("click", () => {
  setActiveView("map");
});

weatherTabEl.addEventListener("click", () => {
  setActiveView("weather");
});

settingsTabEl.addEventListener("click", () => {
  setActiveView("settings");
});

wakeLockToggleEl.addEventListener("click", () => {
  void toggleScreenWakeLock();
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
  clearGpsStartTimeout();
  if (gpsWatchdogId !== null) {
    window.clearInterval(gpsWatchdogId);
  }
  void releaseScreenWakeLock();
  stopGps?.();
  stopOrientation?.();
});

window.addEventListener("pageshow", () => {
  requestScreenWakeLockIfEnabled();
  recoverGpsIfStale();
});

window.addEventListener("focus", () => {
  requestScreenWakeLockIfEnabled();
  recoverGpsIfStale();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    requestScreenWakeLockIfEnabled();
    recoverGpsIfStale();
  }
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
  if (enabled && !IS_MOCK_GPS_MODE) {
    preserveCurrentFollowZoom();
  }
  followGpsEl.classList.toggle("is-active", enabled);
  followGpsEl.setAttribute("aria-pressed", enabled ? "true" : "false");
  followGpsEl.setAttribute("aria-label", enabled ? "Désactiver le suivi GPS" : "Activer le suivi GPS");
}

function preserveCurrentFollowZoom() {
  if (!geolocateControl || !isFollowGpsEnabled) {
    return;
  }

  geolocateControl.options.fitBoundsOptions = {
    ...geolocateControl.options.fitBoundsOptions,
    maxZoom: map.getZoom()
  };
}

function setHeadingMapEnabled(enabled: boolean) {
  isHeadingMapEnabled = enabled;
  headingEl.classList.toggle("is-active", enabled);
  headingEl.setAttribute("aria-pressed", enabled ? "true" : "false");
  headingEl.setAttribute(
    "aria-label",
    enabled ? "Désactiver l'orientation de la carte" : "Orienter la carte selon le téléphone"
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
  lastGpsReadingAt = Date.now();
  gpsStartAttemptAt = 0;
  gpsRecoveryAttemptCount = 0;
  isGpsActive = true;
  isGpsAutoRecoveryBlocked = false;
  clearGpsStartTimeout();
  gpsRetryEl.hidden = true;
  lastReading = reading;
  renderReading(reading);
  refreshSelectedPlaceDistance();
  void refreshRouteButtonState();
  weatherRefreshEl.disabled = false;

  if (!hasLoadedInitialWeather) {
    void updateWeather(reading);
  }

  setStatus(null);
}

function handleGpsError(message: string) {
  clearGpsStartTimeout();
  gpsStartAttemptAt = 0;
  isGpsActive = false;
  isGpsAutoRecoveryBlocked = isGpsAutoRecoveryBlocked || message === "Permission GPS refusée.";
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
    return "Permission GPS refusée.";
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

async function renderShoreDistance() {
  const reading = lastUsableReading ?? lastReading;

  if (!reading) {
    shoreDistanceValueEl.textContent = "--";
    shoreDistanceUnitEl.textContent = "GPS requis";
    return;
  }

  shoreDistanceValueEl.textContent = "--";
  shoreDistanceUnitEl.textContent = "Calcul...";

  try {
    const coordinates = await getShorelineCoordinates();
    const distanceMeters = getNearestShoreDistanceMeters(reading, coordinates);
    const formattedDistance = formatShoreDistance(distanceMeters);

    shoreDistanceValueEl.textContent = formattedDistance.value;
    shoreDistanceUnitEl.textContent = formattedDistance.unit;
  } catch {
    shoreDistanceValueEl.textContent = "--";
    shoreDistanceUnitEl.textContent = "Indisponible";
  }
}

async function searchPlaces() {
  const query = placeSearchInputEl.value.trim();

  if (!query || isPlaceSearchLoading) {
    return;
  }

  isPlaceSearchLoading = true;
  placeSearchResultsState = [];
  selectedPlaceCardEl.hidden = true;
  selectedPlaceState = null;
  clearSelectedRoute();
  placeSearchResultsEl.hidden = true;
  placeSearchResultsEl.replaceChildren();
  placeSearchStatusEl.hidden = false;
  placeSearchStatusEl.textContent = "Recherche en cours...";

  try {
    const shoreline = await getShorelineCoordinates();
    const results = await fetchOsmPlaces(query);
    const places = normalizePlaces(results, shoreline).slice(0, 8);
    placeSearchResultsState = places;
    renderPlaceSearchResults();
  } catch {
    placeSearchStatusEl.hidden = false;
    placeSearchStatusEl.textContent = "Recherche indisponible.";
  } finally {
    isPlaceSearchLoading = false;
  }
}

async function fetchOsmPlaces(query: string): Promise<NominatimResult[]> {
  const params = new URLSearchParams({
    format: "jsonv2",
    q: query,
    limit: "12",
    addressdetails: "1",
    namedetails: "1",
    viewbox: LEMAN_SEARCH_VIEWBOX,
    bounded: "1"
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`);

  if (!response.ok) {
    throw new Error("Place search failed");
  }

  return (await response.json()) as NominatimResult[];
}

function normalizePlaces(results: NominatimResult[], shoreline: Coordinate[]): Place[] {
  return results.flatMap((result) => {
    const place = normalizePlace(result, shoreline);
    return place ? [place] : [];
  });
}

function normalizePlace(result: NominatimResult, shoreline: Coordinate[]): Place | null {
  const osmType = normalizeOsmType(result.osm_type);
  const latitude = parseCoordinate(result.lat);
  const longitude = parseCoordinate(result.lon);

  if (!osmType || typeof result.osm_id !== "number" || latitude === null || longitude === null) {
    return null;
  }

  const coordinates: Coordinate = [longitude, latitude];
  const distanceFromShoreMeters = getNearestDistanceToShoreMeters(coordinates, shoreline);

  if (distanceFromShoreMeters > SHORE_SEARCH_MARGIN_METERS) {
    return null;
  }

  return {
    id: `${osmType}/${result.osm_id}`,
    source: "osm",
    osmType,
    osmId: result.osm_id,
    name: getPlaceName(result),
    category: result.type ?? result.class ?? null,
    displayName: result.display_name ?? "",
    coordinates,
    distanceFromUserMeters: getDistanceFromUserMeters(coordinates),
    distanceFromShoreMeters,
    enrichment: null
  };
}

function normalizeOsmType(value: unknown): Place["osmType"] | null {
  if (value === "node" || value === "way" || value === "relation") {
    return value;
  }

  return null;
}

function parseCoordinate(value: unknown): number | null {
  if (typeof value !== "string") {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getPlaceName(result: NominatimResult): string {
  return result.namedetails?.name ?? result.name ?? result.display_name?.split(",")[0] ?? "Lieu";
}

function getDistanceFromUserMeters(coordinates: Coordinate): number | null {
  const reading = lastUsableReading ?? lastReading;

  if (!reading) {
    return null;
  }

  return haversineDistanceMeters(
    {
      latitude: reading.latitude,
      longitude: reading.longitude,
      accuracy: reading.accuracy,
      timestamp: reading.timestamp,
      speedMetersPerSecond: reading.speedMetersPerSecond
    },
    {
      latitude: coordinates[1],
      longitude: coordinates[0],
      accuracy: 0,
      timestamp: reading.timestamp,
      speedMetersPerSecond: null
    }
  );
}

function renderPlaceSearchResults() {
  placeSearchResultsEl.replaceChildren();

  if (placeSearchResultsState.length === 0) {
    placeSearchResultsEl.hidden = true;
    placeSearchStatusEl.hidden = false;
    placeSearchStatusEl.textContent = "Aucun lieu trouvé à moins de 2 km du Léman.";
    return;
  }

  placeSearchStatusEl.hidden = true;
  placeSearchResultsEl.hidden = false;

  for (const place of placeSearchResultsState) {
    const button = document.createElement("button");
    button.className = "place-search-result";
    button.type = "button";
    button.innerHTML = `
      <strong>${escapeHtml(place.name)}</strong>
      <span>${escapeHtml(formatPlaceSearchResultMeta(place))}</span>
    `;
    button.addEventListener("click", () => {
      selectPlace(place);
    });
    placeSearchResultsEl.append(button);
  }
}

function selectPlace(place: Place) {
  renderSelectedPlace(place);
  clearSelectedRoute();
  setPlaceSearchPanelOpen(false);
  disableMapTrackingForPlaceSelection();
  map.easeTo({
    center: place.coordinates,
    zoom: Math.max(map.getZoom(), 14),
    bearing: 0,
    duration: 700
  });
}

function disableMapTrackingForPlaceSelection() {
  isCameraLockedForPlaceOrRoute = true;

  if (isFollowGpsEnabled) {
    setFollowGps(false);
  }

  if (isHeadingMapEnabled) {
    setHeadingMapEnabled(false);
  }

  isUserInteractingWithMap = true;
}

function unlockCameraForGpsAction() {
  isCameraLockedForPlaceOrRoute = false;
  isUserInteractingWithMap = false;
}

function renderSelectedPlace(place: Place) {
  selectedPlaceState = {
    ...place,
    distanceFromUserMeters: getDistanceFromUserMeters(place.coordinates)
  };
  selectedRouteDistanceMeters = null;
  selectedPlaceCardEl.hidden = false;
  selectedPlaceNameEl.textContent = selectedPlaceState.name;
  selectedPlaceMetaEl.textContent = formatPlaceResultMeta(selectedPlaceState);
  renderSelectedRouteDistance();
  void refreshRouteButtonState();
}

function refreshSelectedPlaceDistance() {
  if (!selectedPlaceState || selectedPlaceCardEl.hidden) {
    return;
  }

  selectedPlaceState = {
    ...selectedPlaceState,
    distanceFromUserMeters: getDistanceFromUserMeters(selectedPlaceState.coordinates)
  };
}

async function refreshRouteButtonState() {
  if (!selectedPlaceState || selectedPlaceCardEl.hidden) {
    selectedPlaceRouteEl.disabled = true;
    selectedPlaceRouteEl.title = "";
    return;
  }

  const reading = lastUsableReading ?? lastReading;

  if (!reading) {
    selectedPlaceRouteEl.disabled = true;
    selectedPlaceRouteEl.title = "GPS requis";
    return;
  }

  try {
    const lakeGeometry = await getLakeGeometry();
    const isOnLake = isPointInPolygon([reading.longitude, reading.latitude], lakeGeometry.polygon);
    selectedPlaceRouteEl.disabled = !isOnLake;
    selectedPlaceRouteEl.title = isOnLake ? "" : "Itinéraire disponible uniquement depuis le lac";
  } catch {
    selectedPlaceRouteEl.disabled = true;
    selectedPlaceRouteEl.title = "Itinéraire indisponible";
  }
}

async function renderRouteToSelectedPlace() {
  const place = selectedPlaceState;
  const reading = lastUsableReading ?? lastReading;

  if (!place || !reading || selectedPlaceRouteEl.disabled) {
    return;
  }

  disableMapTrackingForPlaceSelection();
  setRouteButtonCalculating(true);
  await waitForNextPaint();

  try {
    const lakeGeometry = await getLakeGeometry();
    const routeGeometry = await getRouteGeometry();
    const start: Coordinate = [reading.longitude, reading.latitude];

    if (!isPointInPolygon(start, lakeGeometry.polygon)) {
      clearSelectedRoute();
      setStatus("Itinéraire disponible uniquement depuis le lac.");
      return;
    }

    const destination = getRouteDestinationOnLake(place.coordinates, lakeGeometry);
    const route = createLakeRoute(start, destination, lakeGeometry, routeGeometry);

    if (!route) {
      clearSelectedRoute();
      setStatus("Itinéraire indisponible.");
      return;
    }

    setSelectedRoute(route);
    selectedRouteDistanceMeters = route.distanceMeters;
    renderSelectedRouteDistance();
    setStatus(null);
  } catch {
    clearSelectedRoute();
    setStatus("Itinéraire indisponible.");
  } finally {
    setRouteButtonCalculating(false);
    void refreshRouteButtonState();
  }
}

function renderSelectedRouteDistance() {
  if (selectedRouteDistanceMeters === null) {
    selectedPlaceDistanceEl.hidden = true;
    selectedPlaceDistanceEl.textContent = "";
    return;
  }

  selectedPlaceDistanceEl.hidden = false;
  selectedPlaceDistanceEl.textContent = `Trajet : ${formatDistance(selectedRouteDistanceMeters)}`;
}

function setRouteButtonCalculating(isCalculating: boolean) {
  selectedPlaceRouteEl.disabled = isCalculating;
  selectedPlaceRouteEl.classList.toggle("is-loading", isCalculating);
  selectedPlaceRouteEl.setAttribute("aria-busy", isCalculating ? "true" : "false");

  const label = selectedPlaceRouteEl.querySelector("span");

  if (label) {
    label.textContent = isCalculating ? "Calcul..." : "Itinéraire";
  }
}

function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

function setSelectedRoute(route: RouteResult) {
  const source = map.getSource("selected-route") as GeoJSONSource | undefined;
  source?.setData(createRouteGeoJson(route.coordinates));
  fitMapToRoute(route.coordinates);
}

function clearSelectedRoute() {
  selectedRouteDistanceMeters = null;
  renderSelectedRouteDistance();
  const source = map.getSource("selected-route") as GeoJSONSource | undefined;
  source?.setData(createRouteGeoJson(null));
}

function createRouteGeoJson(coordinates: Coordinate[] | null) {
  return {
    type: "FeatureCollection" as const,
    features: coordinates
      ? [
          {
            type: "Feature" as const,
            properties: {},
            geometry: {
              type: "LineString" as const,
              coordinates
            }
          }
        ]
      : []
  };
}

function fitMapToRoute(coordinates: Coordinate[]) {
  if (coordinates.length < 2) {
    return;
  }

  const bounds = coordinates.reduce(
    (currentBounds, coordinate) => currentBounds.extend(coordinate),
    new maplibregl.LngLatBounds(coordinates[0], coordinates[0])
  );

  map.fitBounds(bounds, {
    duration: 750,
    maxZoom: 14,
    padding: {
      top: 90,
      right: 72,
      bottom: 170,
      left: 32
    }
  });
}

function formatPlaceResultMeta(place: Place): string {
  return place.category ? formatCategory(place.category) : "Lieu";
}

function formatPlaceSearchResultMeta(place: Place): string {
  const category = formatPlaceResultMeta(place);

  if (place.distanceFromUserMeters === null) {
    return category;
  }

  return `${category} · ${formatDistance(place.distanceFromUserMeters)}`;
}

function formatCategory(value: string): string {
  return value.replaceAll("_", " ");
}

function formatDistance(distanceMeters: number): string {
  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} m`;
  }

  return `${formatDecimal(distanceMeters / 1000)} km`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function getShorelineCoordinates(): Promise<Coordinate[]> {
  if (!shorelineCoordinatesPromise) {
    shorelineCoordinatesPromise = fetch("/data/leman-shoreline.geojson")
      .then((response) => {
        if (!response.ok) {
          throw new Error("Shoreline unavailable");
        }

        return response.json() as Promise<ShorelineGeoJson>;
      })
      .then(extractShorelineCoordinates);
  }

  return shorelineCoordinatesPromise;
}

async function getLakeGeometry(): Promise<LakeGeometry> {
  if (!lakeGeometryPromise) {
    lakeGeometryPromise = getShorelineCoordinates().then((shoreline) => ({
      shoreline,
      polygon: closePolygon(shoreline)
    }));
  }

  return lakeGeometryPromise;
}

async function getRouteGeometry(): Promise<RouteGeometry> {
  if (!routeGeometryPromise) {
    routeGeometryPromise = fetch("/data/leman-300m-indicative.geojson")
      .then((response) => {
        if (!response.ok) {
          throw new Error("Route boundary unavailable");
        }

        return response.json() as Promise<ShorelineGeoJson>;
      })
      .then((data) => {
        const boundary = extractShorelineCoordinates(data);

        return {
          boundary,
          polygon: closePolygon(boundary)
        };
      });
  }

  return routeGeometryPromise;
}

function extractShorelineCoordinates(data: ShorelineGeoJson): Coordinate[] {
  const coordinates: Coordinate[] = [];

  for (const feature of data.features) {
    const geometry = feature.geometry;

    if (geometry?.type === "LineString" && Array.isArray(geometry.coordinates)) {
      coordinates.push(...parseLineStringCoordinates(geometry.coordinates));
    }
  }

  if (coordinates.length < 2) {
    throw new Error("Invalid shoreline");
  }

  return coordinates;
}

function parseLineStringCoordinates(coordinates: unknown[]): Coordinate[] {
  return coordinates.flatMap((coordinate) => {
    if (!Array.isArray(coordinate) || coordinate.length < 2) {
      return [];
    }

    const longitude = coordinate[0];
    const latitude = coordinate[1];

    if (typeof longitude !== "number" || typeof latitude !== "number") {
      return [];
    }

    return [[longitude, latitude] satisfies Coordinate];
  });
}

function closePolygon(coordinates: Coordinate[]): Coordinate[] {
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];

  if (!first || !last) {
    throw new Error("Invalid lake polygon");
  }

  if (first[0] === last[0] && first[1] === last[1]) {
    return coordinates;
  }

  return [...coordinates, first];
}

function getRouteDestinationOnLake(destination: Coordinate, lakeGeometry: LakeGeometry): Coordinate {
  if (isPointInPolygon(destination, lakeGeometry.polygon)) {
    return destination;
  }

  const shorePoint = getNearestPointOnShoreline(destination, lakeGeometry.shoreline);
  return insetPointIntoLake(shorePoint, lakeGeometry.polygon);
}

function getRouteGatePoint(point: Coordinate, lakeGeometry: LakeGeometry, routeGeometry: RouteGeometry): Coordinate {
  return getNearestDistanceToShoreMeters(point, lakeGeometry.shoreline) >= ROUTE_SHORE_LIMIT_METERS
    ? point
    : getNearestPointOnShoreline(point, routeGeometry.boundary);
}

function createLakeRoute(
  start: Coordinate,
  destination: Coordinate,
  lakeGeometry: LakeGeometry,
  routeGeometry: RouteGeometry
): RouteResult | null {
  const routeStart = getRouteGatePoint(start, lakeGeometry, routeGeometry);
  const arrivalGate = getRouteGatePoint(destination, lakeGeometry, routeGeometry);
  const middleRoute = createVisibilityRoute(routeStart, arrivalGate, routeGeometry);

  if (!middleRoute) {
    return null;
  }

  const coordinates = dedupeSequentialCoordinates([start, ...middleRoute, destination]);

  return {
    coordinates,
    distanceMeters: getRouteDistanceMeters(coordinates)
  };
}

function createVisibilityRoute(
  start: Coordinate,
  arrivalGate: Coordinate,
  routeGeometry: RouteGeometry
): Coordinate[] | null {
  if (routeSegmentStaysInPolygon(start, arrivalGate, routeGeometry.polygon)) {
    return [start, arrivalGate];
  }

  return createGridRoute(start, arrivalGate, routeGeometry);
}

function createGridRoute(
  start: Coordinate,
  arrivalGate: Coordinate,
  routeGeometry: RouteGeometry
): Coordinate[] | null {
  const grid = createRouteGrid(routeGeometry.polygon, start, arrivalGate);
  const rawPath = findShortestGridPath(grid.nodes, grid.gridIndex, start, arrivalGate, routeGeometry.polygon);

  return rawPath ? smoothRoutePath(rawPath, routeGeometry.polygon) : null;
}

function createRouteGrid(
  polygon: Coordinate[],
  start: Coordinate,
  arrivalGate: Coordinate
): { nodes: RouteGridNode[]; gridIndex: globalThis.Map<string, number> } {
  const bounds = getCoordinateBounds([...polygon, start, arrivalGate]);
  const centerLatitude = (bounds.minLatitude + bounds.maxLatitude) / 2;
  const latitudeStep = ROUTE_GRID_CELL_METERS / 111320;
  const longitudeStep = ROUTE_GRID_CELL_METERS / (Math.cos(degreesToRadians(centerLatitude)) * 111320);
  const nodes: RouteGridNode[] = [
    { coordinate: start, gridX: -1, gridY: -1, isSpecial: true },
    { coordinate: arrivalGate, gridX: -2, gridY: -2, isSpecial: true }
  ];
  const gridIndex = new globalThis.Map<string, number>();

  const minLongitude = bounds.minLongitude - longitudeStep;
  const maxLongitude = bounds.maxLongitude + longitudeStep;
  const minLatitude = bounds.minLatitude - latitudeStep;
  const maxLatitude = bounds.maxLatitude + latitudeStep;
  let gridY = 0;

  for (let latitude = minLatitude; latitude <= maxLatitude; latitude += latitudeStep, gridY += 1) {
    let gridX = 0;

    for (let longitude = minLongitude; longitude <= maxLongitude; longitude += longitudeStep, gridX += 1) {
      const coordinate: Coordinate = [longitude, latitude];

      if (!isPointInPolygon(coordinate, polygon)) {
        continue;
      }

      const index = nodes.length;
      nodes.push({ coordinate, gridX, gridY, isSpecial: false });
      gridIndex.set(getRouteGridKey(gridX, gridY), index);
    }
  }

  return { nodes, gridIndex };
}

function findShortestGridPath(
  nodes: RouteGridNode[],
  gridIndex: globalThis.Map<string, number>,
  start: Coordinate,
  arrivalGate: Coordinate,
  polygon: Coordinate[]
): Coordinate[] | null {
  const startIndex = 0;
  const destinationIndex = 1;
  const costs = nodes.map(() => Number.POSITIVE_INFINITY);
  const previous = nodes.map(() => -1);
  const closed = nodes.map(() => false);
  const queue = new RoutePriorityQueue();
  costs[startIndex] = 0;
  queue.push({ index: startIndex, priority: coordinateDistanceMeters(start, arrivalGate) });

  while (queue.size > 0) {
    const current = queue.pop();

    if (!current) {
      break;
    }

    const currentIndex = current.index;

    if (closed[currentIndex]) {
      continue;
    }

    if (currentIndex === destinationIndex) {
      break;
    }

    closed[currentIndex] = true;

    for (const nextIndex of getRouteGridNeighbors(currentIndex, nodes, gridIndex, polygon)) {
      if (closed[nextIndex]) {
        continue;
      }

      const nextCost = costs[currentIndex] + coordinateDistanceMeters(nodes[currentIndex].coordinate, nodes[nextIndex].coordinate);

      if (nextCost < costs[nextIndex]) {
        costs[nextIndex] = nextCost;
        previous[nextIndex] = currentIndex;
        queue.push({
          index: nextIndex,
          priority: nextCost + coordinateDistanceMeters(nodes[nextIndex].coordinate, arrivalGate)
        });
      }
    }
  }

  if (!Number.isFinite(costs[destinationIndex])) {
    return null;
  }

  const path: Coordinate[] = [];

  for (let index = destinationIndex; index !== -1; index = previous[index]) {
    path.unshift(nodes[index].coordinate);
  }

  return path[0] && coordinatesAlmostEqual(path[0], nodes[startIndex].coordinate) ? path : null;
}

function getRouteGridNeighbors(
  nodeIndex: number,
  nodes: RouteGridNode[],
  gridIndex: globalThis.Map<string, number>,
  polygon: Coordinate[]
): number[] {
  const node = nodes[nodeIndex];

  if (node.isSpecial) {
    return getVisibleSpecialLinks(nodeIndex, nodes, polygon);
  }

  const neighbors: number[] = [];

  for (let deltaY = -1; deltaY <= 1; deltaY += 1) {
    for (let deltaX = -1; deltaX <= 1; deltaX += 1) {
      if (deltaX === 0 && deltaY === 0) {
        continue;
      }

      const neighborIndex = gridIndex.get(getRouteGridKey(node.gridX + deltaX, node.gridY + deltaY));

      if (neighborIndex === undefined) {
        continue;
      }

      if (shortGridSegmentStaysInPolygon(node.coordinate, nodes[neighborIndex].coordinate, polygon)) {
        neighbors.push(neighborIndex);
      }
    }
  }

  for (const specialIndex of [0, 1]) {
    if (
      specialIndex !== nodeIndex &&
      coordinateDistanceMeters(node.coordinate, nodes[specialIndex].coordinate) <= ROUTE_GRID_SPECIAL_LINK_RADIUS_METERS &&
      routeSegmentStaysInPolygon(node.coordinate, nodes[specialIndex].coordinate, polygon)
    ) {
      neighbors.push(specialIndex);
    }
  }

  return neighbors;
}

function getVisibleSpecialLinks(
  nodeIndex: number,
  nodes: RouteGridNode[],
  polygon: Coordinate[]
): number[] {
  const node = nodes[nodeIndex];
  const links = nodes
    .map((candidate, index) => ({
      index,
      distanceMeters: coordinateDistanceMeters(node.coordinate, candidate.coordinate)
    }))
    .filter(({ index, distanceMeters }) => {
      if (index === nodeIndex || distanceMeters > ROUTE_GRID_SPECIAL_LINK_RADIUS_METERS) {
        return false;
      }

      return routeSegmentStaysInPolygon(node.coordinate, nodes[index].coordinate, polygon);
    })
    .sort((left, right) => left.distanceMeters - right.distanceMeters)
    .slice(0, ROUTE_GRID_SPECIAL_LINKS)
    .map(({ index }) => index);

  return links;
}

function smoothRoutePath(path: Coordinate[], polygon: Coordinate[]): Coordinate[] {
  if (path.length <= 2) {
    return path;
  }

  const smoothed: Coordinate[] = [path[0]];
  let anchorIndex = 0;

  while (anchorIndex < path.length - 1) {
    let nextIndex = path.length - 1;

    while (nextIndex > anchorIndex + 1 && !routeSegmentStaysInPolygon(path[anchorIndex], path[nextIndex], polygon)) {
      nextIndex -= 1;
    }

    smoothed.push(path[nextIndex]);
    anchorIndex = nextIndex;
  }

  return smoothed;
}

function shortGridSegmentStaysInPolygon(start: Coordinate, end: Coordinate, polygon: Coordinate[]): boolean {
  const midpoint: Coordinate = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
  return isPointInPolygon(midpoint, polygon);
}

function getCoordinateBounds(coordinates: Coordinate[]) {
  return coordinates.reduce(
    (bounds, coordinate) => ({
      minLongitude: Math.min(bounds.minLongitude, coordinate[0]),
      maxLongitude: Math.max(bounds.maxLongitude, coordinate[0]),
      minLatitude: Math.min(bounds.minLatitude, coordinate[1]),
      maxLatitude: Math.max(bounds.maxLatitude, coordinate[1])
    }),
    {
      minLongitude: Number.POSITIVE_INFINITY,
      maxLongitude: Number.NEGATIVE_INFINITY,
      minLatitude: Number.POSITIVE_INFINITY,
      maxLatitude: Number.NEGATIVE_INFINITY
    }
  );
}

function getRouteGridKey(gridX: number, gridY: number): string {
  return `${gridX}:${gridY}`;
}

class RoutePriorityQueue {
  private items: RouteQueueItem[] = [];

  get size() {
    return this.items.length;
  }

  push(item: RouteQueueItem) {
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  }

  pop(): RouteQueueItem | null {
    const first = this.items[0];

    if (!first) {
      return null;
    }

    const last = this.items.pop();

    if (last && this.items.length > 0) {
      this.items[0] = last;
      this.sinkDown(0);
    }

    return first;
  }

  private bubbleUp(index: number) {
    let currentIndex = index;

    while (currentIndex > 0) {
      const parentIndex = Math.floor((currentIndex - 1) / 2);

      if (this.items[parentIndex].priority <= this.items[currentIndex].priority) {
        break;
      }

      this.swap(parentIndex, currentIndex);
      currentIndex = parentIndex;
    }
  }

  private sinkDown(index: number) {
    let currentIndex = index;

    while (true) {
      const leftIndex = currentIndex * 2 + 1;
      const rightIndex = currentIndex * 2 + 2;
      let smallestIndex = currentIndex;

      if (this.items[leftIndex] && this.items[leftIndex].priority < this.items[smallestIndex].priority) {
        smallestIndex = leftIndex;
      }

      if (this.items[rightIndex] && this.items[rightIndex].priority < this.items[smallestIndex].priority) {
        smallestIndex = rightIndex;
      }

      if (smallestIndex === currentIndex) {
        break;
      }

      this.swap(currentIndex, smallestIndex);
      currentIndex = smallestIndex;
    }
  }

  private swap(leftIndex: number, rightIndex: number) {
    const left = this.items[leftIndex];
    this.items[leftIndex] = this.items[rightIndex];
    this.items[rightIndex] = left;
  }
}

function getRouteDistanceMeters(coordinates: Coordinate[]): number {
  let distanceMeters = 0;

  for (let index = 0; index < coordinates.length - 1; index += 1) {
    distanceMeters += coordinateDistanceMeters(coordinates[index], coordinates[index + 1]);
  }

  return distanceMeters;
}

function dedupeSequentialCoordinates(coordinates: Coordinate[]): Coordinate[] {
  return coordinates.filter((coordinate, index) => {
    const previous = coordinates[index - 1];

    if (!previous) {
      return true;
    }

    return coordinateDistanceMeters(previous, coordinate) > 1;
  });
}

function routeSegmentStaysInPolygon(start: Coordinate, end: Coordinate, polygon: Coordinate[]): boolean {
  const midpoint: Coordinate = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];

  if (!isPointInPolygon(midpoint, polygon)) {
    return false;
  }

  for (let index = 0; index < polygon.length - 1; index += 1) {
    const edgeStart = polygon[index];
    const edgeEnd = polygon[index + 1];

    if (
      segmentsProperlyIntersect(start, end, edgeStart, edgeEnd) &&
      !isAllowedRouteBoundaryTouch(start, end, edgeStart, edgeEnd)
    ) {
      return false;
    }
  }

  return true;
}

function segmentsProperlyIntersect(a: Coordinate, b: Coordinate, c: Coordinate, d: Coordinate): boolean {
  if (!segmentBoundingBoxesOverlap(a, b, c, d)) {
    return false;
  }

  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);

  if (abC === 0 && isPointOnSegment(c, a, b)) {
    return true;
  }

  if (abD === 0 && isPointOnSegment(d, a, b)) {
    return true;
  }

  if (cdA === 0 && isPointOnSegment(a, c, d)) {
    return true;
  }

  if (cdB === 0 && isPointOnSegment(b, c, d)) {
    return true;
  }

  return abC !== abD && cdA !== cdB;
}

function segmentBoundingBoxesOverlap(a: Coordinate, b: Coordinate, c: Coordinate, d: Coordinate): boolean {
  return (
    Math.max(a[0], b[0]) >= Math.min(c[0], d[0]) &&
    Math.max(c[0], d[0]) >= Math.min(a[0], b[0]) &&
    Math.max(a[1], b[1]) >= Math.min(c[1], d[1]) &&
    Math.max(c[1], d[1]) >= Math.min(a[1], b[1])
  );
}

function orientation(a: Coordinate, b: Coordinate, c: Coordinate): -1 | 0 | 1 {
  const value = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

  if (Math.abs(value) < 1e-12) {
    return 0;
  }

  return value > 0 ? 1 : -1;
}

function isPointOnSegment(point: Coordinate, start: Coordinate, end: Coordinate): boolean {
  return (
    point[0] >= Math.min(start[0], end[0]) - 1e-12 &&
    point[0] <= Math.max(start[0], end[0]) + 1e-12 &&
    point[1] >= Math.min(start[1], end[1]) - 1e-12 &&
    point[1] <= Math.max(start[1], end[1]) + 1e-12
  );
}

function isAllowedRouteBoundaryTouch(a: Coordinate, b: Coordinate, c: Coordinate, d: Coordinate): boolean {
  return (
    coordinatesAlmostEqual(a, c) ||
    coordinatesAlmostEqual(a, d) ||
    coordinatesAlmostEqual(b, c) ||
    coordinatesAlmostEqual(b, d) ||
    isPointOnSegment(a, c, d) ||
    isPointOnSegment(b, c, d)
  );
}

function coordinatesAlmostEqual(left: Coordinate, right: Coordinate): boolean {
  return Math.abs(left[0] - right[0]) < 1e-9 && Math.abs(left[1] - right[1]) < 1e-9;
}

function isPointInPolygon(point: Coordinate, polygon: Coordinate[]): boolean {
  if (isPointOnPolygonBoundary(point, polygon)) {
    return true;
  }

  const [longitude, latitude] = point;
  let isInside = false;

  for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; previousIndex = index, index += 1) {
    const [currentLongitude, currentLatitude] = polygon[index];
    const [previousLongitude, previousLatitude] = polygon[previousIndex];
    const intersects =
      currentLatitude > latitude !== previousLatitude > latitude &&
      longitude <
        ((previousLongitude - currentLongitude) * (latitude - currentLatitude)) /
          (previousLatitude - currentLatitude) +
          currentLongitude;

    if (intersects) {
      isInside = !isInside;
    }
  }

  return isInside;
}

function isPointOnPolygonBoundary(point: Coordinate, polygon: Coordinate[]): boolean {
  for (let index = 0; index < polygon.length - 1; index += 1) {
    if (getDistanceToSegmentMeters(point, polygon[index], polygon[index + 1]) <= 5) {
      return true;
    }
  }

  return false;
}

function getNearestPointOnShoreline(point: Coordinate, shoreline: Coordinate[]): Coordinate {
  return getNearestPointOnPolyline(point, shoreline).coordinate;
}

function getNearestPointOnPolyline(point: Coordinate, coordinates: Coordinate[]): NearestBoundaryPoint {
  let nearestPoint: Coordinate | null = null;
  let nearestSegmentIndex = 0;
  let nearestDistanceMeters = Number.POSITIVE_INFINITY;

  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const candidate = getClosestPointOnSegment(point, coordinates[index], coordinates[index + 1]);
    const distanceMeters = coordinateDistanceMeters(point, candidate);

    if (distanceMeters < nearestDistanceMeters) {
      nearestDistanceMeters = distanceMeters;
      nearestPoint = candidate;
      nearestSegmentIndex = index;
    }
  }

  if (!nearestPoint) {
    throw new Error("Invalid polyline nearest point");
  }

  return {
    coordinate: nearestPoint,
    segmentIndex: nearestSegmentIndex
  };
}

function getClosestPointOnSegment(point: Coordinate, start: Coordinate, end: Coordinate): Coordinate {
  const latitudeRad = degreesToRadians(point[1]);
  const metersPerDegreeLatitude = 111320;
  const metersPerDegreeLongitude = Math.cos(latitudeRad) * metersPerDegreeLatitude;
  const startX = (start[0] - point[0]) * metersPerDegreeLongitude;
  const startY = (start[1] - point[1]) * metersPerDegreeLatitude;
  const endX = (end[0] - point[0]) * metersPerDegreeLongitude;
  const endY = (end[1] - point[1]) * metersPerDegreeLatitude;
  const segmentX = endX - startX;
  const segmentY = endY - startY;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;

  if (segmentLengthSquared === 0) {
    return start;
  }

  const projection = Math.max(0, Math.min(1, -(startX * segmentX + startY * segmentY) / segmentLengthSquared));

  return [
    start[0] + (end[0] - start[0]) * projection,
    start[1] + (end[1] - start[1]) * projection
  ];
}

function insetPointIntoLake(point: Coordinate, polygon: Coordinate[]): Coordinate {
  const center = getPolygonCenter(polygon);
  let inset = movePointToward(point, center, ROUTE_DESTINATION_INSET_METERS);

  for (let attempt = 0; attempt < 6 && !isPointInPolygon(inset, polygon); attempt += 1) {
    inset = movePointToward(inset, center, ROUTE_DESTINATION_INSET_METERS);
  }

  return inset;
}

function getPolygonCenter(polygon: Coordinate[]): Coordinate {
  const totals = polygon.reduce(
    (accumulator, coordinate) => {
      accumulator.longitude += coordinate[0];
      accumulator.latitude += coordinate[1];
      return accumulator;
    },
    { longitude: 0, latitude: 0 }
  );

  return [totals.longitude / polygon.length, totals.latitude / polygon.length];
}

function movePointToward(from: Coordinate, to: Coordinate, meters: number): Coordinate {
  const distanceMeters = coordinateDistanceMeters(from, to);

  if (distanceMeters === 0) {
    return from;
  }

  const ratio = Math.min(1, meters / distanceMeters);

  return [
    from[0] + (to[0] - from[0]) * ratio,
    from[1] + (to[1] - from[1]) * ratio
  ];
}

function getNearestShoreDistanceMeters(reading: GpsReading, shoreline: Coordinate[]): number {
  return getNearestDistanceToShoreMeters([reading.longitude, reading.latitude], shoreline);
}

function getNearestDistanceToShoreMeters(point: Coordinate, shoreline: Coordinate[]): number {
  let nearestDistanceMeters = Number.POSITIVE_INFINITY;

  for (let index = 0; index < shoreline.length - 1; index += 1) {
    const distanceMeters = getDistanceToSegmentMeters(
      point,
      shoreline[index],
      shoreline[index + 1]
    );

    if (distanceMeters < nearestDistanceMeters) {
      nearestDistanceMeters = distanceMeters;
    }
  }

  if (!Number.isFinite(nearestDistanceMeters)) {
    throw new Error("Invalid shoreline distance");
  }

  return nearestDistanceMeters;
}

function getDistanceToSegmentMeters(point: Coordinate, start: Coordinate, end: Coordinate): number {
  const latitudeRad = degreesToRadians(point[1]);
  const metersPerDegreeLatitude = 111320;
  const metersPerDegreeLongitude = Math.cos(latitudeRad) * metersPerDegreeLatitude;
  const pointX = 0;
  const pointY = 0;
  const startX = (start[0] - point[0]) * metersPerDegreeLongitude;
  const startY = (start[1] - point[1]) * metersPerDegreeLatitude;
  const endX = (end[0] - point[0]) * metersPerDegreeLongitude;
  const endY = (end[1] - point[1]) * metersPerDegreeLatitude;
  const segmentX = endX - startX;
  const segmentY = endY - startY;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;

  if (segmentLengthSquared === 0) {
    return Math.hypot(startX - pointX, startY - pointY);
  }

  const projection = Math.max(
    0,
    Math.min(1, ((pointX - startX) * segmentX + (pointY - startY) * segmentY) / segmentLengthSquared)
  );
  const nearestX = startX + projection * segmentX;
  const nearestY = startY + projection * segmentY;

  return Math.hypot(nearestX - pointX, nearestY - pointY);
}

function formatShoreDistance(distanceMeters: number): { value: string; unit: string } {
  if (distanceMeters < 1000) {
    return {
      value: Math.round(distanceMeters).toString(),
      unit: "m du bord"
    };
  }

  return {
    value: formatDecimal(distanceMeters / 1000),
    unit: "km du bord"
  };
}

async function updateWeather(reading: GpsReading) {
  if (isWeatherLoading) {
    return;
  }

  isWeatherLoading = true;
  weatherRefreshEl.disabled = true;
  setWeatherStatus("Météo en cours...");

  try {
    weatherForecast = await fetchWeatherForPosition(reading);
    hasLoadedInitialWeather = true;
    renderWeather();
  } catch {
    weatherForecast = null;
    setWeatherStatus("Météo indisponible");
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
  weatherUpdatedAtEl.textContent = `Màj ${formatTime(weatherForecast.updatedAt)} · ${snapshot.label}`;
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

function setActiveView(view: "map" | "weather" | "settings") {
  const isWeatherView = view === "weather";
  const isSettingsView = view === "settings";
  const isMapView = view === "map";

  weatherViewEl.hidden = !isWeatherView;
  settingsViewEl.hidden = !isSettingsView;
  mapTabEl.classList.toggle("is-active", isMapView);
  weatherTabEl.classList.toggle("is-active", isWeatherView);
  settingsTabEl.classList.toggle("is-active", isSettingsView);

  if (isMapView) {
    mapTabEl.setAttribute("aria-current", "page");
  } else {
    mapTabEl.removeAttribute("aria-current");
  }

  if (isWeatherView) {
    weatherTabEl.setAttribute("aria-current", "page");
  } else {
    weatherTabEl.removeAttribute("aria-current");
  }

  if (isSettingsView) {
    settingsTabEl.setAttribute("aria-current", "page");
  } else {
    settingsTabEl.removeAttribute("aria-current");
  }

  if (isMapView) {
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

function coordinateDistanceMeters(from: Coordinate, to: Coordinate): number {
  return haversineDistanceMeters(
    {
      latitude: from[1],
      longitude: from[0],
      accuracy: 0,
      timestamp: 0,
      speedMetersPerSecond: null
    },
    {
      latitude: to[1],
      longitude: to[0],
      accuracy: 0,
      timestamp: 0,
      speedMetersPerSecond: null
    }
  );
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

function formatDecimal(value: number): string {
  return value < 10 ? value.toFixed(1) : Math.round(value).toString();
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("fr-CH", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
