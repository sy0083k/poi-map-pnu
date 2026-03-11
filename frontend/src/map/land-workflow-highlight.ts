import { loadUploadedHighlights, type HighlightLoadDebugInfo } from "./cadastral-fgb-layer";
import { createRenderedLandRecordMap } from "./rendered-land-records";

import type { FeatureDiffOptions, LandFeatureCollection, LandListItem, MapConfig, RenderedLandRecordMap, ThemeType } from "./types";

type FeatureIndexEntry = {
  featuresByPnu: Map<string, unknown>;
  sourceFeatureCount: number;
};

type HighlightDeps = {
  getConfig: () => MapConfig | null;
  getCurrentTheme: () => ThemeType;
  getCurrentItems: () => LandListItem[];
  getUploadedHighlightFeatures: () => LandFeatureCollection;
  setUploadedHighlightFeatures: (value: LandFeatureCollection) => void;
  getUploadedHighlightDatasetKey: () => string;
  setUploadedHighlightDatasetKey: (value: string) => void;
  getFeaturesByPnuIndex: (datasetKey: string) => FeatureIndexEntry | undefined;
  setFeaturesByPnuIndex: (datasetKey: string, entry: FeatureIndexEntry) => void;
  deleteFeaturesByPnuIndex: (datasetKey: string) => void;
  getUploadedHighlightsRequestSeq: () => number;
  setUploadedHighlightsRequestSeq: (value: number) => void;
  getHighlightLoadAbortController: () => AbortController | null;
  setHighlightLoadAbortController: (value: AbortController | null) => void;
  mapView: {
    applyFeatureDiff: (nextByPnu: RenderedLandRecordMap, options: FeatureDiffOptions) => Promise<number>;
    clearRenderedFeatures: () => void;
    getCurrentExtent: () => number[] | null;
    getEngine: () => "openlayers" | "maplibre";
    setHighlightDebugInfo?: (info: HighlightLoadDebugInfo | null) => void;
  };
  setMapStatus: (message: string, color?: string) => void;
  getThemeLabel: (theme: ThemeType) => string;
  updateNavigation: () => void;
  getLastRenderedSignature: () => string;
  setLastRenderedSignature: (value: string) => void;
};

const normalizePnu = (raw: unknown): string => String(raw ?? "").replace(/\D/g, "");
const getRenderProjection = (deps: HighlightDeps, config: MapConfig): MapConfig["cadastralCrs"] =>
  deps.mapView.getEngine() === "maplibre" ? "EPSG:4326" : config.cadastralCrs;

const getRuntimeDatasetKey = (deps: HighlightDeps): string => {
  const active = deps.getUploadedHighlightDatasetKey();
  if (active.trim() !== "") {
    return active;
  }
  return `runtime:${deps.getCurrentTheme()}`;
};

const getFeaturesByPnu = (deps: HighlightDeps, datasetKey: string): Map<string, unknown> => {
  const uploadedFeatures = deps.getUploadedHighlightFeatures().features;
  const existing = deps.getFeaturesByPnuIndex(datasetKey);
  if (existing && existing.sourceFeatureCount === uploadedFeatures.length) {
    return existing.featuresByPnu;
  }

  const rebuilt = new Map<string, unknown>();
  uploadedFeatures.forEach((feature) => {
    const pnu = normalizePnu(feature.properties.pnu);
    if (pnu) {
      rebuilt.set(pnu, feature.geometry);
    }
  });
  deps.setFeaturesByPnuIndex(datasetKey, { featuresByPnu: rebuilt, sourceFeatureCount: uploadedFeatures.length });
  return rebuilt;
};

export async function reloadCadastralLayers(deps: HighlightDeps): Promise<void> {
  const config = deps.getConfig();
  if (!config) {
    return;
  }

  const currentItems = deps.getCurrentItems();
  const datasetKey = getRuntimeDatasetKey(deps);
  const renderSignature = `${datasetKey}:${deps.getUploadedHighlightFeatures().features.length}:${currentItems.map((item) => item.id).join(",")}`;
  if (currentItems.length === 0) {
    if (deps.getLastRenderedSignature() === `${datasetKey}:${deps.getUploadedHighlightFeatures().features.length}:empty`) {
      deps.updateNavigation();
      return;
    }
    deps.mapView.clearRenderedFeatures();
    deps.mapView.setHighlightDebugInfo?.(null);
    deps.setMapStatus(`업로드 하이라이트 ${deps.getUploadedHighlightFeatures().features.length}건 준비됨`, "#166534");
    deps.setLastRenderedSignature(`${datasetKey}:${deps.getUploadedHighlightFeatures().features.length}:empty`);
    deps.updateNavigation();
    return;
  }

  if (deps.getLastRenderedSignature() === renderSignature) {
    deps.updateNavigation();
    return;
  }

  const featuresByPnu = getFeaturesByPnu(deps, datasetKey);

  const nextByPnu = createRenderedLandRecordMap(currentItems, featuresByPnu);
  await deps.mapView.applyFeatureDiff(nextByPnu, {
    dataProjection: getRenderProjection(deps, config),
    datasetKey
  });
  if (currentItems.length === 0) {
    deps.setMapStatus(`업로드 하이라이트 ${deps.getUploadedHighlightFeatures().features.length}건 준비됨`, "#166534");
  } else {
    deps.setMapStatus(`업로드 하이라이트 ${deps.getUploadedHighlightFeatures().features.length}건, ${deps.getThemeLabel(deps.getCurrentTheme())} 강조 ${nextByPnu.size}건`, "#166534");
  }
  deps.setLastRenderedSignature(renderSignature);
  deps.updateNavigation();
}

