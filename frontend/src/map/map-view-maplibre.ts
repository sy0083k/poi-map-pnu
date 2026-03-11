import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from "maplibre-gl";

import { fetchJson } from "../http";
import type { HighlightLoadDebugInfo } from "./cadastral-fgb-layer";
import { toWgs84CoordinatePair } from "./coordinate-transform";
import { createMapViewInfoPanel } from "./map-view-info-panel";
import { haveRenderedPropertiesChanged, normalizeRenderedRecordPnu } from "./rendered-land-records";

import type { BaseType, CadastralCrs, FeatureDelta, FeatureDiffOptions, LandFeature, LandFeatureCollection, LandFeatureProperties, MapConfig, RenderedLandRecord, RenderedLandRecordMap, ThemeType } from "./types";

type MapViewElements = {
  infoPanelElement: HTMLElement;
  infoPanelContent: HTMLElement;
  infoPanelCloseButton: HTMLButtonElement | null;
};

type FeatureClickPayload = {
  index: number;
  coordinate: number[];
};

type SelectOptions = {
  shouldFit: boolean;
};

type RenderOptions = {
  dataProjection?: CadastralCrs;
};

type FeatureRecord = {
  pnu: string;
  feature: LandFeature;
  bbox: [number, number, number, number] | null;
};

type GeometryValidationStats = {
  received: number;
  accepted: number;
  dropped: number;
  dropReasons: Record<string, number>;
};

type InvalidGeometrySample = {
  featureId: number;
  reason: string;
  geometryType: string;
  coordinateSample?: unknown;
};

type MapDebugHelpers = {
  getLandsSourceData: () => GeoJSON.FeatureCollection | null;
  getSelectedSourceData: () => GeoJSON.FeatureCollection | null;
  getDebugProbeSourceData: () => GeoJSON.FeatureCollection | null;
  getDebugMarkerData: () => GeoJSON.FeatureCollection | null;
  getDebugMarkerCoordinate: () => [number, number];
  getDebugMarkerScreenPoint: () => { x: number; y: number };
  getMapCenterZoom: () => { center: [number, number]; zoom: number };
  isDebugMarkerInViewport: () => boolean;
  listLandsLayers: () => string[];
  listDebugLayers: () => string[];
  getDebugProbeMeta: () => DebugProbeMeta | null;
  getGeometryStats: () => GeometryValidationStats;
  getInvalidGeometrySamples: (limit?: number) => InvalidGeometrySample[];
  getLastHighlightLoad: () => HighlightLoadDebugInfo | null;
};

type DebugProbeMeta = {
  scanned: number;
  returned: number;
  transformed: number;
  truncated: boolean;
  limit: number;
  bboxApplied: boolean;
  bboxCrs: "EPSG:3857" | "EPSG:4326";
  sourceCrs: CadastralCrs;
  outputCrs: "EPSG:4326";
  sourceFile: string;
};

type DebugProbeApiResponse = {
  type: "FeatureCollection";
  features: GeoJSON.Feature[];
  meta: DebugProbeMeta;
};

const DEFAULT_LINE_COLOR = "#ff3333";
const DEFAULT_FILL_COLOR = "rgba(255, 51, 51, 0.2)";

const MANAGER_LINE_COLOR_EXPRESSION: any[] = [
  "match",
  ["coalesce", ["to-string", ["get", "property_manager"]], ""],
  "도로과",
  "#ff7f00",
  "건설과",
  "#377eb8",
  "산림공원과",
  "#4daf4a",
  "회계과",
  "#e41a1c",
  "#984ea3"
];

const MANAGER_FILL_COLOR_EXPRESSION: any[] = [
  "match",
  ["coalesce", ["to-string", ["get", "property_manager"]], ""],
  "도로과",
  "rgba(255, 127, 0, 0.2)",
  "건설과",
  "rgba(55, 126, 184, 0.2)",
  "산림공원과",
  "rgba(77, 175, 74, 0.2)",
  "회계과",
  "rgba(228, 26, 28, 0.2)",
  "rgba(152, 78, 163, 0.2)"
];

const BASEMAP_MAX_ZOOM: Record<BaseType, number> = {
  Base: 19,
  White: 18,
  Satellite: 19,
  Hybrid: 19
};

const LAND_SOURCE_ID = "lands-source";
const LAND_SELECTED_SOURCE_ID = "lands-selected-source";
const LAND_FILL_LAYER_ID = "cont-cadastre-fill";
const LAND_LINE_LAYER_ID = "cont-cadastre-line";
const LAND_SELECTED_FILL_LAYER_ID = "parcels-selected-fill";
const LAND_SELECTED_HALO_LAYER_ID = "parcels-selected-halo";
const LAND_SELECTED_LINE_LAYER_ID = "parcels-selected-line";
const LAND_SELECTED_PULSE_LAYER_ID = "parcels-selected-pulse";
const DEBUG_PROBE_SOURCE_ID = "debug-fgb-probe-source";
const DEBUG_PROBE_FILL_LAYER_ID = "debug-fgb-probe-fill";
const DEBUG_PROBE_LINE_LAYER_ID = "debug-fgb-probe-line";
const DEBUG_REFERENCE_MARKER_SOURCE_ID = "debug-reference-marker-source";
const DEBUG_REFERENCE_MARKER_LAYER_ID = "debug-reference-marker-layer";
const MAX_INVALID_GEOMETRY_SAMPLES = 50;
const DEBUG_REFERENCE_LNG_LAT: [number, number] = [126.45208, 36.783454];
const SELECTION_HALO_LINE_WIDTH = 8;
const SELECTION_INNER_LINE_WIDTH = 4;
const SELECTION_PULSE_PERIOD_MS = 1400;
const SELECTION_PULSE_MIN_WIDTH = 4;
const SELECTION_PULSE_MAX_WIDTH = 8;
const SELECTION_PULSE_MIN_ALPHA = 0.2;
const SELECTION_PULSE_MAX_ALPHA = 0.7;
const DEFAULT_DIFF_CHUNK_SIZE = 100;
const DEFAULT_DIFF_FRAME_BUDGET_MS = 8;

function isMapDebugEnabled(): boolean {
  return new URLSearchParams(window.location.search).get("debugMap") === "1";
}

function isDebugRecenterEnabled(): boolean {
  return new URLSearchParams(window.location.search).get("debugRecenter") === "1";
}

function isDebugFgbEnabled(): boolean {
  return new URLSearchParams(window.location.search).get("debugFgb") === "1";
}

function getSourceData(map: MapLibreMap, sourceId: string): GeoJSON.FeatureCollection | null {
  const source = map.getSource(sourceId) as GeoJSONSource | undefined;
  if (!source) {
    return null;
  }
  const data = (source as GeoJSONSource & { _data?: unknown })._data ?? source.serialize().data;
  if (!data || typeof data !== "object") {
    return null;
  }
  const candidate = data as { type?: unknown; features?: unknown };
  if (candidate.type !== "FeatureCollection" || !Array.isArray(candidate.features)) {
    return null;
  }
  return data as GeoJSON.FeatureCollection;
}

