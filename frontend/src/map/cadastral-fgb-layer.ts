import {
  buildCacheKey,
  dedupeByPnu,
  getCachedHighlights,
  getFgbEtag,
  normalizePnu,
  setCachedHighlights,
  throwIfAborted
} from "./cadastral-fgb-cache";
import { loadUploadedHighlightsFromApi } from "./cadastral-highlights-client";
import type { WorkerResponse, WorkerStartMessage } from "./cadastral-fgb-worker-types";

import type { CadastralCrs, LandFeature, LandFeatureCollection, ThemeType } from "./types";

export type HighlightLoadProgress = {
  scanned: number;
  matched: number;
  total: number;
  done: boolean;
  fromCache: boolean;
};
export async function loadUploadedHighlights(
  params: {
    fgbUrl: string;
    pnuField: string;
    cadastralCrs: CadastralCrs;
    uploadedPnus: string[];
    theme: ThemeType;
    bbox?: [number, number, number, number];
    bboxCrs?: CadastralCrs;
    signal?: AbortSignal;
    onFeatures?: (features: LandFeature[], progress: HighlightLoadProgress) => void;
    onProgress?: (progress: HighlightLoadProgress) => void;
  }
): Promise<LandFeatureCollection> {
  const { fgbUrl, pnuField, cadastralCrs, uploadedPnus, theme, bbox, bboxCrs, signal, onFeatures, onProgress } = params;
  const requestedPnuSet = new Set(uploadedPnus.map((item) => normalizePnu(item)).filter((item) => item.length === 19));
  if (requestedPnuSet.size === 0) {
    return { type: "FeatureCollection", features: [] };
  }
  throwIfAborted(signal);

  const normalizedPnus = Array.from(requestedPnuSet);
  const fgbEtag = await getFgbEtag(fgbUrl, signal);
  const bboxKey = bbox
    ? `bbox:${bbox[0].toFixed(2)},${bbox[1].toFixed(2)},${bbox[2].toFixed(2)},${bbox[3].toFixed(2)}:${bboxCrs ?? cadastralCrs}`
    : "bbox:none";
  const cacheKey = await buildCacheKey(theme, normalizedPnus, fgbEtag, bboxKey);
  const cached = await getCachedHighlights(cacheKey);
  if (cached) {
    const progress: HighlightLoadProgress = {
      scanned: 0,
      matched: cached.features.length,
      total: normalizedPnus.length,
      done: true,
      fromCache: true
    };
    onFeatures?.(cached.features, progress);
    onProgress?.(progress);
    return { type: "FeatureCollection", features: cached.features };
  }

  return loadUploadedHighlightsFromWorker({
    apiPayload: { theme, pnus: normalizedPnus, bbox, bboxCrs: bboxCrs ?? cadastralCrs },
    fgbUrl,
    pnuField,
    cadastralCrs,
    normalizedPnus,
    cacheKey,
    signal,
    onFeatures,
    onProgress
  });
}
async function loadUploadedHighlightsFromWorker(params: {
  apiPayload: { theme: ThemeType; pnus: string[]; bbox?: [number, number, number, number]; bboxCrs: CadastralCrs };
  fgbUrl: string;
  pnuField: string;
  cadastralCrs: CadastralCrs;
  normalizedPnus: string[];
  cacheKey: string;
  signal?: AbortSignal;
  onFeatures?: (features: LandFeature[], progress: HighlightLoadProgress) => void;
  onProgress?: (progress: HighlightLoadProgress) => void;
}): Promise<LandFeatureCollection> {
  const { apiPayload, fgbUrl, pnuField, cadastralCrs, normalizedPnus, cacheKey, signal, onFeatures, onProgress } = params;
  try {
    const apiLoaded = await loadUploadedHighlightsFromApi({
      theme: apiPayload.theme,
      pnus: apiPayload.pnus,
      bbox: apiPayload.bbox,
      bboxCrs: apiPayload.bboxCrs,
      signal
    });
    const matched = apiLoaded.features.length;
    const scanned = apiLoaded.meta?.scanned ?? 0;
    const total = normalizedPnus.length;
    const progress: HighlightLoadProgress = {
      scanned,
      matched,
      total,
      done: true,
      fromCache: false
    };
    onFeatures?.(apiLoaded.features, progress);
    onProgress?.(progress);
    void setCachedHighlights({
      key: cacheKey,
      createdAt: Date.now(),
      features: apiLoaded.features
    });
    return { type: "FeatureCollection", features: apiLoaded.features };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
  }

  const matchedByPnu = new Map<string, LandFeature>();
  const worker = new Worker(new URL("./cadastral-fgb-worker.ts", import.meta.url), { type: "module" });
  let abortListener: (() => void) | null = null;

  const terminateWorker = (): void => {
    if (abortListener) {
      signal?.removeEventListener("abort", abortListener);
      abortListener = null;
    }
    worker.terminate();
  };

  return new Promise<LandFeatureCollection>((resolve, reject) => {
    abortListener = () => {
      terminateWorker();
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", abortListener, { once: true });

    worker.onmessage = (evt: MessageEvent<WorkerResponse>) => {
      const data = evt.data;
      if (!data) {
        return;
      }

      if (data.type === "chunk") {
        const deduped = dedupeByPnu(data.payload.features, matchedByPnu);
        if (deduped.length > 0) {
          onFeatures?.(deduped, {
            scanned: data.payload.scanned,
            matched: data.payload.matched,
            total: data.payload.total,
            done: false,
            fromCache: false
          });
        }
        return;
      }

      if (data.type === "progress") {
        onProgress?.({
          scanned: data.payload.scanned,
          matched: data.payload.matched,
          total: data.payload.total,
          done: false,
          fromCache: false
        });
        return;
      }

      if (data.type === "done") {
        const features = Array.from(matchedByPnu.values());
        const progress: HighlightLoadProgress = {
          scanned: data.payload.scanned,
          matched: data.payload.matched,
          total: data.payload.total,
          done: true,
          fromCache: false
        };
        onProgress?.(progress);
        void setCachedHighlights({
          key: cacheKey,
          createdAt: Date.now(),
          features
        });
        terminateWorker();
        resolve({ type: "FeatureCollection", features });
        return;
      }

      if (data.type === "error") {
        terminateWorker();
        reject(new Error(data.payload.message));
      }
    };

    worker.onerror = () => { terminateWorker(); reject(new Error("하이라이트 워커 처리 중 오류가 발생했습니다.")); };

    const startMessage: WorkerStartMessage = {
      type: "start",
      payload: {
        fgbUrl,
        pnuField,
        cadastralCrs,
        uploadedPnus: normalizedPnus
      }
    };
    worker.postMessage(startMessage);
  });
}
