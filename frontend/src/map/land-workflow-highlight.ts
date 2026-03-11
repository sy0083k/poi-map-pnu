import { loadUploadedHighlights, type HighlightLoadDebugInfo } from "./cadastral-fgb-layer";
import { computeGeometryBbox, createRenderedLandRecordMap, type HighlightGeometryRecord } from "./rendered-land-records";

import type { FeatureDelta, FeatureDiffOptions, LandFeatureCollection, LandListItem, MapConfig, RenderedLandRecordMap, ThemeType } from "./types";

type FeatureIndexEntry = {
  recordsByPnu: Map<string, HighlightGeometryRecord>;
  sourceFeatureCount: number;
};

type ReloadOptions = {
  prioritizeIndex?: number;
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
    applyFeatureDelta?: (delta: FeatureDelta, options: FeatureDiffOptions) => Promise<number>;
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
  getPendingRenderSignature: () => string;
  setPendingRenderSignature: (value: string) => void;
  getRenderRequestSeq: () => number;
  setRenderRequestSeq: (value: number) => void;
  getCurrentIndex: () => number;
};

const normalizePnu = (raw: unknown): string => String(raw ?? "").replace(/\D/g, "");
const DEFAULT_VISIBLE_SEED_SIZE = 200;
const DEFAULT_BACKGROUND_CHUNK_SIZE = 150;
const getRenderProjection = (deps: HighlightDeps, config: MapConfig): MapConfig["cadastralCrs"] =>
  deps.mapView.getEngine() === "maplibre" ? "EPSG:4326" : config.cadastralCrs;

const getRuntimeDatasetKey = (deps: HighlightDeps): string => {
  const active = deps.getUploadedHighlightDatasetKey();
  if (active.trim() !== "") {
    return active;
  }
  return `runtime:${deps.getCurrentTheme()}`;
};

const getFeaturesByPnu = (deps: HighlightDeps, datasetKey: string): Map<string, HighlightGeometryRecord> => {
  const uploadedFeatures = deps.getUploadedHighlightFeatures().features;
  const existing = deps.getFeaturesByPnuIndex(datasetKey);
  if (existing && existing.sourceFeatureCount === uploadedFeatures.length) {
    return existing.recordsByPnu;
  }

  const rebuilt = new Map<string, HighlightGeometryRecord>();
  uploadedFeatures.forEach((feature) => {
    const pnu = normalizePnu(feature.properties.pnu);
    if (pnu) {
      rebuilt.set(pnu, {
        geometry: feature.geometry,
        bbox:
          Array.isArray(feature.properties.bbox) &&
          feature.properties.bbox.length === 4 &&
          feature.properties.bbox.every((value) => typeof value === "number" && Number.isFinite(value))
            ? feature.properties.bbox
            : computeGeometryBbox(feature.geometry)
      });
    }
  });
  deps.setFeaturesByPnuIndex(datasetKey, { recordsByPnu: rebuilt, sourceFeatureCount: uploadedFeatures.length });
  return rebuilt;
};