function installMapDebugHooks(
  map: MapLibreMap,
  deps: {
    getGeometryStats: () => GeometryValidationStats;
    getInvalidGeometrySamples: (limit?: number) => InvalidGeometrySample[];
    getDebugProbeMeta: () => DebugProbeMeta | null;
    getLastHighlightLoad: () => HighlightLoadDebugInfo | null;
  }
): void {
  if (!isMapDebugEnabled()) {
    return;
  }
  const target = globalThis as typeof globalThis & { __map?: MapLibreMap; __mapDebug?: MapDebugHelpers };
  target.__map = map;
  target.__mapDebug = {
    getLandsSourceData: () => getSourceData(map, LAND_SOURCE_ID),
    getSelectedSourceData: () => getSourceData(map, LAND_SELECTED_SOURCE_ID),
    getDebugProbeSourceData: () => getSourceData(map, DEBUG_PROBE_SOURCE_ID),
    getDebugMarkerData: () => getSourceData(map, DEBUG_REFERENCE_MARKER_SOURCE_ID),
    getDebugMarkerCoordinate: () => [...DEBUG_REFERENCE_LNG_LAT],
    getDebugMarkerScreenPoint: () => {
      const projected = map.project(DEBUG_REFERENCE_LNG_LAT);
      return { x: projected.x, y: projected.y };
    },
    getMapCenterZoom: () => {
      const center = map.getCenter();
      return { center: [center.lng, center.lat], zoom: map.getZoom() };
    },
    isDebugMarkerInViewport: () => {
      const projected = map.project(DEBUG_REFERENCE_LNG_LAT);
      const canvas = map.getCanvas();
      return projected.x >= 0 && projected.y >= 0 && projected.x <= canvas.clientWidth && projected.y <= canvas.clientHeight;
    },
    listLandsLayers: () =>
      map
        .getStyle()
        .layers.filter(
          (layer) =>
            layer.id.startsWith("cont-cadastre-") || layer.id.startsWith("parcels-selected-")
        )
        .map((layer) => layer.id),
    listDebugLayers: () =>
      map
        .getStyle()
        .layers.filter((layer) => layer.id.includes("debug-reference-marker") || layer.id.includes("debug-fgb-probe"))
        .map((layer) => layer.id),
    getDebugProbeMeta: () => deps.getDebugProbeMeta(),
    getGeometryStats: () => deps.getGeometryStats(),
    getInvalidGeometrySamples: (limit?: number) => deps.getInvalidGeometrySamples(limit),
    getLastHighlightLoad: () => deps.getLastHighlightLoad()
  };
}

function uninstallMapDebugHooks(): void {
  const target = globalThis as typeof globalThis & { __map?: MapLibreMap; __mapDebug?: MapDebugHelpers };
  delete target.__map;
  delete target.__mapDebug;
}

function buildVworldTileUrl(vworldKey: string, type: "Base" | "white" | "Satellite" | "Hybrid"): string {
  const ext = type === "Satellite" ? "jpeg" : "png";
  return `https://api.vworld.kr/req/wmts/1.0.0/${vworldKey}/${type}/{z}/{y}/{x}.${ext}`;
}

function isPosition(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number";
}

function isCoordinateContainer(value: unknown): value is Iterable<unknown> {
  return Array.isArray(value) || ArrayBuffer.isView(value) || (!!value && typeof value === "object" && Symbol.iterator in value);
}

function toCoordinateArray(value: unknown): unknown[] | null {
  if (!isCoordinateContainer(value)) {
    return null;
  }
  return Array.from(value);
}

function summarizeCoordinateSample(value: unknown, depth = 0): unknown {
  if (depth >= 2) {
    return value;
  }
  const items = toCoordinateArray(value);
  if (!items) {
    return value;
  }
  return items.slice(0, 3).map((item) => summarizeCoordinateSample(item, depth + 1));
}

function toWgs84Position(value: unknown, sourceCrs: CadastralCrs): [number, number] | null {
  const items = toCoordinateArray(value);
  if (!items || items.length < 2) {
    return null;
  }
  return toWgs84CoordinatePair(items[0], items[1], sourceCrs);
}

function normalizePositionArray(value: unknown, sourceCrs: CadastralCrs): [number, number][] | null {
  const items = toCoordinateArray(value);
  if (!items) {
    return null;
  }
  const out: [number, number][] = [];
  for (const item of items) {
    const normalized = toWgs84Position(item, sourceCrs);
    if (!normalized) {
      return null;
    }
    out.push(normalized);
  }
  return out;
}

function isClosedRing(ring: [number, number][]): boolean {
  if (ring.length < 4) {
    return false;
  }
  const first = ring[0];
  const last = ring[ring.length - 1];
  return first[0] === last[0] && first[1] === last[1];
}

function closeRingIfNeeded(ring: [number, number][]): [number, number][] {
  if (ring.length === 0 || isClosedRing(ring)) {
    return ring;
  }
  const first = ring[0];
  return [...ring, [first[0], first[1]]];
}

function normalizeLineString(value: unknown, sourceCrs: CadastralCrs): [number, number][] | null {
  const normalized = normalizePositionArray(value, sourceCrs);
  if (!normalized || normalized.length < 2) {
    return null;
  }
  return normalized;
}

function normalizePolygon(value: unknown, sourceCrs: CadastralCrs): [number, number][][] | null {
  const ringsRaw = toCoordinateArray(value);
  if (!ringsRaw || ringsRaw.length === 0) {
    return null;
  }
  const rings: [number, number][][] = [];
  for (const rawRing of ringsRaw) {
    const ring = normalizePositionArray(rawRing, sourceCrs);
    if (!ring) {
      return null;
    }
    const closedRing = closeRingIfNeeded(ring);
    if (closedRing.length < 4 || !isClosedRing(closedRing)) {
      return null;
    }
    rings.push(closedRing);
  }
  return rings;
}