export async function prepareUploadedHighlights(deps: HighlightDeps, items: LandListItem[]): Promise<void> {
  const config = deps.getConfig();
  if (!config) {
    return;
  }

  deps.getHighlightLoadAbortController()?.abort();
  const uploadedPnus = Array.from(new Set(items.map((item) => item.pnu)));
  if (uploadedPnus.length === 0) {
    deps.setUploadedHighlightFeatures({ type: "FeatureCollection", features: [] });
    deps.setUploadedHighlightDatasetKey("empty");
    deps.mapView.clearRenderedFeatures();
    deps.mapView.setHighlightDebugInfo?.(null);
    return;
  }

  const seq = deps.getUploadedHighlightsRequestSeq() + 1;
  deps.setUploadedHighlightsRequestSeq(seq);
  deps.setUploadedHighlightDatasetKey(`loading:${deps.getCurrentTheme()}:${seq}`);
  deps.setLastRenderedSignature("");
  const controller = new AbortController();
  deps.setHighlightLoadAbortController(controller);
  let firstVisibleApplied = false;
  let frameRenderPending = false;

  const scheduleReload = (): void => {
    if (frameRenderPending) {
      return;
    }
    frameRenderPending = true;
    window.requestAnimationFrame(() => {
      frameRenderPending = false;
      void reloadCadastralLayers(deps);
    });
  };

  try {
    deps.setMapStatus("업로드 하이라이트를 준비하는 중입니다...");
    const loaded = await loadUploadedHighlights({
      fgbUrl: config.cadastralFgbUrl,
      pnuField: config.cadastralPnuField,
      cadastralCrs: config.cadastralCrs,
      outputCrs: getRenderProjection(deps, config),
      uploadedPnus,
      theme: deps.getCurrentTheme(),
      signal: controller.signal,
      onFeatures: (features, progress) => {
        if (seq !== deps.getUploadedHighlightsRequestSeq() || features.length === 0) {
          return;
        }
        deps.setUploadedHighlightFeatures({
          type: "FeatureCollection",
          features: [...deps.getUploadedHighlightFeatures().features, ...features]
        });
        deps.deleteFeaturesByPnuIndex(getRuntimeDatasetKey(deps));
        if (!firstVisibleApplied) {
          firstVisibleApplied = true;
          scheduleReload();
        } else {
          scheduleReload();
        }
        deps.setMapStatus(progress.fromCache ? `하이라이트 캐시 ${progress.matched}건 적용` : `하이라이트 매칭 ${progress.matched}/${progress.total}건 (스캔 ${progress.scanned.toLocaleString()}건)`, "#166534");
      },
      onProgress: (progress) => {
        if (seq === deps.getUploadedHighlightsRequestSeq() && !progress.done) {
          deps.setMapStatus(`하이라이트 매칭 ${progress.matched}/${progress.total}건 (스캔 ${progress.scanned.toLocaleString()}건)`, "#166534");
        }
      }
    });

    if (seq !== deps.getUploadedHighlightsRequestSeq()) {
      return;
    }
    deps.setUploadedHighlightDatasetKey(loaded.datasetKey);
    deps.setUploadedHighlightFeatures(loaded.collection);
    deps.mapView.setHighlightDebugInfo?.(loaded.debugInfo);
    await reloadCadastralLayers(deps);
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError")) {
      const message = error instanceof Error ? `업로드 하이라이트 준비 실패: ${error.message}` : "업로드 하이라이트 준비에 실패했습니다.";
      console.warn("[cadastral]", message);
      deps.setMapStatus(message, "#b45309");
    }
  } finally {
    if (deps.getHighlightLoadAbortController() === controller) {
      deps.setHighlightLoadAbortController(null);
    }
  }
}

export function hasMultipleManagers(items: LandListItem[]): string[] {
  return Array.from(new Set(items.map((item) => (item.property_manager || "").trim()).filter((value) => value !== "")));
}
