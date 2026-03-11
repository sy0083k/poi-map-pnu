import Feature from "ol/Feature";
import type Geometry from "ol/geom/Geometry";
import VectorLayer from "ol/layer/Vector";
import type Map from "ol/Map";
import VectorSource from "ol/source/Vector";
import Style from "ol/style/Style";

type LayerDeps = {
  map: Map;
  defaultStyleSelector: (feature: Feature<Geometry>) => Style;
  selectedStyleSelector: (feature: Feature<Geometry>) => Style | Style[];
};

export function createMapViewFeatureLayers(deps: LayerDeps) {
  const selectionPulseTickMs = 100;
  let vectorLayer: VectorLayer<VectorSource<Feature<Geometry>>> | null = null;
  let selectedVectorLayer: VectorLayer<VectorSource<Feature<Geometry>>> | null = null;
  let selectedFeatureId: string | null = null;
  let featuresById = new globalThis.Map<string, Feature<Geometry>>();
  let selectionPulseTimerId: number | null = null;
  const reducedMotionMedia = window.matchMedia("(prefers-reduced-motion: reduce)");

  const stopSelectionPulse = (): void => {
    if (selectionPulseTimerId === null) {
      return;
    }
    window.clearInterval(selectionPulseTimerId);
    selectionPulseTimerId = null;
  };

  const startSelectionPulse = (): void => {
    if (selectionPulseTimerId !== null || !selectedVectorLayer) {
      return;
    }
    selectionPulseTimerId = window.setInterval(() => {
      selectedVectorLayer?.changed();
    }, selectionPulseTickMs);
  };

  const syncSelectionPulseState = (): void => {
    if (selectedFeatureId === null || reducedMotionMedia.matches) {
      stopSelectionPulse();
      return;
    }
    startSelectionPulse();
  };

  const ensureLayers = (): boolean => {
    if (!vectorLayer) {
      vectorLayer = new VectorLayer({
        source: new VectorSource<Feature<Geometry>>(),
        zIndex: 10,
        style: deps.defaultStyleSelector
      });
      deps.map.addLayer(vectorLayer);
    }
    if (!selectedVectorLayer) {
      selectedVectorLayer = new VectorLayer({
        source: new VectorSource<Feature<Geometry>>(),
        zIndex: 11,
        style: deps.selectedStyleSelector
      });
      deps.map.addLayer(selectedVectorLayer);
    }
    return true;
  };

  const getSources = (): { baseSource: VectorSource<Feature<Geometry>>; selectedSource: VectorSource<Feature<Geometry>> } | null => {
    if (!ensureLayers()) {
      return null;
    }
    const baseSource = vectorLayer?.getSource();
    const selectedSource = selectedVectorLayer?.getSource();
    if (!baseSource || !selectedSource) {
      return null;
    }
    return { baseSource, selectedSource };
  };

  const addFeatureToActiveSource = (
    featureId: string,
    feature: Feature<Geometry>,
    sources: { baseSource: VectorSource<Feature<Geometry>>; selectedSource: VectorSource<Feature<Geometry>> }
  ): void => {
    if (selectedFeatureId !== null && featureId === selectedFeatureId) {
      sources.selectedSource.addFeature(feature);
      return;
    }
    sources.baseSource.addFeature(feature);
  };

  const removeFeatureFromSources = (
    feature: Feature<Geometry>,
    sources: { baseSource: VectorSource<Feature<Geometry>>; selectedSource: VectorSource<Feature<Geometry>> }
  ): void => {
    sources.baseSource.removeFeature(feature);
    sources.selectedSource.removeFeature(feature);
  };

  const render = (): void => {
    const sources = getSources();
    if (!sources) {
      return;
    }
    const { baseSource, selectedSource } = sources;
    baseSource.clear();
    selectedSource.clear();

    for (const [featureId, feature] of featuresById.entries()) {
      addFeatureToActiveSource(featureId, feature, sources);
    }
  };

  const setFeatures = (next: globalThis.Map<string, Feature<Geometry>>): void => {
    const sources = getSources();
    if (!sources) {
      featuresById = next;
      return;
    }

    for (const [featureId, existingFeature] of featuresById.entries()) {
      const nextFeature = next.get(featureId);
      if (!nextFeature || nextFeature !== existingFeature) {
        removeFeatureFromSources(existingFeature, sources);
      }
    }

    for (const [featureId, nextFeature] of next.entries()) {
      const existingFeature = featuresById.get(featureId);
      if (!existingFeature || existingFeature !== nextFeature) {
        addFeatureToActiveSource(featureId, nextFeature, sources);
      }
    }

    featuresById = next;
    if (selectedFeatureId !== null && !featuresById.has(selectedFeatureId)) {
      selectedFeatureId = null;
    }
    syncSelectionPulseState();
  };

  const selectFeatureId = (featureId: string | null): void => {
    if (selectedFeatureId === featureId) {
      return;
    }
    const sources = getSources();
    if (!sources) {
      selectedFeatureId = featureId;
      return;
    }

    if (selectedFeatureId !== null) {
      const previousFeature = featuresById.get(selectedFeatureId);
      if (previousFeature) {
        sources.selectedSource.removeFeature(previousFeature);
        sources.baseSource.addFeature(previousFeature);
      }
    }

    selectedFeatureId = featureId;
    if (selectedFeatureId !== null) {
      const nextFeature = featuresById.get(selectedFeatureId);
      if (nextFeature) {
        sources.baseSource.removeFeature(nextFeature);
        sources.selectedSource.addFeature(nextFeature);
      } else {
        selectedFeatureId = null;
      }
    }
    syncSelectionPulseState();
  };

  const refreshTheme = (): void => {
    vectorLayer?.changed();
    selectedVectorLayer?.changed();
  };

  const getFeatureById = (id: string): Feature<Geometry> | null => featuresById.get(id) ?? null;
  const getAllFeatures = (): Iterable<Feature<Geometry>> => featuresById.values();

  ensureLayers();
  reducedMotionMedia.addEventListener("change", () => syncSelectionPulseState());

  return {
    getAllFeatures,
    getFeatureById,
    refreshTheme,
    render,
    selectFeatureId,
    setFeatures
  };
}
