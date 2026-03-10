import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from "maplibre-gl";

import { createMapViewInfoPanel } from "./map-view-info-panel";

import type { BaseType, CadastralCrs, LandFeature, LandFeatureCollection, LandFeatureProperties, MapConfig, ThemeType } from "./types";

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
  id: number;
  feature: LandFeature;
  bbox: [number, number, number, number] | null;
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
const LAND_FILL_LAYER_ID = "lands-fill";
const LAND_LINE_LAYER_ID = "lands-line";
const LAND_SELECTED_FILL_LAYER_ID = "lands-selected-fill";
const LAND_SELECTED_LINE_LAYER_ID = "lands-selected-line";

function buildVworldTileUrl(vworldKey: string, type: "Base" | "white" | "Satellite" | "Hybrid"): string {
  const ext = type === "Satellite" ? "jpeg" : "png";
  return `https://api.vworld.kr/req/wmts/1.0.0/${vworldKey}/${type}/{z}/{y}/{x}.${ext}`;
}

function isPosition(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number";
}

function mercatorToWgs84(coord: [number, number]): [number, number] {
  const lon = (coord[0] / 20037508.34) * 180;
  const lat = (Math.atan(Math.sinh((coord[1] / 20037508.34) * Math.PI)) * 180) / Math.PI;
  return [lon, lat];
}

function transformCoordinates(value: unknown, sourceCrs: CadastralCrs): unknown {
  if (isPosition(value)) {
    if (sourceCrs === "EPSG:4326") {
      return [value[0], value[1]];
    }
    return mercatorToWgs84([value[0], value[1]]);
  }
  if (Array.isArray(value)) {
    return value.map((item) => transformCoordinates(item, sourceCrs));
  }
  return value;
}

function transformGeometryToWgs84(geometry: unknown, sourceCrs: CadastralCrs): unknown {
  if (!geometry || typeof geometry !== "object") {
    return geometry;
  }
  const candidate = geometry as { type?: unknown; coordinates?: unknown; geometries?: unknown[] };
  if (typeof candidate.type !== "string") {
    return geometry;
  }
  if (candidate.type === "GeometryCollection") {
    return {
      type: "GeometryCollection",
      geometries: Array.isArray(candidate.geometries)
        ? candidate.geometries.map((item) => transformGeometryToWgs84(item, sourceCrs))
        : []
    };
  }
  return {
    type: candidate.type,
    coordinates: transformCoordinates(candidate.coordinates, sourceCrs)
  };
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
      id: record.id,
      geometry: record.feature.geometry as GeoJSON.Geometry,
      properties: record.feature.properties as GeoJSON.GeoJsonProperties
    }))
  };
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
        "fill-color": (theme === "city_owned" ? MANAGER_FILL_COLOR_EXPRESSION : DEFAULT_FILL_COLOR) as any,
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
        "line-color": (theme === "city_owned" ? MANAGER_LINE_COLOR_EXPRESSION : DEFAULT_LINE_COLOR) as any,
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
        "fill-color": "rgba(255, 212, 0, 0.18)",
        "fill-opacity": 1
      }
    });
  }

  if (!map.getLayer(LAND_SELECTED_LINE_LAYER_ID)) {
    map.addLayer({
      id: LAND_SELECTED_LINE_LAYER_ID,
      type: "line",
      source: LAND_SELECTED_SOURCE_ID,
      paint: {
        "line-color": "#ffd400",
        "line-width": 4
      }
    });
  }
}

