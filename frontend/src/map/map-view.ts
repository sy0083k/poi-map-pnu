import Feature from "ol/Feature";
import GeoJSON from "ol/format/GeoJSON";
import type Geometry from "ol/geom/Geometry";
import Map from "ol/Map";
import View from "ol/View";
import { createEmpty, extend, getCenter } from "ol/extent";
import { fromLonLat } from "ol/proj";
import { applyBasemapType, createBasemapLayers } from "./map-view-basemap";
import { createMapViewFeatureLayers } from "./map-view-feature-layers";
import { createMapViewInfoPanel } from "./map-view-info-panel";
import { createMapViewStyles } from "./map-view-styles";
import type { BaseType, CadastralCrs, LandFeatureCollection, MapConfig, ThemeType } from "./types";

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

function asVectorFeature(feature: unknown): Feature<Geometry> | null {
  return feature instanceof Feature ? feature : null;
}

function intersectsViewport(geometry: Geometry, extent: number[]): boolean {
  const candidate = geometry as Geometry & { intersectsExtent?: (target: number[]) => boolean };
  if (typeof candidate.intersectsExtent === "function") {
    return candidate.intersectsExtent(extent);
  }
  const [aMinX, aMinY, aMaxX, aMaxY] = geometry.getExtent();
  const [bMinX, bMinY, bMaxX, bMaxY] = extent;
  return aMinX <= bMaxX && aMaxX >= bMinX && aMinY <= bMaxY && aMaxY >= bMinY;
}

