import type { GeoJSONSource, MapMouseEvent } from "maplibre-gl";
import type maplibregl from "maplibre-gl";

type Position = [number, number];

type ShorelineFeatureCollection = {
  type: "FeatureCollection";
  features: Array<
    | {
        type: "Feature";
        properties: Record<string, string>;
        geometry: {
          type: "Polygon";
          coordinates: Position[][];
        };
      }
    | {
        type: "Feature";
        properties: Record<string, string>;
        geometry: {
          type: "LineString";
          coordinates: Position[];
        };
      }
    | {
        type: "Feature";
        properties: Record<string, string | number>;
        geometry: {
          type: "Point";
          coordinates: Position;
        };
      }
  >;
};

const SOURCE_ID = "dev-shoreline-draw";
const FILL_LAYER_ID = "dev-shoreline-fill";
const LINE_LAYER_ID = "dev-shoreline-line";
const POINT_LAYER_ID = "dev-shoreline-points";

export function enableShorelineDraw(map: maplibregl.Map) {
  const state = {
    enabled: false,
    points: [] as Position[]
  };

  addSourceAndLayers(map);
  const controls = createControls({
    onStart: () => {
      state.enabled = true;
      controls.root.dataset.active = "true";
      map.getCanvas().style.cursor = "crosshair";
    },
    onFinish: () => {
      state.enabled = false;
      controls.root.dataset.active = "false";
      map.getCanvas().style.cursor = "";
      updateData(map, state.points);
    },
    onClear: () => {
      state.points = [];
      updateData(map, state.points);
    },
    onExport: () => exportGeoJson(state.points)
  });

  document.body.appendChild(controls.root);

  map.on("click", (event: MapMouseEvent) => {
    if (!state.enabled) {
      return;
    }

    state.points = [...state.points, [roundCoordinate(event.lngLat.lng), roundCoordinate(event.lngLat.lat)]];
    updateData(map, state.points);
  });
}

function addSourceAndLayers(map: maplibregl.Map) {
  map.addSource(SOURCE_ID, {
    type: "geojson",
    data: createDrawData([])
  });

  map.addLayer({
    id: FILL_LAYER_ID,
    type: "fill",
    source: SOURCE_ID,
    filter: ["==", ["geometry-type"], "Polygon"],
    paint: {
      "fill-color": "#0ea5e9",
      "fill-opacity": 0.12
    }
  });

  map.addLayer({
    id: LINE_LAYER_ID,
    type: "line",
    source: SOURCE_ID,
    filter: ["in", ["geometry-type"], ["literal", ["LineString", "Polygon"]]],
    paint: {
      "line-color": "#0ea5e9",
      "line-width": 3,
      "line-opacity": 0.95
    }
  });

  map.addLayer({
    id: POINT_LAYER_ID,
    type: "circle",
    source: SOURCE_ID,
    filter: ["==", ["geometry-type"], "Point"],
    paint: {
      "circle-color": "#ffffff",
      "circle-radius": 5,
      "circle-stroke-color": "#0ea5e9",
      "circle-stroke-width": 2
    }
  });
}

function updateData(map: maplibregl.Map, points: Position[]) {
  const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
  source?.setData(createDrawData(points));
}

function createDrawData(points: Position[]): ShorelineFeatureCollection {
  const features: ShorelineFeatureCollection["features"] = [];

  if (points.length >= 3) {
    features.push({
      type: "Feature",
      properties: { kind: "polygon" },
      geometry: {
        type: "Polygon",
        coordinates: [[...points, points[0]]]
      }
    });
  } else if (points.length >= 2) {
    features.push({
      type: "Feature",
      properties: { kind: "line" },
      geometry: {
        type: "LineString",
        coordinates: points
      }
    });
  }

  points.forEach((point, index) => {
    features.push({
      type: "Feature",
      properties: { kind: "vertex", index: index + 1 },
      geometry: {
        type: "Point",
        coordinates: point
      }
    });
  });

  return {
    type: "FeatureCollection",
    features
  };
}

function createControls(actions: {
  onStart: () => void;
  onFinish: () => void;
  onClear: () => void;
  onExport: () => void;
}) {
  const root = document.createElement("section");
  root.className = "shoreline-draw";
  root.dataset.active = "false";
  root.innerHTML = `
    <div class="shoreline-draw-title">DEV Shoreline</div>
    <div class="shoreline-draw-actions">
      <button type="button" data-action="start">Dessiner</button>
      <button type="button" data-action="finish">Stop</button>
      <button type="button" data-action="clear">Reset</button>
      <button type="button" data-action="export">Export</button>
    </div>
  `;

  root.querySelector('[data-action="start"]')?.addEventListener("click", actions.onStart);
  root.querySelector('[data-action="finish"]')?.addEventListener("click", actions.onFinish);
  root.querySelector('[data-action="clear"]')?.addEventListener("click", actions.onClear);
  root.querySelector('[data-action="export"]')?.addEventListener("click", actions.onExport);

  return { root };
}

function exportGeoJson(points: Position[]) {
  if (points.length < 3) {
    window.alert("Dessine au moins 3 points pour exporter un polygone.");
    return;
  }

  const featureCollection = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          name: "Leman shoreline manual draft",
          usage: "Source polygon for future 300m indicative line generation"
        },
        geometry: {
          type: "Polygon",
          coordinates: [[...points, points[0]]]
        }
      }
    ]
  };

  const blob = new Blob([`${JSON.stringify(featureCollection, null, 2)}\n`], {
    type: "application/geo+json"
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "leman-shoreline-draft.geojson";
  link.click();
  URL.revokeObjectURL(link.href);
}

function roundCoordinate(value: number): number {
  return Math.round(value * 1000000) / 1000000;
}