function updateLandPaints(map: MapLibreMap, theme: ThemeType): void {
  if (!map.getLayer(LAND_FILL_LAYER_ID) || !map.getLayer(LAND_LINE_LAYER_ID)) {
    return;
  }
  map.setPaintProperty(
    LAND_FILL_LAYER_ID,
    "fill-color",
    (theme === "city_owned" ? MANAGER_FILL_COLOR_EXPRESSION : DEFAULT_FILL_COLOR) as any
  );
  map.setPaintProperty(
    LAND_LINE_LAYER_ID,
    "line-color",
    (theme === "city_owned" ? MANAGER_LINE_COLOR_EXPRESSION : DEFAULT_LINE_COLOR) as any
  );
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
  const featureRecordsById = new Map<number, FeatureRecord>();
  const infoPanel = createMapViewInfoPanel({
    infoPanelElement: elements.infoPanelElement,
    infoPanelContent: elements.infoPanelContent
  });
  let selectedFeatureId: number | null = null;

  const syncSourceData = (): void => {
    if (!map || !isLoaded) {
      return;
    }
    const source = map.getSource(LAND_SOURCE_ID) as GeoJSONSource | undefined;
    const selectedSource = map.getSource(LAND_SELECTED_SOURCE_ID) as GeoJSONSource | undefined;
    if (!source || !selectedSource) {
      return;
    }

    source.setData(toFeatureCollection(featureRecordsById.values()));
    if (selectedFeatureId !== null) {
      const selected = featureRecordsById.get(selectedFeatureId);
      selectedSource.setData(toFeatureCollection(selected ? [selected] : []));
      if (!selected) {
        selectedFeatureId = null;
      }
    } else {
      selectedSource.setData(toFeatureCollection([]));
    }
  };

  const init = (config: MapConfig): void => {
    map = new maplibregl.Map({
      container: "map",
      style: createBasemapStyle(config.vworldKey),
      center: config.center,
      zoom: config.zoom,
      maxZoom: 22,
      minZoom: 7
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");

    map.on("load", () => {
      if (!map) {
        return;
      }
      isLoaded = true;
      ensureLandLayers(map, currentTheme);
      updateLandPaints(map, currentTheme);
      setBasemapVisibility(map, currentBasemap);
      syncSourceData();
    });

    map.on("click", (event) => {
      if (!map) {
        return;
      }
      const features = map.queryRenderedFeatures(event.point, {
        layers: [LAND_SELECTED_FILL_LAYER_ID, LAND_SELECTED_LINE_LAYER_ID, LAND_FILL_LAYER_ID, LAND_LINE_LAYER_ID]
      });
      const selected = features.find((candidate) => {
        const raw = candidate.properties?.list_index;
        return typeof raw === "number" || (typeof raw === "string" && raw.trim() !== "" && Number.isFinite(Number(raw)));
      });

      if (!selected) {
        selectedFeatureId = null;
        syncSourceData();
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
    featureRecordsById.clear();
    data.features.forEach((rawFeature, idx) => {
      const nextId = typeof rawFeature.properties.list_index === "number" ? rawFeature.properties.list_index : idx;
      const transformedGeometry = transformGeometryToWgs84(rawFeature.geometry, sourceProjection);
      const nextFeature: LandFeature = {
        type: "Feature",
        geometry: transformedGeometry,
        properties: rawFeature.properties
      };
      featureRecordsById.set(nextId, {
        id: nextId,
        feature: nextFeature,
        bbox: geometryBbox(transformedGeometry)
      });
    });
    syncSourceData();
    return data.features.length;
  };

  const selectFeatureByIndex = (index: number, options: SelectOptions): boolean => {
    if (!map) {
      return false;
    }
    const record = featureRecordsById.get(index);
    if (!record) {
      return false;
    }

    selectedFeatureId = index;
    syncSourceData();
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
    for (const record of featureRecordsById.values()) {
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
    selectedFeatureId = null;
    syncSourceData();
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
  };

  elements.infoPanelCloseButton?.addEventListener("click", () => infoPanel.dismiss());
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
      for (const [featureId, record] of featureRecordsById.entries()) {
        if (intersectsBounds(record.bbox, viewBbox)) {
          indexes.push(featureId);
        }
      }
      return indexes;
    },
    getEngine: (): "maplibre" => "maplibre",
    renderFeatures,
    resize: (): void => {
      map?.resize();
    },
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
