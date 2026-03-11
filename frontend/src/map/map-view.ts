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
import { haveRenderedPropertiesChanged, normalizeRenderedRecordPnu } from "./rendered-land-records";
import type { HighlightLoadDebugInfo } from "./cadastral-fgb-layer";
import type { BaseType, CadastralCrs, FeatureDiffOptions, LandFeatureCollection, MapConfig, RenderedLandRecord, RenderedLandRecordMap, ThemeType } from "./types";

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
  let featuresByPnu = new globalThis.Map<string, Feature<Geometry>>();
  let renderedRecordsByPnu = new globalThis.Map<string, RenderedLandRecord>();

  const readSingleFeature = (
    pnu: string,
    geometry: unknown,
    properties: Record<string, unknown>,
    options?: RenderOptions
  ): Feature<Geometry> | null => {
    const parsed = new GeoJSON().readFeature(
      { type: "Feature", geometry, properties },
      {
        dataProjection: options?.dataProjection ?? "EPSG:4326",
        featureProjection: "EPSG:3857"
      }
    );
    const feature = asVectorFeature(parsed);
    if (!feature) {
      return null;
    }
    feature.setId(pnu);
    return feature;
  };

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
      defaultStyleSelector: styles.defaultStyleSelector,
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
      const props = feature.getProperties() as Record<string, unknown>;
      const listIndex = props.list_index;
      if (typeof listIndex !== "number" || onFeatureClick === null) {
        return;
      }
      onFeatureClick({
        index: listIndex,
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
    const byId = new globalThis.Map<string, Feature<Geometry>>();
    const nextRecords = new globalThis.Map<string, RenderedLandRecord>();
    parsed.forEach((feature, idx) => {
      const props = feature.getProperties() as Record<string, unknown>;
      const pnu = normalizeRenderedRecordPnu(props.pnu ?? feature.getId() ?? idx);
      if (!pnu) {
        return;
      }
      feature.setId(pnu);
      byId.set(pnu, feature);
      nextRecords.set(pnu, {
        pnu,
        geometry: data.features[idx]?.geometry,
        properties: props
      });
    });
    featuresByPnu = byId;
    renderedRecordsByPnu = nextRecords;
    featureLayers.setFeatures(byId);
    return parsed.length;
  };

  const clearRenderedFeatures = (): void => {
    if (!featureLayers) {
      featuresByPnu = new globalThis.Map<string, Feature<Geometry>>();
      renderedRecordsByPnu = new globalThis.Map<string, RenderedLandRecord>();
      return;
    }
    featuresByPnu = new globalThis.Map<string, Feature<Geometry>>();
    renderedRecordsByPnu = new globalThis.Map<string, RenderedLandRecord>();
    featureLayers.setFeatures(new globalThis.Map<string, Feature<Geometry>>());
  };

  const applyFeatureDiff = async (
    nextByPnu: RenderedLandRecordMap,
    options: FeatureDiffOptions
  ): Promise<number> => {
    if (!featureLayers) {
      return 0;
    }

    const nextFeaturesByPnu = new globalThis.Map<string, Feature<Geometry>>();
    let accepted = 0;

    for (const [pnu, nextRecord] of nextByPnu.entries()) {
      const previousRecord = renderedRecordsByPnu.get(pnu);
      const previousFeature = featuresByPnu.get(pnu);
      if (
        previousRecord &&
        previousFeature &&
        previousRecord.geometry === nextRecord.geometry &&
        !haveRenderedPropertiesChanged(previousRecord.properties, nextRecord.properties)
      ) {
        nextFeaturesByPnu.set(pnu, previousFeature);
        accepted += 1;
        continue;
      }

      if (previousRecord && previousFeature && previousRecord.geometry === nextRecord.geometry) {
        previousFeature.setProperties({ ...nextRecord.properties }, true);
        nextFeaturesByPnu.set(pnu, previousFeature);
        accepted += 1;
        continue;
      }

      const parsed = readSingleFeature(
        pnu,
        nextRecord.geometry,
        nextRecord.properties as Record<string, unknown>,
        { dataProjection: options.dataProjection }
      );
      if (!parsed) {
        continue;
      }
      nextFeaturesByPnu.set(pnu, parsed);
      accepted += 1;
    }

    featuresByPnu = nextFeaturesByPnu;
    renderedRecordsByPnu = new globalThis.Map<string, RenderedLandRecord>(nextByPnu);
    featureLayers.setFeatures(nextFeaturesByPnu);
    return accepted;
  };

  const selectFeatureByIndex = (index: number, options: SelectOptions): boolean => {
    if (!map || !featureLayers) {
      return false;
    }
    let selectedPnu: string | null = null;
    for (const [pnu, feature] of featuresByPnu.entries()) {
      const props = feature.getProperties() as Record<string, unknown>;
      if (props.list_index === index) {
        selectedPnu = pnu;
        break;
      }
    }
    if (!selectedPnu) {
      return false;
    }
    const feature = featureLayers.getFeatureById(selectedPnu);
    if (!feature) {
      return false;
    }
    const geometry = feature.getGeometry();
    if (!geometry) {
      return false;
    }
    featureLayers.selectFeatureId(selectedPnu);
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

  const loadDebugProbe = async (
    _config: MapConfig,
    _setMapStatus: (message: string, color?: string) => void
  ): Promise<void> => {};
  const setHighlightDebugInfo = (_info: HighlightLoadDebugInfo | null): void => {};

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
        const props = feature.getProperties() as Record<string, unknown>;
        const listIndex = props.list_index;
        if (!geometry || typeof listIndex !== "number") {
          continue;
        }
        if (intersectsViewport(geometry, extent)) {
          indexes.push(listIndex);
        }
      }
      return indexes;
    },
    getCurrentZoom: (): number | null => (map && typeof map.getView().getZoom() === "number" ? (map.getView().getZoom() as number) : null),
    applyFeatureDiff,
    clearRenderedFeatures,
    renderFeatures,
    resize: (): void => map?.updateSize(),
    loadDebugProbe,
    setHighlightDebugInfo,
    selectFeatureByIndex,
    setFeatureClickHandler: (handler: (payload: FeatureClickPayload) => void): void => { onFeatureClick = handler; },
    setMoveEndHandler: (handler: (() => void) | null): void => { onMoveEnd = handler; },
    setTheme,
    getEngine: (): "openlayers" => "openlayers"
  };
}

export type MapView = ReturnType<typeof createMapView>;