function createVisibleFirstItemOrder(
  items: LandListItem[],
  featuresByPnu: Map<string, HighlightGeometryRecord>,
  extent: number[] | null,
  prioritizeIndex: number | null
): { priorityItems: LandListItem[]; remainingItems: LandListItem[] } {
  const priorityIndexes = new Set<number>();
  const visibleExtent =
    extent && extent.length === 4
      ? ([extent[0], extent[1], extent[2], extent[3]] as [number, number, number, number])
      : null;

  if (visibleExtent) {
    items.forEach((item, index) => {
      const geometryRecord = featuresByPnu.get(normalizePnu(item.pnu));
      const bbox = geometryRecord?.bbox;
      if (bbox && bbox[0] <= visibleExtent[2] && bbox[2] >= visibleExtent[0] && bbox[1] <= visibleExtent[3] && bbox[3] >= visibleExtent[1]) {
        priorityIndexes.add(index);
      }
    });
  }

  if (typeof prioritizeIndex === "number" && prioritizeIndex >= 0 && prioritizeIndex < items.length) {
    priorityIndexes.add(prioritizeIndex);
  }

  if (priorityIndexes.size === 0) {
    const seedCount = Math.min(DEFAULT_VISIBLE_SEED_SIZE, items.length);
    for (let index = 0; index < seedCount; index += 1) {
      priorityIndexes.add(index);
    }
  }

  const priorityItems: LandListItem[] = [];
  const remainingItems: LandListItem[] = [];
  items.forEach((item, index) => {
    if (priorityIndexes.has(index)) {
      priorityItems.push(item);
      return;
    }
    remainingItems.push(item);
  });
  return { priorityItems, remainingItems };
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

function buildListIndexByPnu(items: LandListItem[]): Map<string, number> {
  const next = new Map<string, number>();
  items.forEach((item, index) => {
    const normalizedPnu = normalizePnu(item.pnu);
    if (!normalizedPnu) {
      return;
    }
    next.set(normalizedPnu, index);
  });
  return next;
}

function isMapDebugEnabled(): boolean {
  return new URLSearchParams(window.location.search).get("debugMap") === "1";
}

function measureRenderStep<T>(name: string, action: () => Promise<T>): Promise<T> {
  if (!isMapDebugEnabled() || typeof performance === "undefined") {
    return action();
  }
  const start = performance.now();
  return action().finally(() => {
    console.info(`[render] ${name}: ${(performance.now() - start).toFixed(1)}ms`);
  });
}

export async function reloadCadastralLayers(
  deps: HighlightDeps,
  options?: ReloadOptions
): Promise<void> {
  const config = deps.getConfig();
  if (!config) {
    return;
  }

  const currentItems = deps.getCurrentItems();
  const datasetKey = getRuntimeDatasetKey(deps);
  const renderSignature = `${datasetKey}:${deps.getUploadedHighlightFeatures().features.length}:${currentItems.map((item) => item.id).join(",")}`;
  if (currentItems.length === 0) {
    deps.setRenderRequestSeq(deps.getRenderRequestSeq() + 1);
    deps.setPendingRenderSignature("");
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
  if (deps.getPendingRenderSignature() === renderSignature && options?.prioritizeIndex === undefined) {
    deps.updateNavigation();
    return;
  }

  const featuresByPnu = getFeaturesByPnu(deps, datasetKey);
  const listIndexByPnu = buildListIndexByPnu(currentItems);
  const renderRequestSeq = deps.getRenderRequestSeq() + 1;
  deps.setRenderRequestSeq(renderRequestSeq);
  deps.setPendingRenderSignature(renderSignature);

  const prioritizedIndex =
    options?.prioritizeIndex !== undefined ? options.prioritizeIndex : deps.getCurrentIndex();
  const { priorityItems, remainingItems } = createVisibleFirstItemOrder(
    currentItems,
    featuresByPnu,
    deps.mapView.getCurrentExtent(),
    prioritizedIndex >= 0 ? prioritizedIndex : null
  );

  let stagedByPnu = createRenderedLandRecordMap(priorityItems, featuresByPnu, listIndexByPnu);
  if (stagedByPnu.size === 0) {
    stagedByPnu = createRenderedLandRecordMap(
      currentItems.slice(0, DEFAULT_VISIBLE_SEED_SIZE),
      featuresByPnu,
      listIndexByPnu
    );
  }

  await measureRenderStep("highlight-seed", () =>
    deps.mapView.applyFeatureDiff(stagedByPnu, {
      dataProjection: getRenderProjection(deps, config),
      datasetKey
    })
  );
  if (renderRequestSeq !== deps.getRenderRequestSeq()) {
    return;
  }

  deps.setMapStatus(
    `업로드 하이라이트 ${deps.getUploadedHighlightFeatures().features.length}건, ${deps.getThemeLabel(deps.getCurrentTheme())} 강조 ${stagedByPnu.size}/${currentItems.length}건`,
    "#166534"
  );
  deps.updateNavigation();

  const remainderChunks = chunkItems(remainingItems, DEFAULT_BACKGROUND_CHUNK_SIZE);
  for (const remainderChunk of remainderChunks) {
    await nextAnimationFrame();
    if (renderRequestSeq !== deps.getRenderRequestSeq()) {
      return;
    }
    const nextChunkByPnu = createRenderedLandRecordMap(remainderChunk, featuresByPnu, listIndexByPnu);
    nextChunkByPnu.forEach((value, key) => {
      stagedByPnu.set(key, value);
    });
    if (deps.mapView.applyFeatureDelta) {
      await measureRenderStep(`highlight-delta-${nextChunkByPnu.size}`, () =>
        deps.mapView.applyFeatureDelta!(
          { addOrUpdate: nextChunkByPnu },
          {
            dataProjection: getRenderProjection(deps, config),
            datasetKey
          }
        )
      );
    } else {
      await measureRenderStep(`highlight-diff-${stagedByPnu.size}`, () =>
        deps.mapView.applyFeatureDiff(stagedByPnu, {
          dataProjection: getRenderProjection(deps, config),
          datasetKey
        })
      );
    }
    if (renderRequestSeq !== deps.getRenderRequestSeq()) {
      return;
    }
    deps.setMapStatus(
      `업로드 하이라이트 ${deps.getUploadedHighlightFeatures().features.length}건, ${deps.getThemeLabel(deps.getCurrentTheme())} 강조 ${stagedByPnu.size}/${currentItems.length}건`,
      "#166534"
    );
  }

  if (renderRequestSeq !== deps.getRenderRequestSeq()) {
    return;
  }
  deps.setPendingRenderSignature("");
  deps.setLastRenderedSignature(renderSignature);
  deps.setMapStatus(
    `업로드 하이라이트 ${deps.getUploadedHighlightFeatures().features.length}건, ${deps.getThemeLabel(deps.getCurrentTheme())} 강조 ${stagedByPnu.size}건`,
    "#166534"
  );
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
    deps.setRenderRequestSeq(deps.getRenderRequestSeq() + 1);
    deps.setPendingRenderSignature("");
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