function normalizeGeometryToWgs84(
  geometry: unknown,
  sourceCrs: CadastralCrs
): { geometry: GeoJSON.Geometry | null; reason: string } {
  if (!geometry || typeof geometry !== "object") {
    return { geometry: null, reason: "geometry_not_object" };
  }

  const candidate = geometry as { type?: unknown; coordinates?: unknown; geometries?: unknown[] };
  if (typeof candidate.type !== "string") {
    return { geometry: null, reason: "geometry_type_missing" };
  }

  if (candidate.type === "Point") {
    const point = toWgs84Position(candidate.coordinates, sourceCrs);
    return point ? { geometry: { type: "Point", coordinates: point }, reason: "ok" } : { geometry: null, reason: "invalid_point" };
  }

  if (candidate.type === "MultiPoint") {
    const points = normalizePositionArray(candidate.coordinates, sourceCrs);
    return points ? { geometry: { type: "MultiPoint", coordinates: points }, reason: "ok" } : { geometry: null, reason: "invalid_multipoint" };
  }

  if (candidate.type === "LineString") {
    const line = normalizeLineString(candidate.coordinates, sourceCrs);
    return line ? { geometry: { type: "LineString", coordinates: line }, reason: "ok" } : { geometry: null, reason: "invalid_linestring" };
  }

  if (candidate.type === "MultiLineString") {
    const linesRaw = toCoordinateArray(candidate.coordinates);
    if (!linesRaw || linesRaw.length === 0) {
      return { geometry: null, reason: "invalid_multilinestring" };
    }
    const lines: [number, number][][] = [];
    for (const rawLine of linesRaw) {
      const line = normalizeLineString(rawLine, sourceCrs);
      if (!line) {
        return { geometry: null, reason: "invalid_multilinestring" };
      }
      lines.push(line);
    }
    return { geometry: { type: "MultiLineString", coordinates: lines }, reason: "ok" };
  }

  if (candidate.type === "Polygon") {
    const polygon = normalizePolygon(candidate.coordinates, sourceCrs);
    return polygon ? { geometry: { type: "Polygon", coordinates: polygon }, reason: "ok" } : { geometry: null, reason: "invalid_polygon" };
  }

  if (candidate.type === "MultiPolygon") {
    const polygonsRaw = toCoordinateArray(candidate.coordinates);
    if (!polygonsRaw || polygonsRaw.length === 0) {
      return { geometry: null, reason: "invalid_multipolygon" };
    }
    const polygons: [number, number][][][] = [];
    for (const rawPolygon of polygonsRaw) {
      const polygon = normalizePolygon(rawPolygon, sourceCrs);
      if (!polygon) {
        return { geometry: null, reason: "invalid_multipolygon" };
      }
      polygons.push(polygon);
    }
    return { geometry: { type: "MultiPolygon", coordinates: polygons }, reason: "ok" };
  }

  if (candidate.type === "GeometryCollection") {
    const geometriesRaw = toCoordinateArray(candidate.geometries);
    if (!geometriesRaw || geometriesRaw.length === 0) {
      return { geometry: null, reason: "invalid_geometry_collection" };
    }
    const geometries: GeoJSON.Geometry[] = [];
    for (const child of geometriesRaw) {
      const normalizedChild = normalizeGeometryToWgs84(child, sourceCrs);
      if (!normalizedChild.geometry) {
        return { geometry: null, reason: `invalid_geometry_collection_member:${normalizedChild.reason}` };
      }
      geometries.push(normalizedChild.geometry);
    }
    return { geometry: { type: "GeometryCollection", geometries }, reason: "ok" };
  }

  return { geometry: null, reason: "unsupported_geometry_type" };
}

function foldBboxFromCoordinates(coordinates: unknown, bbox: [number, number, number, number] | null): [number, number, number, number] | null {
  if (isPosition(coordinates)) {
    const [x, y] = coordinates;
    if (!bbox) {
      return [x, y, x, y];
    }
    return [Math.min(bbox[0], x), Math.min(bbox[1], y), Math.max(bbox[2], x), Math.max(bbox[3], y)];
  }
  if (!Array.isArray(coordinates)) {
    return bbox;
  }
  let current = bbox;
  coordinates.forEach((item) => {
    current = foldBboxFromCoordinates(item, current);
  });
  return current;
}

function geometryBbox(geometry: unknown): [number, number, number, number] | null {
  if (!geometry || typeof geometry !== "object") {
    return null;
  }
  const candidate = geometry as { type?: unknown; coordinates?: unknown; geometries?: unknown[] };
  if (candidate.type === "GeometryCollection") {
    let bbox: [number, number, number, number] | null = null;
    (candidate.geometries || []).forEach((child) => {
      const childBbox = geometryBbox(child);
      if (!childBbox) {
        return;
      }
      bbox = bbox
        ? [
            Math.min(bbox[0], childBbox[0]),
            Math.min(bbox[1], childBbox[1]),
            Math.max(bbox[2], childBbox[2]),
            Math.max(bbox[3], childBbox[3]),
          ]
        : childBbox;
    });
    return bbox;
  }
  return foldBboxFromCoordinates(candidate.coordinates, null);
}

function intersectsBounds(a: [number, number, number, number] | null, b: [number, number, number, number]): boolean {
  if (!a) {
    return false;
  }
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

function toFeatureCollection(records: Iterable<FeatureRecord>): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: Array.from(records, (record) => ({
      type: "Feature",
      id: record.pnu,
      geometry: record.feature.geometry as GeoJSON.Geometry,
      properties: record.feature.properties as GeoJSON.GeoJsonProperties
    }))
  };
}

function createFeatureUpdate(record: FeatureRecord): GeoJSON.Feature {
  return {
    type: "Feature",
    id: record.pnu,
    geometry: record.feature.geometry as GeoJSON.Geometry,
    properties: record.feature.properties as GeoJSON.GeoJsonProperties
  };
}

function chunkItems<T>(items: T[], size: number): T[][] {
  if (items.length === 0) {
    return [];
  }
  const chunkSize = Math.max(1, size);
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function measureMapRender<T>(name: string, action: () => Promise<T> | T): Promise<T> {
  if (!isMapDebugEnabled() || typeof performance === "undefined") {
    return Promise.resolve(action());
  }
  const start = performance.now();
  return Promise.resolve(action()).finally(() => {
    console.info(`[maplibre] ${name}: ${(performance.now() - start).toFixed(1)}ms`);
  });
}

function createBasemapStyle(vworldKey: string): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      "vworld-base": { type: "raster", tiles: [buildVworldTileUrl(vworldKey, "Base")], tileSize: 256 },
      "vworld-white": { type: "raster", tiles: [buildVworldTileUrl(vworldKey, "white")], tileSize: 256 },
      "vworld-satellite": { type: "raster", tiles: [buildVworldTileUrl(vworldKey, "Satellite")], tileSize: 256 },
      "vworld-hybrid": { type: "raster", tiles: [buildVworldTileUrl(vworldKey, "Hybrid")], tileSize: 256 }
    },
    layers: [
      { id: "vworld-base-layer", type: "raster", source: "vworld-base", layout: { visibility: "none" } },
      { id: "vworld-white-layer", type: "raster", source: "vworld-white", layout: { visibility: "none" } },
      { id: "vworld-satellite-layer", type: "raster", source: "vworld-satellite", layout: { visibility: "visible" } },
      { id: "vworld-hybrid-layer", type: "raster", source: "vworld-hybrid", layout: { visibility: "none" } }
    ]
  };
}

function getLineColorExpression(theme: ThemeType): any {
  return (theme === "city_owned" ? MANAGER_LINE_COLOR_EXPRESSION : DEFAULT_LINE_COLOR) as any;
}

function getFillColorExpression(theme: ThemeType): any {
  return (theme === "city_owned" ? MANAGER_FILL_COLOR_EXPRESSION : DEFAULT_FILL_COLOR) as any;
}

