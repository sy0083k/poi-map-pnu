import Feature from "ol/Feature";
import GeoJSON from "ol/format/GeoJSON";
import type Geometry from "ol/geom/Geometry";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import Map from "ol/Map";
import View from "ol/View";
import { createEmpty, extend, getCenter } from "ol/extent";
import { fromLonLat } from "ol/proj";
import VectorSource from "ol/source/Vector";
import XYZ from "ol/source/XYZ";
import Fill from "ol/style/Fill";
import Stroke from "ol/style/Stroke";
import Style from "ol/style/Style";

import type {
  BaseType,
  CadastralCrs,
  LandFeatureCollection,
  LandFeatureProperties,
  LandSourceField,
  MapConfig
} from "./types";

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

const WMTS_LAYER_BY_BASE_TYPE: Record<BaseType, "Base" | "white" | "Satellite" | "Hybrid"> = {
  Base: "Base",
  White: "white",
  Satellite: "Satellite",
  Hybrid: "Hybrid"
};

const BASEMAP_MAX_ZOOM: Record<BaseType, number> = {
  Base: 19,
  White: 18,
  Satellite: 19,
  Hybrid: 19
};

function asVectorFeature(feature: unknown): Feature<Geometry> | null {
  return feature instanceof Feature ? feature : null;
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

function normalizeInline(value: string): string {
  return value.replace(/[\r\n\t]+/g, " ").trim();
}

function isLandSourceField(value: unknown): value is LandSourceField {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as { key?: unknown; label?: unknown; value?: unknown };
  return typeof candidate.key === "string" && typeof candidate.label === "string" && typeof candidate.value === "string";
}

export function createMapView(elements: MapViewElements) {
  let map: Map | null = null;
  let baseLayer: TileLayer<XYZ> | null = null;
  let whiteLayer: TileLayer<XYZ> | null = null;
  let satLayer: TileLayer<XYZ> | null = null;
  let hybLayer: TileLayer<XYZ> | null = null;
  let vectorLayer: VectorLayer<VectorSource<Feature<Geometry>>> | null = null;
  let selectedVectorLayer: VectorLayer<VectorSource<Feature<Geometry>>> | null = null;
  let selectedFeatureId: number | null = null;
  let allFeaturesById = new globalThis.Map<number, Feature<Geometry>>();
  let onFeatureClick: ((payload: FeatureClickPayload) => void) | null = null;
  let onMoveEnd: (() => void) | null = null;
  let isInfoPanelDismissedByUser = true;
  const defaultFeatureStyle = new Style({
    stroke: new Stroke({ color: "#ff3333", width: 3 }),
    fill: new Fill({ color: "rgba(255, 51, 51, 0.2)" })
  });
  const selectedFeatureStyle = new Style({
    stroke: new Stroke({ color: "#ffd400", width: 4 }),
    fill: new Fill({ color: "rgba(255, 212, 0, 0.18)" })
  });

  const removeFeatureLayers = (): void => {
    if (!map) {
      return;
    }
    if (vectorLayer) {
      map.removeLayer(vectorLayer);
      vectorLayer = null;
    }
    if (selectedVectorLayer) {
      map.removeLayer(selectedVectorLayer);
      selectedVectorLayer = null;
    }
  };

  const ensureFeatureLayers = (): boolean => {
    if (!map) {
      return false;
    }
    if (!vectorLayer) {
      vectorLayer = new VectorLayer({
        source: new VectorSource<Feature<Geometry>>(),
        zIndex: 10,
        style: defaultFeatureStyle
      });
      map.addLayer(vectorLayer);
    }
    if (!selectedVectorLayer) {
      selectedVectorLayer = new VectorLayer({
        source: new VectorSource<Feature<Geometry>>(),
        zIndex: 11,
        style: selectedFeatureStyle
      });
      map.addLayer(selectedVectorLayer);
    }
    return true;
  };

  const renderFeatureLayers = (): void => {
    if (!ensureFeatureLayers()) {
      return;
    }
    const baseSource = vectorLayer?.getSource();
    const selectedSource = selectedVectorLayer?.getSource();
    if (!baseSource || !selectedSource) {
      return;
    }
    baseSource.clear();
    selectedSource.clear();

    for (const [featureId, feature] of allFeaturesById.entries()) {
      if (selectedFeatureId !== null && featureId === selectedFeatureId) {
        selectedSource.addFeature(feature);
      } else {
        baseSource.addFeature(feature);
      }
    }
  };

  const renderInfoRows = (rows: LandSourceField[]): void => {
    elements.infoPanelContent.replaceChildren();

    if (rows.length === 0) {
      const empty = document.createElement("div");
      empty.className = "land-info-empty";
      empty.textContent = "표시할 상세 정보가 없습니다.";
      elements.infoPanelContent.appendChild(empty);
      return;
    }

    rows.forEach((row) => {
      const keyCell = document.createElement("div");
      keyCell.className = "land-info-key";
      keyCell.textContent = normalizeInline(row.label);

      const valueCell = document.createElement("div");
      valueCell.className = "land-info-val";
      valueCell.textContent = normalizeInline(row.value);

      elements.infoPanelContent.append(keyCell, valueCell);
    });
  };

  const showInfoPanel = (): void => {
    elements.infoPanelElement.classList.remove("is-hidden");
  };

  const dismissInfoPanel = (): void => {
    isInfoPanelDismissedByUser = true;
    elements.infoPanelElement.classList.add("is-hidden");
  };

  const renderInfoPanel = (feature: Feature<Geometry>): void => {
    const props = feature.getProperties() as LandFeatureProperties;
    const fields = Array.isArray(props.source_fields)
      ? props.source_fields.filter((item) => isLandSourceField(item))
      : [];

    if (fields.length > 0) {
      renderInfoRows(fields);
      isInfoPanelDismissedByUser = false;
      showInfoPanel();
      elements.infoPanelElement.classList.add("has-selection");
      return;
    }

    const fallback: LandSourceField[] = [
      { key: "pnu", label: "PNU", value: stringifyValue(props.pnu) },
      { key: "address", label: "주소", value: stringifyValue(props.address) },
      { key: "area", label: "면적", value: props.area ? `${props.area}㎡` : "" },
      { key: "land_type", label: "지목", value: stringifyValue(props.land_type) },
      { key: "property_manager", label: "재산관리관", value: stringifyValue(props.property_manager) }
    ].filter((item) => item.value !== "");

    renderInfoRows(fallback);
    isInfoPanelDismissedByUser = false;
    showInfoPanel();
    elements.infoPanelElement.classList.add("has-selection");
  };

  const init = (config: MapConfig): void => {
    const commonSource = (type: BaseType) => {
      const wmtsLayer = WMTS_LAYER_BY_BASE_TYPE[type];
      return new XYZ({
        url: `https://api.vworld.kr/req/wmts/1.0.0/${config.vworldKey}/${wmtsLayer}/{z}/{y}/{x}.${wmtsLayer === "Satellite" ? "jpeg" : "png"}`,
        crossOrigin: "anonymous"
      });
    };

    baseLayer = new TileLayer({ source: commonSource("Base"), visible: false, zIndex: 0 });
    whiteLayer = new TileLayer({ source: commonSource("White"), visible: false, zIndex: 0 });
    satLayer = new TileLayer({ source: commonSource("Satellite"), visible: true, zIndex: 0 });
    hybLayer = new TileLayer({ source: commonSource("Hybrid"), visible: false, zIndex: 1 });

    map = new Map({
      target: "map",
      layers: [baseLayer, whiteLayer, satLayer, hybLayer],
      view: new View({
        center: fromLonLat(config.center),
        zoom: config.zoom,
        maxZoom: 22,
        minZoom: 7,
        constrainResolution: false
      })
    });

    map.on("singleclick", (evt) => {
      if (!map) {
        return;
      }

      const clickedFeature = map.forEachFeatureAtPixel(evt.pixel, (item) => item);
      const feature = asVectorFeature(clickedFeature);
      if (!feature) {
        selectedFeatureId = null;
        vectorLayer?.changed();
        clearInfoPanel();
        return;
      }

      const idx = feature.getId();
      if (idx === undefined || onFeatureClick === null) {
        return;
      }

      onFeatureClick({
        index: Number(idx),
        coordinate: evt.coordinate as number[]
      });
    });

    map.on("moveend", () => {
      onMoveEnd?.();
    });
    ensureFeatureLayers();
  };

  const changeLayer = (type: BaseType): void => {
    if (!map || !baseLayer || !whiteLayer || !satLayer || !hybLayer) {
      return;
    }

    const view = map.getView();
    const zoomLevel = view.getZoom();
    const maxZoomForType = BASEMAP_MAX_ZOOM[type];
    if (typeof zoomLevel === "number" && zoomLevel > maxZoomForType) {
      view.setZoom(maxZoomForType);
    }

    baseLayer.setVisible(type === "Base");
    whiteLayer.setVisible(type === "White");
    satLayer.setVisible(type === "Satellite" || type === "Hybrid");
    hybLayer.setVisible(type === "Hybrid");

  };

  const renderFeatures = (data: LandFeatureCollection, options?: RenderOptions): number => {
    if (!map) {
      return 0;
    }

    allFeaturesById = new globalThis.Map<number, Feature<Geometry>>();
    const parsed = new GeoJSON().readFeatures(data, {
      dataProjection: options?.dataProjection ?? "EPSG:4326",
      featureProjection: "EPSG:3857"
    }) as Feature<Geometry>[];

    parsed.forEach((feature, idx) => {
      const props = feature.getProperties() as Record<string, unknown>;
      const listIndex = props.list_index;
      const featureId = typeof listIndex === "number" ? listIndex : idx;
      feature.setId(featureId);
      allFeaturesById.set(featureId, feature);
    });

    if (selectedFeatureId !== null && !allFeaturesById.has(selectedFeatureId)) {
      selectedFeatureId = null;
    }

    renderFeatureLayers();
    return parsed.length;
  };

  const fitToFeatures = (): void => {
    if (!map || allFeaturesById.size === 0) {
      return;
    }

    const extent = createEmpty();
    for (const feature of allFeaturesById.values()) {
      const geometry = feature.getGeometry();
      if (!geometry) {
        continue;
      }
      extend(extent, geometry.getExtent());
    }
    map.getView().fit(extent, { padding: [50, 50, 50, 50], duration: 500 });
  };

  const selectFeatureByIndex = (index: number, options: SelectOptions): boolean => {
    if (!map) {
      return false;
    }

    const feature = allFeaturesById.get(index) ?? null;
    if (!feature) {
      return false;
    }

    const geometry = feature.getGeometry();
    if (!geometry) {
      return false;
    }
    selectedFeatureId = index;
    renderFeatureLayers();
    map.renderSync();

    const extent = geometry.getExtent();
    const focusCoord = getCenter(extent);

    renderInfoPanel(feature);

    if (options.shouldFit) {
      const [minX, minY, maxX, maxY] = extent;
      const isPointLike = minX === maxX && minY === maxY;
      window.requestAnimationFrame(() => {
        const currentMap = map;
        if (!currentMap) {
          return;
        }
        const view = currentMap.getView();
        if (isPointLike) {
          view.animate({
            center: focusCoord,
            duration: 300
          });
          const zoomLevel = view.getZoom();
          if (typeof zoomLevel === "number" && zoomLevel < 19) {
            view.setZoom(19);
          }
          return;
        }
        view.fit(extent, {
          padding: [100, 100, 100, 100],
          duration: 300,
          maxZoom: 19
        });
      });
    }

    return true;
  };

  const clearInfoPanel = (): void => {
    selectedFeatureId = null;
    renderFeatureLayers();
    elements.infoPanelContent.replaceChildren();
    const empty = document.createElement("div");
    empty.className = "land-info-empty";
    empty.textContent = "토지를 선택하면 상세 정보가 표시됩니다.";
    elements.infoPanelContent.appendChild(empty);
    elements.infoPanelElement.classList.remove("has-selection");
    if (!isInfoPanelDismissedByUser) {
      showInfoPanel();
    }
  };

  const getCurrentExtent = (): number[] | null => {
    if (!map) {
      return null;
    }
    return map.getView().calculateExtent(map.getSize());
  };

  const getCurrentZoom = (): number | null => {
    if (!map) {
      return null;
    }
    const zoom = map.getView().getZoom();
    return typeof zoom === "number" ? zoom : null;
  };

  const setFeatureClickHandler = (handler: (payload: FeatureClickPayload) => void): void => {
    onFeatureClick = handler;
  };

  const setMoveEndHandler = (handler: (() => void) | null): void => {
    onMoveEnd = handler;
  };

  const resize = (): void => {
    map?.updateSize();
  };

  elements.infoPanelCloseButton?.addEventListener("click", () => {
    dismissInfoPanel();
  });

  clearInfoPanel();

  return {
    changeLayer,
    clearInfoPanel,
    fitToFeatures,
    init,
    getCurrentExtent,
    getCurrentZoom,
    renderFeatures,
    resize,
    selectFeatureByIndex,
    setFeatureClickHandler,
    setMoveEndHandler
  };
}

export type MapView = ReturnType<typeof createMapView>;
