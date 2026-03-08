import Feature from "ol/Feature";
import type Geometry from "ol/geom/Geometry";
import VectorLayer from "ol/layer/Vector";
import type Map from "ol/Map";
import VectorSource from "ol/source/Vector";
import Style from "ol/style/Style";

type LayerDeps = {
  map: Map;
  defaultStyleSelector: (feature: Feature<Geometry>) => Style;
  selectedFeatureStyle: Style;
};

export function createMapViewFeatureLayers(deps: LayerDeps) {
  let vectorLayer: VectorLayer<VectorSource<Feature<Geometry>>> | null = null;
  let selectedVectorLayer: VectorLayer<VectorSource<Feature<Geometry>>> | null = null;
  let selectedFeatureId: number | null = null;
  let featuresById = new globalThis.Map<number, Feature<Geometry>>();

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
        style: deps.selectedFeatureStyle
      });
      deps.map.addLayer(selectedVectorLayer);
    }
    return true;
  };

  const render = (): void => {
    if (!ensureLayers()) {
      return;
    }
    const baseSource = vectorLayer?.getSource();
    const selectedSource = selectedVectorLayer?.getSource();
    if (!baseSource || !selectedSource) {
      return;
    }
    baseSource.clear();
    selectedSource.clear();

    for (const [featureId, feature] of featuresById.entries()) {
      if (selectedFeatureId !== null && featureId === selectedFeatureId) {
        selectedSource.addFeature(feature);
      } else {
        baseSource.addFeature(feature);
      }
    }
  };

  const setFeatures = (next: globalThis.Map<number, Feature<Geometry>>): void => {
    featuresById = next;
    if (selectedFeatureId !== null && !featuresById.has(selectedFeatureId)) {
      selectedFeatureId = null;
    }
    render();
  };

  const selectFeatureId = (featureId: number | null): void => {
    selectedFeatureId = featureId;
    render();
  };

  const refreshTheme = (): void => {
    vectorLayer?.changed();
  };

  const getFeatureById = (id: number): Feature<Geometry> | null => featuresById.get(id) ?? null;
  const getAllFeatures = (): Iterable<Feature<Geometry>> => featuresById.values();

  ensureLayers();

  return {
    getAllFeatures,
    getFeatureById,
    refreshTheme,
    render,
    selectFeatureId,
    setFeatures
  };
}