function ensureLandLayers(map: MapLibreMap, theme: ThemeType): void {
  if (!map.getSource(LAND_SOURCE_ID)) {
    map.addSource(LAND_SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] }
    });
  }
  if (!map.getSource(LAND_SELECTED_SOURCE_ID)) {
    map.addSource(LAND_SELECTED_SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] }
    });
  }

  if (!map.getLayer(LAND_FILL_LAYER_ID)) {
    map.addLayer({
      id: LAND_FILL_LAYER_ID,
      type: "fill",
      source: LAND_SOURCE_ID,
      paint: {
        "fill-color": getFillColorExpression(theme),
        "fill-opacity": 1
      }
    });
  }

  if (!map.getLayer(LAND_LINE_LAYER_ID)) {
    map.addLayer({
      id: LAND_LINE_LAYER_ID,
      type: "line",
      source: LAND_SOURCE_ID,
      paint: {
        "line-color": getLineColorExpression(theme),
        "line-width": 3
      }
    });
  }

  if (!map.getLayer(LAND_SELECTED_FILL_LAYER_ID)) {
    map.addLayer({
      id: LAND_SELECTED_FILL_LAYER_ID,
      type: "fill",
      source: LAND_SELECTED_SOURCE_ID,
      paint: {
        "fill-color": getFillColorExpression(theme),
        "fill-opacity": 0
      }
    });
  }

  if (!map.getLayer(LAND_SELECTED_HALO_LAYER_ID)) {
    map.addLayer({
      id: LAND_SELECTED_HALO_LAYER_ID,
      type: "line",
      source: LAND_SELECTED_SOURCE_ID,
      paint: {
        "line-color": "rgba(255, 255, 255, 0.95)",
        "line-width": SELECTION_HALO_LINE_WIDTH
      }
    });
  }

  if (!map.getLayer(LAND_SELECTED_LINE_LAYER_ID)) {
    map.addLayer({
      id: LAND_SELECTED_LINE_LAYER_ID,
      type: "line",
      source: LAND_SELECTED_SOURCE_ID,
      paint: {
        "line-color": getLineColorExpression(theme),
        "line-width": SELECTION_INNER_LINE_WIDTH
      }
    });
  }

  if (!map.getLayer(LAND_SELECTED_PULSE_LAYER_ID)) {
    map.addLayer({
      id: LAND_SELECTED_PULSE_LAYER_ID,
      type: "line",
      source: LAND_SELECTED_SOURCE_ID,
      paint: {
        "line-color": getLineColorExpression(theme),
        "line-width": SELECTION_PULSE_MIN_WIDTH,
        "line-opacity": SELECTION_PULSE_MIN_ALPHA
      }
    });
  }
}

function ensureDebugProbeLayers(map: MapLibreMap): void {
  if (!map.getSource(DEBUG_PROBE_SOURCE_ID)) {
    map.addSource(DEBUG_PROBE_SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] }
    });
  }

  if (!map.getLayer(DEBUG_PROBE_FILL_LAYER_ID)) {
    map.addLayer({
      id: DEBUG_PROBE_FILL_LAYER_ID,
      type: "fill",
      source: DEBUG_PROBE_SOURCE_ID,
      paint: {
        "fill-color": "rgba(14, 165, 233, 0.08)",
        "fill-opacity": 1
      }
    });
  }

  if (!map.getLayer(DEBUG_PROBE_LINE_LAYER_ID)) {
    map.addLayer({
      id: DEBUG_PROBE_LINE_LAYER_ID,
      type: "line",
      source: DEBUG_PROBE_SOURCE_ID,
      paint: {
        "line-color": "#0ea5e9",
        "line-width": 1.5
      }
    });
  }
}

function ensureDebugReferenceMarker(map: MapLibreMap): void {
  if (!isMapDebugEnabled()) {
    return;
  }

  const existingDomMarker = document.getElementById("debug-reference-dom-marker");
  if (!existingDomMarker) {
    const markerElement = document.createElement("div");
    markerElement.id = "debug-reference-dom-marker";
    markerElement.style.width = "22px";
    markerElement.style.height = "22px";
    markerElement.style.borderRadius = "9999px";
    markerElement.style.background = "#22c55e";
    markerElement.style.border = "3px solid #ffffff";
    markerElement.style.boxSizing = "border-box";
    markerElement.style.boxShadow = "0 0 0 2px rgba(15, 23, 42, 0.45)";
    markerElement.style.pointerEvents = "none";
    new maplibregl.Marker({ element: markerElement }).setLngLat(DEBUG_REFERENCE_LNG_LAT).addTo(map);
  }

  if (!map.getSource(DEBUG_REFERENCE_MARKER_SOURCE_ID)) {
    map.addSource(DEBUG_REFERENCE_MARKER_SOURCE_ID, {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [
              {
                type: "Feature",
                geometry: {
                  type: "Point",
                  coordinates: DEBUG_REFERENCE_LNG_LAT
                },
                properties: {
                  name: "debug-reference-marker",
                  lng: DEBUG_REFERENCE_LNG_LAT[0],
                  lat: DEBUG_REFERENCE_LNG_LAT[1]
                }
              }
            ]
      }
    });
  }

  if (!map.getLayer(DEBUG_REFERENCE_MARKER_LAYER_ID)) {
    map.addLayer({
      id: DEBUG_REFERENCE_MARKER_LAYER_ID,
      type: "circle",
      source: DEBUG_REFERENCE_MARKER_SOURCE_ID,
      paint: {
        "circle-radius": 9,
        "circle-color": "#22c55e",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2
      }
    });
  }

  if (isDebugRecenterEnabled()) {
    map.jumpTo({ center: DEBUG_REFERENCE_LNG_LAT, zoom: 16 });
  }

  console.info(
    `[maplibre] debug marker ready: lng=${DEBUG_REFERENCE_LNG_LAT[0].toFixed(6)} lat=${DEBUG_REFERENCE_LNG_LAT[1].toFixed(6)}`
  );
}

function updateLandPaints(map: MapLibreMap, theme: ThemeType): void {
  if (!map.getLayer(LAND_FILL_LAYER_ID) || !map.getLayer(LAND_LINE_LAYER_ID)) {
    return;
  }
  map.setPaintProperty(LAND_FILL_LAYER_ID, "fill-color", getFillColorExpression(theme));
  map.setPaintProperty(LAND_LINE_LAYER_ID, "line-color", getLineColorExpression(theme));
  if (map.getLayer(LAND_SELECTED_FILL_LAYER_ID)) {
    map.setPaintProperty(LAND_SELECTED_FILL_LAYER_ID, "fill-color", getFillColorExpression(theme));
  }
  if (map.getLayer(LAND_SELECTED_LINE_LAYER_ID)) {
    map.setPaintProperty(LAND_SELECTED_LINE_LAYER_ID, "line-color", getLineColorExpression(theme));
  }
  if (map.getLayer(LAND_SELECTED_PULSE_LAYER_ID)) {
    map.setPaintProperty(LAND_SELECTED_PULSE_LAYER_ID, "line-color", getLineColorExpression(theme));
  }
}

function setBasemapVisibility(map: MapLibreMap, type: BaseType): void {
  const zoom = map.getZoom();
  const maxZoom = BASEMAP_MAX_ZOOM[type];
  if (zoom > maxZoom) {
    map.setZoom(maxZoom);
  }

  map.setLayoutProperty("vworld-base-layer", "visibility", type === "Base" ? "visible" : "none");
  map.setLayoutProperty("vworld-white-layer", "visibility", type === "White" ? "visible" : "none");
  map.setLayoutProperty("vworld-satellite-layer", "visibility", type === "Satellite" || type === "Hybrid" ? "visible" : "none");
  map.setLayoutProperty("vworld-hybrid-layer", "visibility", type === "Hybrid" ? "visible" : "none");
}