export function createMapView(elements: MapViewElements) {
  let map: Map | null = null;
  let basemapLayers: ReturnType<typeof createBasemapLayers> | null = null;
  let currentTheme: ThemeType = "national_public";
  let onFeatureClick: ((payload: FeatureClickPayload) => void) | null = null;
  let onMoveEnd: (() => void) | null = null;

  const styles = createMapViewStyles(() => currentTheme);
  const infoPanel = createMapViewInfoPanel({
    infoPanelElement: elements.infoPanelElement,
    infoPanelContent: elements.infoPanelContent
  });
  let featureLayers: ReturnType<typeof createMapViewFeatureLayers> | null = null;

  const init = (config: MapConfig): void => {
    basemapLayers = createBasemapLayers(config.vworldKey);

    map = new Map({
      target: "map",
      layers: [basemapLayers.baseLayer, basemapLayers.whiteLayer, basemapLayers.satLayer, basemapLayers.hybLayer],
      view: new View({
        center: fromLonLat(config.center),
        zoom: config.zoom,
        maxZoom: 22,
        minZoom: 7,
        constrainResolution: false
      })
    });

    featureLayers = createMapViewFeatureLayers({
      map,
      webglBaseStyle: styles.webglBaseStyle,
      selectedStyleSelector: styles.selectedStyleSelector
    });

    map.on("singleclick", (evt) => {
      if (!map || !featureLayers) {
        return;
      }
      const clickedFeature = map.forEachFeatureAtPixel(evt.pixel, (item) => item);
      const feature = asVectorFeature(clickedFeature);
      if (!feature) {
        featureLayers.selectFeatureId(null);
        infoPanel.clear();
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

    map.on("moveend", () => onMoveEnd?.());
  };

  const changeLayer = (type: BaseType): void => {
    if (!map || !basemapLayers) {
      return;
    }
    applyBasemapType(basemapLayers, map.getView(), type);
  };

  const renderFeatures = (data: LandFeatureCollection, options?: RenderOptions): number => {
    if (!map || !featureLayers) {
      return 0;
    }
    const parsed = new GeoJSON().readFeatures(data, {
      dataProjection: options?.dataProjection ?? "EPSG:4326",
      featureProjection: "EPSG:3857"
    }) as Feature<Geometry>[];
    const byId = new globalThis.Map<number, Feature<Geometry>>();
    parsed.forEach((feature, idx) => {
      const props = feature.getProperties() as Record<string, unknown>;
      const listIndex = props.list_index;
      const featureId = typeof listIndex === "number" ? listIndex : idx;
      feature.setId(featureId);
      byId.set(featureId, feature);
    });
    featureLayers.setFeatures(byId);
    return parsed.length;
  };

  const selectFeatureByIndex = (index: number, options: SelectOptions): boolean => {
    if (!map || !featureLayers) {
      return false;
    }
    const feature = featureLayers.getFeatureById(index);
    if (!feature) {
      return false;
    }
    const geometry = feature.getGeometry();
    if (!geometry) {
      return false;
    }
    featureLayers.selectFeatureId(index);
    map.renderSync();
    infoPanel.renderFeatureInfo(feature);

    if (!options.shouldFit) {
      return true;
    }
    const extent = geometry.getExtent();
    const focusCoord = getCenter(extent);
    const [minX, minY, maxX, maxY] = extent;
    const isPointLike = minX === maxX && minY === maxY;
    window.requestAnimationFrame(() => {
      if (!map) {
        return;
      }
      const view = map.getView();
      if (isPointLike) {
        view.animate({ center: focusCoord, duration: 300 });
        const zoomLevel = view.getZoom();
        if (typeof zoomLevel === "number" && zoomLevel < 19) {
          view.setZoom(19);
        }
        return;
      }
      view.fit(extent, { padding: [100, 100, 100, 100], duration: 300, maxZoom: 19 });
    });
    return true;
  };

  const fitToFeatures = (): void => {
    if (!map || !featureLayers) {
      return;
    }
    const extent = createEmpty();
    let hasGeometry = false;
    for (const feature of featureLayers.getAllFeatures()) {
      const geometry = feature.getGeometry();
      if (!geometry) {
        continue;
      }
      extend(extent, geometry.getExtent());
      hasGeometry = true;
    }
    if (!hasGeometry) {
      return;
    }
    map.getView().fit(extent, { padding: [50, 50, 50, 50], duration: 500 });
  };

  const clearInfoPanel = (): void => {
    featureLayers?.selectFeatureId(null);
    infoPanel.clear();
  };

  const clearInfoPanelContentOnly = (): void => {
    infoPanel.clear();
  };

  const setTheme = (theme: ThemeType): void => {
    currentTheme = theme;
    featureLayers?.refreshTheme();
  };

  elements.infoPanelCloseButton?.addEventListener("click", () => infoPanel.dismiss());
  infoPanel.clear();

  return {
    changeLayer,
    clearInfoPanel,
    clearInfoPanelContentOnly,
    fitToFeatures,
    init,
    getCurrentExtent: (): number[] | null => (map ? map.getView().calculateExtent(map.getSize()) : null),
    getMap: (): Map | null => map,
    getVisibleListIndexes: (): number[] => {
      if (!map || !featureLayers) {
        return [];
      }
      const size = map.getSize();
      if (!size) {
        return [];
      }
      const extent = map.getView().calculateExtent(size);
      const indexes: number[] = [];
      for (const feature of featureLayers.getAllFeatures()) {
        const geometry = feature.getGeometry();
        const featureId = feature.getId();
        if (!geometry || typeof featureId !== "number") {
          continue;
        }
        if (intersectsViewport(geometry, extent)) {
          indexes.push(featureId);
        }
      }
      return indexes;
    },
    getCurrentZoom: (): number | null => (map && typeof map.getView().getZoom() === "number" ? (map.getView().getZoom() as number) : null),
    renderFeatures,
    resize: (): void => map?.updateSize(),
    selectFeatureByIndex,
    setFeatureClickHandler: (handler: (payload: FeatureClickPayload) => void): void => { onFeatureClick = handler; },
    setMoveEndHandler: (handler: (() => void) | null): void => { onMoveEnd = handler; },
    setTheme
  };
}

export type MapView = ReturnType<typeof createMapView>;
