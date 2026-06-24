import fs from "node:fs";
import path from "node:path";
import { buffer, featureCollection, lineString, polygon, polygonToLine } from "@turf/turf";

const inputPath = path.resolve("public/data/leman-shoreline.geojson");
const outputPath = path.resolve("public/data/leman-300m-indicative.geojson");
const insetDistanceKilometers = 0.3;

const source = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const coordinates = extractCoordinates(source);
const closedCoordinates = closeRing(coordinates);
const lakePolygon = polygon([closedCoordinates], {
  name: "Leman shoreline manual polygon",
  source: "public/data/leman-shoreline.geojson"
});

const insetPolygon = buffer(lakePolygon, -insetDistanceKilometers, {
  units: "kilometers",
  steps: 24
});

if (!insetPolygon) {
  throw new Error("Could not generate a 300m inset polygon from the shoreline.");
}

const insetLine = polygonToLine(insetPolygon);
const outputFeatures = Array.isArray(insetLine.features) ? insetLine.features : [insetLine];

const output = featureCollection(
  outputFeatures.map((feature) => ({
    ...feature,
    properties: {
      name: "Limite indicative 300 m",
      disclaimer: "Ligne indicative non officielle. Ne constitue pas une reference legale.",
      source: "Generated from public/data/leman-shoreline.geojson",
      distance_meters: 300,
      ...feature.properties
    }
  }))
);

fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);

console.log(
  JSON.stringify(
    {
      input: path.relative(process.cwd(), inputPath),
      output: path.relative(process.cwd(), outputPath),
      source_points: coordinates.length,
      closed_points: closedCoordinates.length,
      output_features: output.features.length
    },
    null,
    2
  )
);

function extractCoordinates(geojson) {
  const feature = geojson.type === "FeatureCollection" ? geojson.features?.[0] : geojson;
  const geometry = feature?.type === "Feature" ? feature.geometry : feature;

  if (!geometry) {
    throw new Error("No geometry found in shoreline GeoJSON.");
  }

  if (geometry.type === "LineString") {
    return validateCoordinates(geometry.coordinates);
  }

  if (geometry.type === "Polygon") {
    return validateCoordinates(geometry.coordinates[0]);
  }

  throw new Error(`Unsupported shoreline geometry type: ${geometry.type}`);
}

function validateCoordinates(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 4) {
    throw new Error("Shoreline must contain at least 4 coordinates.");
  }

  return coordinates.map((coordinate) => {
    if (!Array.isArray(coordinate) || coordinate.length < 2) {
      throw new Error("Invalid coordinate in shoreline.");
    }

    return [roundCoordinate(coordinate[0]), roundCoordinate(coordinate[1])];
  });
}

function closeRing(coordinates) {
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];

  if (first[0] === last[0] && first[1] === last[1]) {
    return coordinates;
  }

  return [...coordinates, first];
}

function roundCoordinate(value) {
  return Math.round(value * 1000000) / 1000000;
}