export function createMapLibreMapView(elements: MapViewElements) {
  let map: MapLibreMap | null = null;
  let currentTheme: ThemeType = "city_owned";
  let currentBasemap: BaseType = "Satellite";
  let onFeatureClick: ((payload: FeatureClickPayload) => void) | null = null;
  let onMoveEnd: (() => void) | null = null;
  let isLoaded = false;
  let currentDatasetKey = "";
  const featureRecordsByPnu = new Map<string, FeatureRecord>();
  let renderedRecordsByPnu = new Map<string, RenderedLandRecord>();
  const infoPanel = createMapViewInfoPanel({
    infoPanelElement: elements.infoPanelElement,
    infoPanelContent: elements.infoPanelContent
  });
  let selectedFeaturePnu: string | null = null;
  let applyFeatureDiffRequestSeq = 0;
  let geometryValidationStats: GeometryValidationStats = {
    received: 0,
    accepted: 0,
    dropped: 0,
    dropReasons: {}
  };
  let invalidGeometrySamples: InvalidGeometrySample[] = [];
  let lastHighlightLoad: HighlightLoadDebugInfo | null = null;
  let debugProbeMeta: DebugProbeMeta | null = null;
  let resolveMapReady: (() => void) | null = null;
  let selectionPulseAnimationFrameId: number | null = null;
  const normalizedGeometryCache = new WeakMap<object, { geometry: GeoJSON.Geometry; bbox: [number, number, number, number] }>();
  const reducedMotionMedia = window.matchMedia("(prefers-reduced-motion: reduce)");
  const mapReadyPromise = new Promise<void>((resolve) => {
    resolveMapReady = resolve;
  });

  const stopSelectionPulse = (): void => {
    if (selectionPulseAnimationFrameId !== null) {
      window.cancelAnimationFrame(selectionPulseAnimationFrameId);
      selectionPulseAnimationFrameId = null;
    }
    if (map?.getLayer(LAND_SELECTED_PULSE_LAYER_ID)) {
      map.setPaintProperty(LAND_SELECTED_PULSE_LAYER_ID, "line-width", SELECTION_PULSE_MIN_WIDTH);
      map.setPaintProperty(LAND_SELECTED_PULSE_LAYER_ID, "line-opacity", reducedMotionMedia.matches ? 0 : SELECTION_PULSE_MIN_ALPHA);
    }
  };

  const animateSelectionPulse = (): void => {
    if (!map || !isLoaded || selectedFeaturePnu === null || reducedMotionMedia.matches || !map.getLayer(LAND_SELECTED_PULSE_LAYER_ID)) {
      stopSelectionPulse();
      return;
    }
    const progress = ((Date.now() % SELECTION_PULSE_PERIOD_MS) / SELECTION_PULSE_PERIOD_MS) * Math.PI * 2;
    const eased = (Math.sin(progress) + 1) / 2;
    const pulseAlpha = SELECTION_PULSE_MIN_ALPHA + (SELECTION_PULSE_MAX_ALPHA - SELECTION_PULSE_MIN_ALPHA) * eased;
    const pulseWidth = SELECTION_PULSE_MIN_WIDTH + (SELECTION_PULSE_MAX_WIDTH - SELECTION_PULSE_MIN_WIDTH) * eased;
    map.setPaintProperty(LAND_SELECTED_PULSE_LAYER_ID, "line-width", pulseWidth);
    map.setPaintProperty(LAND_SELECTED_PULSE_LAYER_ID, "line-opacity", pulseAlpha);
    selectionPulseAnimationFrameId = window.requestAnimationFrame(animateSelectionPulse);
  };

  const syncSelectionPulseState = (): void => {
    if (!map || !isLoaded || selectedFeaturePnu === null || reducedMotionMedia.matches) {
      stopSelectionPulse();
      return;
    }
    if (selectionPulseAnimationFrameId !== null) {
      return;
    }
    selectionPulseAnimationFrameId = window.requestAnimationFrame(animateSelectionPulse);
  };

  const resetGeometryValidationStats = (received: number): void => {
    geometryValidationStats = {
      received,
      accepted: 0,
      dropped: 0,
      dropReasons: {}
    };
    invalidGeometrySamples = [];
  };

  const addGeometryDrop = (featureId: number, reason: string, geometryType: string, coordinateSample?: unknown): void => {
    geometryValidationStats.dropped += 1;
    geometryValidationStats.dropReasons[reason] = (geometryValidationStats.dropReasons[reason] ?? 0) + 1;
    if (invalidGeometrySamples.length < MAX_INVALID_GEOMETRY_SAMPLES) {
      invalidGeometrySamples.push({
        featureId,
        reason,
        geometryType,
        coordinateSample
      });
    }
  };

  const syncSelectedSourceData = (): void => {
    if (!map || !isLoaded) {
      return;
    }
    const selectedSource = map.getSource(LAND_SELECTED_SOURCE_ID) as GeoJSONSource | undefined;
    if (!selectedSource) {
      return;
    }

    if (selectedFeaturePnu !== null) {
      const selected = featureRecordsByPnu.get(selectedFeaturePnu);
      selectedSource.setData(toFeatureCollection(selected ? [selected] : []));
      if (!selected) {
        selectedFeaturePnu = null;
      }
    } else {
      selectedSource.setData(toFeatureCollection([]));
    }
    syncSelectionPulseState();
  };

  const syncSourceData = (): void => {
    if (!map || !isLoaded) {
      return;
    }
    const source = map.getSource(LAND_SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) {
      return;
    }
    source.setData(toFeatureCollection(featureRecordsByPnu.values()));
    syncSelectedSourceData();
  };

  const clearRenderedFeatures = (): void => {
    featureRecordsByPnu.clear();
    renderedRecordsByPnu = new Map();
    currentDatasetKey = "";
    applyFeatureDiffRequestSeq += 1;
    selectedFeaturePnu = null;
    if (!map || !isLoaded) {
      return;
    }
    const source = map.getSource(LAND_SOURCE_ID) as GeoJSONSource | undefined;
    if (source) {
      source.setData({ type: "FeatureCollection", features: [] });
    }
    syncSelectedSourceData();
  };

  const normalizeFeatureRecord = (
    pnu: string,
    record: RenderedLandRecord,
    sourceProjection: CadastralCrs
  ): FeatureRecord | null => {
    const geometryType = typeof (record.geometry as { type?: unknown })?.type === "string"
      ? String((record.geometry as { type?: unknown }).type)
      : "unknown";
    if (record.geometry && typeof record.geometry === "object") {
      const cached = normalizedGeometryCache.get(record.geometry as object);
      if (cached) {
        return {
          pnu,
          feature: {
            type: "Feature" as const,
            geometry: cached.geometry,
            properties: record.properties
          },
          bbox: cached.bbox
        };
      }
    }
    const normalizedGeometry = normalizeGeometryToWgs84(record.geometry, sourceProjection);
    if (!normalizedGeometry.geometry) {
      const coordinateSample =
        record.geometry && typeof record.geometry === "object" && "coordinates" in (record.geometry as object)
          ? summarizeCoordinateSample((record.geometry as { coordinates?: unknown }).coordinates)
          : undefined;
      addGeometryDrop(Number(record.properties.list_index ?? -1), normalizedGeometry.reason, geometryType, coordinateSample);
      return null;
    }
    const bbox = geometryBbox(normalizedGeometry.geometry);
    if (!bbox) {
      addGeometryDrop(Number(record.properties.list_index ?? -1), "bbox_unavailable", geometryType);
      return null;
    }
    const nextRecord = {
      pnu,
      feature: {
        type: "Feature" as const,
        geometry: normalizedGeometry.geometry,
        properties: record.properties
      },
      bbox
    };
    if (record.geometry && typeof record.geometry === "object") {
      normalizedGeometryCache.set(record.geometry as object, {
        geometry: normalizedGeometry.geometry,
        bbox
      });
    }
    return nextRecord;
  };

  const replaceAllFeatureRecords = (
    nextByPnu: RenderedLandRecordMap,
    sourceProjection: CadastralCrs
  ): number => {
    resetGeometryValidationStats(nextByPnu.size);
    featureRecordsByPnu.clear();
    for (const [pnu, record] of nextByPnu.entries()) {
      const normalized = normalizeFeatureRecord(pnu, record, sourceProjection);
      if (!normalized) {
        continue;
      }
      featureRecordsByPnu.set(pnu, normalized);
      geometryValidationStats.accepted += 1;
    }
    renderedRecordsByPnu = new Map(nextByPnu);
    if (geometryValidationStats.dropped > 0) {
      console.warn(
        `[maplibre] geometry validation dropped ${geometryValidationStats.dropped}/${geometryValidationStats.received} features`,
        geometryValidationStats.dropReasons
      );
    }
    syncSourceData();
    return geometryValidationStats.accepted;
  };

  const init = (config: MapConfig): void => {
    map = new maplibregl.Map({
      container: "map",
      style: createBasemapStyle(config.vworldKey),
      center: config.center,
      zoom: config.zoom,
      maxZoom: 22,
      minZoom: 7,
      attributionControl: false
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");

    map.on("load", () => {
      if (!map) {
        return;
      }
      isLoaded = true;
      ensureLandLayers(map, currentTheme);
      if (isDebugFgbEnabled()) {
        ensureDebugProbeLayers(map);
      }
      ensureDebugReferenceMarker(map);
      updateLandPaints(map, currentTheme);
      setBasemapVisibility(map, currentBasemap);
      syncSourceData();
      installMapDebugHooks(map, {
        getGeometryStats: () => ({
          received: geometryValidationStats.received,
          accepted: geometryValidationStats.accepted,
          dropped: geometryValidationStats.dropped,
          dropReasons: { ...geometryValidationStats.dropReasons }
        }),
        getInvalidGeometrySamples: (limit?: number) => {
          const normalizedLimit = typeof limit === "number" && limit > 0 ? Math.floor(limit) : 20;
          return invalidGeometrySamples.slice(0, normalizedLimit);
        },
        getDebugProbeMeta: () => debugProbeMeta,
        getLastHighlightLoad: () => lastHighlightLoad
      });
      resolveMapReady?.();
      resolveMapReady = null;
    });

    map.on("click", (event) => {
      if (!map) {
        return;
      }
      const features = map.queryRenderedFeatures(event.point, {
        layers: [
          LAND_SELECTED_FILL_LAYER_ID,
          LAND_SELECTED_HALO_LAYER_ID,
          LAND_SELECTED_LINE_LAYER_ID,
          LAND_SELECTED_PULSE_LAYER_ID,
          LAND_FILL_LAYER_ID,
          LAND_LINE_LAYER_ID
        ]
      });
      const selected = features.find((candidate) => {
        const raw = candidate.properties?.list_index;
        return typeof raw === "number" || (typeof raw === "string" && raw.trim() !== "" && Number.isFinite(Number(raw)));
      });

      if (!selected) {
        selectedFeaturePnu = null;
        syncSelectedSourceData();
        infoPanel.clear();
        return;
      }

      const listIndexRaw = selected.properties?.list_index;
      const listIndex = typeof listIndexRaw === "number" ? listIndexRaw : Number(listIndexRaw);
      if (!Number.isFinite(listIndex) || !onFeatureClick) {
        return;
      }
      onFeatureClick({
        index: listIndex,
        coordinate: [event.lngLat.lng, event.lngLat.lat]
      });
    });

    map.on("moveend", () => {
      if (map && currentBasemap === "White" && map.getZoom() > BASEMAP_MAX_ZOOM.White) {
        map.setZoom(BASEMAP_MAX_ZOOM.White);
      }
      onMoveEnd?.();
    });
  };

  const changeLayer = (type: BaseType): void => {
    currentBasemap = type;
    if (!map || !isLoaded) {
      return;
    }
    setBasemapVisibility(map, type);
  };

  const renderFeatures = (data: LandFeatureCollection, options?: RenderOptions): number => {
    const sourceProjection = options?.dataProjection ?? "EPSG:4326";
    if (sourceProjection !== "EPSG:4326") {
      console.warn(`[maplibre] expected EPSG:4326 GeoJSON but received ${sourceProjection}`);
    }
    const nextByPnu = new Map<string, RenderedLandRecord>();
    data.features.forEach((rawFeature, idx) => {
      const pnu = normalizeRenderedRecordPnu(rawFeature.properties.pnu ?? idx);
      if (!pnu) {
        return;
      }
      nextByPnu.set(pnu, {
        pnu,
        geometry: rawFeature.geometry,
        properties: rawFeature.properties
      });
    });
    currentDatasetKey = "";
    return replaceAllFeatureRecords(nextByPnu, sourceProjection);
  };

  const applyFeatureDiff = async (
    nextByPnu: RenderedLandRecordMap,
    options: FeatureDiffOptions
  ): Promise<number> => {
    const sourceProjection = options.dataProjection ?? "EPSG:4326";
    if (sourceProjection !== "EPSG:4326") {
      console.warn(`[maplibre] expected EPSG:4326 GeoJSON but received ${sourceProjection}`);
    }

    const requestSeq = applyFeatureDiffRequestSeq + 1;
    applyFeatureDiffRequestSeq = requestSeq;
    const chunkSize = options.chunkSize ?? DEFAULT_DIFF_CHUNK_SIZE;
    const frameBudgetMs = options.frameBudgetMs ?? DEFAULT_DIFF_FRAME_BUDGET_MS;

    if (!map || !isLoaded) {
      currentDatasetKey = options.datasetKey;
      return replaceAllFeatureRecords(nextByPnu, sourceProjection);
    }

    const source = map.getSource(LAND_SOURCE_ID) as GeoJSONSource | undefined;
    if (!source || currentDatasetKey !== options.datasetKey) {
      currentDatasetKey = options.datasetKey;
      return replaceAllFeatureRecords(nextByPnu, sourceProjection);
    }

    resetGeometryValidationStats(nextByPnu.size);

    const toRemove: string[] = [];
    const toAdd: FeatureRecord[] = [];
    const toUpdate: FeatureRecord[] = [];

    for (const existingPnu of featureRecordsByPnu.keys()) {
      if (!nextByPnu.has(existingPnu)) {
        toRemove.push(existingPnu);
      }
    }

    for (const [pnu, nextRecord] of nextByPnu.entries()) {
      const previousRecord = renderedRecordsByPnu.get(pnu);
      const existingFeatureRecord = featureRecordsByPnu.get(pnu);
      if (!previousRecord || !existingFeatureRecord) {
        const normalized = normalizeFeatureRecord(pnu, nextRecord, sourceProjection);
        if (!normalized) {
          continue;
        }
        toAdd.push(normalized);
        geometryValidationStats.accepted += 1;
        continue;
      }
      if (
        previousRecord.geometry === nextRecord.geometry &&
        !haveRenderedPropertiesChanged(previousRecord.properties, nextRecord.properties)
      ) {
        geometryValidationStats.accepted += 1;
        continue;
      }
      const normalized = normalizeFeatureRecord(pnu, nextRecord, sourceProjection);
      if (!normalized) {
        continue;
      }
      toUpdate.push(normalized);
      geometryValidationStats.accepted += 1;
    }

    if (geometryValidationStats.dropped > 0) {
      console.warn(
        `[maplibre] geometry validation dropped ${geometryValidationStats.dropped}/${geometryValidationStats.received} features`,
        geometryValidationStats.dropReasons
      );
    }

    const updateInBatches = async <T>(items: T[], updater: (chunk: T[]) => void): Promise<void> => {
      for (const chunk of chunkItems(items, chunkSize)) {
        if (requestSeq !== applyFeatureDiffRequestSeq) {
          return;
        }
        const startedAt = performance.now();
        updater(chunk);
        if (performance.now() - startedAt >= frameBudgetMs) {
          await nextAnimationFrame();
        }
      }
    };

    await updateInBatches(toRemove, (chunk) => {
      source.updateData({ remove: chunk });
      chunk.forEach((pnu) => {
        featureRecordsByPnu.delete(pnu);
        if (selectedFeaturePnu === pnu) {
          selectedFeaturePnu = null;
        }
      });
    });
    await updateInBatches(toAdd, (chunk) => {
      source.updateData({ add: chunk.map(createFeatureUpdate) });
      chunk.forEach((record) => {
        featureRecordsByPnu.set(record.pnu, record);
      });
    });
    await updateInBatches(toUpdate, (chunk) => {
      source.updateData({
        update: chunk.map((record) => ({
          id: record.pnu,
          newGeometry: record.feature.geometry as GeoJSON.Geometry,
          removeAllProperties: true,
          addOrUpdateProperties: Object.entries(record.feature.properties as Record<string, unknown>).map(([key, value]) => ({
            key,
            value
          }))
        }))
      });
      chunk.forEach((record) => {
        featureRecordsByPnu.set(record.pnu, record);
      });
    });

    if (requestSeq !== applyFeatureDiffRequestSeq) {
      return geometryValidationStats.accepted;
    }

    renderedRecordsByPnu = new Map(nextByPnu);
    currentDatasetKey = options.datasetKey;
    syncSelectedSourceData();
    return geometryValidationStats.accepted;
  };

  const applyFeatureDelta = async (
    delta: FeatureDelta,
    options: FeatureDiffOptions
  ): Promise<number> => {
    const sourceProjection = options.dataProjection ?? "EPSG:4326";
    if (sourceProjection !== "EPSG:4326") {
      console.warn(`[maplibre] expected EPSG:4326 GeoJSON but received ${sourceProjection}`);
    }
    const requestSeq = applyFeatureDiffRequestSeq + 1;
    applyFeatureDiffRequestSeq = requestSeq;
    const chunkSize = options.chunkSize ?? DEFAULT_DIFF_CHUNK_SIZE;
    const frameBudgetMs = options.frameBudgetMs ?? DEFAULT_DIFF_FRAME_BUDGET_MS;
    const remove = delta.remove ?? [];

    if (!map || !isLoaded) {
      const merged = new Map(renderedRecordsByPnu);
      remove.forEach((pnu) => {
        merged.delete(pnu);
      });
      delta.addOrUpdate.forEach((record, pnu) => {
        merged.set(pnu, record);
      });
      currentDatasetKey = options.datasetKey;
      return replaceAllFeatureRecords(merged, sourceProjection);
    }

    const source = map.getSource(LAND_SOURCE_ID) as GeoJSONSource | undefined;
    if (!source || currentDatasetKey !== options.datasetKey) {
      const merged = new Map(renderedRecordsByPnu);
      remove.forEach((pnu) => {
        merged.delete(pnu);
      });
      delta.addOrUpdate.forEach((record, pnu) => {
        merged.set(pnu, record);
      });
      currentDatasetKey = options.datasetKey;
      return replaceAllFeatureRecords(merged, sourceProjection);
    }

    resetGeometryValidationStats(delta.addOrUpdate.size + remove.length);
    const toAdd: FeatureRecord[] = [];
    const toUpdate: FeatureRecord[] = [];
    let selectionChanged = false;

    for (const [pnu, nextRecord] of delta.addOrUpdate.entries()) {
      const previousRecord = renderedRecordsByPnu.get(pnu);
      const existingFeatureRecord = featureRecordsByPnu.get(pnu);
      if (!previousRecord || !existingFeatureRecord) {
        const normalized = normalizeFeatureRecord(pnu, nextRecord, sourceProjection);
        if (!normalized) {
          continue;
        }
        toAdd.push(normalized);
        geometryValidationStats.accepted += 1;
        continue;
      }
      if (
        previousRecord.geometry === nextRecord.geometry &&
        !haveRenderedPropertiesChanged(previousRecord.properties, nextRecord.properties)
      ) {
        geometryValidationStats.accepted += 1;
        continue;
      }
      const normalized = normalizeFeatureRecord(pnu, nextRecord, sourceProjection);
      if (!normalized) {
        continue;
      }
      toUpdate.push(normalized);
      geometryValidationStats.accepted += 1;
      if (selectedFeaturePnu === pnu) {
        selectionChanged = true;
      }
    }

    const updateInBatches = async <T>(items: T[], updater: (chunk: T[]) => void): Promise<void> => {
      for (const chunk of chunkItems(items, chunkSize)) {
        if (requestSeq !== applyFeatureDiffRequestSeq) {
          return;
        }
        const startedAt = performance.now();
        updater(chunk);
        if (performance.now() - startedAt >= frameBudgetMs) {
          await nextAnimationFrame();
        }
      }
    };

    await updateInBatches(remove, (chunk) => {
      source.updateData({ remove: chunk });
      chunk.forEach((pnu) => {
        featureRecordsByPnu.delete(pnu);
        renderedRecordsByPnu.delete(pnu);
        if (selectedFeaturePnu === pnu) {
          selectedFeaturePnu = null;
          selectionChanged = true;
        }
      });
    });
    await updateInBatches(toAdd, (chunk) => {
      source.updateData({ add: chunk.map(createFeatureUpdate) });
      chunk.forEach((record) => {
        featureRecordsByPnu.set(record.pnu, record);
      });
    });
    await updateInBatches(toUpdate, (chunk) => {
      source.updateData({
        update: chunk.map((record) => ({
          id: record.pnu,
          newGeometry: record.feature.geometry as GeoJSON.Geometry,
          removeAllProperties: true,
          addOrUpdateProperties: Object.entries(record.feature.properties as Record<string, unknown>).map(([key, value]) => ({
            key,
            value
          }))
        }))
      });
      chunk.forEach((record) => {
        featureRecordsByPnu.set(record.pnu, record);
      });
    });

    if (requestSeq !== applyFeatureDiffRequestSeq) {
      return geometryValidationStats.accepted;
    }

    delta.addOrUpdate.forEach((record, pnu) => {
      renderedRecordsByPnu.set(pnu, record);
    });
    currentDatasetKey = options.datasetKey;
    if (selectionChanged) {
      syncSelectedSourceData();
    }
    return geometryValidationStats.accepted;
  };

  const selectFeatureByIndex = (index: number, options: SelectOptions): boolean => {
    if (!map) {
      return false;
    }
    let record: FeatureRecord | null = null;
    for (const candidate of featureRecordsByPnu.values()) {
      if (candidate.feature.properties.list_index === index) {
        record = candidate;
        break;
      }
    }
    if (!record) {
      return false;
    }

    selectedFeaturePnu = record.pnu;
    syncSelectedSourceData();
    infoPanel.renderProperties(record.feature.properties as LandFeatureProperties);

    if (!options.shouldFit || !record.bbox) {
      return true;
    }

    const [minX, minY, maxX, maxY] = record.bbox;
    const isPointLike = minX === maxX && minY === maxY;
    window.requestAnimationFrame(() => {
      if (!map) {
        return;
      }
      if (isPointLike) {
        map.easeTo({ center: [minX, minY], duration: 300 });
        if (map.getZoom() < 19) {
          map.setZoom(19);
        }
        return;
      }
      map.fitBounds(
        [
          [minX, minY],
          [maxX, maxY]
        ],
        { padding: 100, duration: 300, maxZoom: 19 }
      );
    });
    return true;
  };

  const fitToFeatures = (): void => {
    if (!map) {
      return;
    }
    let extent: [number, number, number, number] | null = null;
    for (const record of featureRecordsByPnu.values()) {
      if (!record.bbox) {
        continue;
      }
      extent = extent
        ? [
            Math.min(extent[0], record.bbox[0]),
            Math.min(extent[1], record.bbox[1]),
            Math.max(extent[2], record.bbox[2]),
            Math.max(extent[3], record.bbox[3])
          ]
        : [...record.bbox];
    }
    if (!extent) {
      return;
    }
    map.fitBounds(
      [
        [extent[0], extent[1]],
        [extent[2], extent[3]]
      ],
      { padding: 50, duration: 500 }
    );
  };

  const clearInfoPanel = (): void => {
    selectedFeaturePnu = null;
    syncSelectedSourceData();
    infoPanel.clear();
  };

  const clearInfoPanelContentOnly = (): void => {
    infoPanel.clear();
  };

  const setTheme = (theme: ThemeType): void => {
    currentTheme = theme;
    if (!map || !isLoaded) {
      return;
    }
    updateLandPaints(map, theme);
    syncSelectionPulseState();
  };

  const loadDebugProbe = async (
    _config: MapConfig,
    setMapStatus: (message: string, color?: string) => void
  ): Promise<void> => {
    if (!isDebugFgbEnabled()) {
      return;
    }
    await mapReadyPromise;
    if (!map || !isLoaded) {
      return;
    }
    ensureDebugProbeLayers(map);
    const source = map.getSource(DEBUG_PROBE_SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) {
      return;
    }
    const bounds = map.getBounds();
    const bbox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()] as [number, number, number, number];
    try {
      const payload = await fetchJson<DebugProbeApiResponse>(
        `/api/cadastral/debug-probe?bbox=${bbox.join(",")}&bboxCrs=EPSG:4326&limit=1000`,
        { timeoutMs: 30000 }
      );
      source.setData({ type: payload.type, features: payload.features });
      debugProbeMeta = payload.meta;
      const message = payload.meta.truncated
        ? `원본 FGB 진단 레이어 ${payload.meta.returned}건 표시(제한 ${payload.meta.limit}건, 절단됨)`
        : `원본 FGB 진단 레이어 ${payload.meta.returned}건 표시`;
      setMapStatus(message, "#0f766e");
      if (isMapDebugEnabled()) {
        console.info("[maplibre] debug FGB probe loaded", payload.meta);
      }
    } catch (error) {
      const message = error instanceof Error ? `원본 FGB 진단 레이어 로딩 실패: ${error.message}` : "원본 FGB 진단 레이어 로딩 실패";
      console.warn("[maplibre]", message);
      setMapStatus(message, "#b45309");
    }
  };

  const setHighlightDebugInfo = (info: HighlightLoadDebugInfo | null): void => {
    lastHighlightLoad = info;
  };

  elements.infoPanelCloseButton?.addEventListener("click", () => infoPanel.dismiss());
  window.addEventListener("beforeunload", () => {
    stopSelectionPulse();
    uninstallMapDebugHooks();
  });
  reducedMotionMedia.addEventListener("change", () => syncSelectionPulseState());
  infoPanel.clear();

  return {
    changeLayer,
    clearInfoPanel,
    clearInfoPanelContentOnly,
    fitToFeatures,
    init,
    getCurrentExtent: (): number[] | null => {
      if (!map) {
        return null;
      }
      const bounds = map.getBounds();
      return [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
    },
    getCurrentZoom: (): number | null => (map ? map.getZoom() : null),
    getMap: (): unknown => map,
    getVisibleListIndexes: (): number[] => {
      if (!map) {
        return [];
      }
      const bounds = map.getBounds();
      const viewBbox: [number, number, number, number] = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
      const indexes: number[] = [];
      for (const record of featureRecordsByPnu.values()) {
        if (intersectsBounds(record.bbox, viewBbox)) {
          const listIndex = record.feature.properties.list_index;
          if (typeof listIndex === "number") {
            indexes.push(listIndex);
          }
        }
      }
      return indexes;
    },
    getEngine: (): "maplibre" => "maplibre",
    applyFeatureDelta: (delta: FeatureDelta, options: FeatureDiffOptions): Promise<number> =>
      measureMapRender(`applyFeatureDelta(${delta.addOrUpdate.size})`, () => applyFeatureDelta(delta, options)),
    applyFeatureDiff: (nextByPnu: RenderedLandRecordMap, options: FeatureDiffOptions): Promise<number> =>
      measureMapRender(`applyFeatureDiff(${nextByPnu.size})`, () => applyFeatureDiff(nextByPnu, options)),
    clearRenderedFeatures,
    loadDebugProbe,
    renderFeatures,
    resize: (): void => {
      map?.resize();
    },
    setHighlightDebugInfo,
    selectFeatureByIndex,
    setFeatureClickHandler: (handler: (payload: FeatureClickPayload) => void): void => {
      onFeatureClick = handler;
    },
    setMoveEndHandler: (handler: (() => void) | null): void => {
      onMoveEnd = handler;
    },
    setTheme
  };
}
