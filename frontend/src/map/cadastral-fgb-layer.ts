import type { CadastralCrs, LandFeature, LandFeatureCollection, ThemeType } from "./types";

type WorkerChunkPayload = {
  features: LandFeature[];
  scanned: number;
  matched: number;
  total: number;
};

type WorkerProgressPayload = {
  scanned: number;
  matched: number;
  total: number;
};

type WorkerDonePayload = {
  scanned: number;
  matched: number;
  total: number;
};

type WorkerErrorPayload = {
  message: string;
};

type WorkerResponse =
  | {
      type: "chunk";
      payload: WorkerChunkPayload;
    }
  | {
      type: "progress";
      payload: WorkerProgressPayload;
    }
  | {
      type: "done";
      payload: WorkerDonePayload;
    }
  | {
      type: "error";
      payload: WorkerErrorPayload;
    };

type WorkerStartMessage = {
  type: "start";
  payload: {
    fgbUrl: string;
    pnuField: string;
    cadastralCrs: CadastralCrs;
    uploadedPnus: string[];
  };
};

export type HighlightLoadProgress = {
  scanned: number;
  matched: number;
  total: number;
  done: boolean;
  fromCache: boolean;
};

type CachedHighlightRecord = {
  key: string;
  createdAt: number;
  features: LandFeature[];
};

const INDEXED_DB_NAME = "poi_map_cache";
const INDEXED_DB_VERSION = 1;
const INDEXED_DB_STORE = "cadastral_highlights";

export async function loadUploadedHighlights(
  params: {
    fgbUrl: string;
    pnuField: string;
    cadastralCrs: CadastralCrs;
    uploadedPnus: string[];
    theme: ThemeType;
    signal?: AbortSignal;
    onFeatures?: (features: LandFeature[], progress: HighlightLoadProgress) => void;
    onProgress?: (progress: HighlightLoadProgress) => void;
  }
): Promise<LandFeatureCollection> {
  const { fgbUrl, pnuField, cadastralCrs, uploadedPnus, theme, signal, onFeatures, onProgress } = params;
  const requestedPnuSet = new Set(uploadedPnus.map((item) => normalizePnu(item)).filter((item) => item.length === 19));
  if (requestedPnuSet.size === 0) {
    return { type: "FeatureCollection", features: [] };
  }
  throwIfAborted(signal);

  const normalizedPnus = Array.from(requestedPnuSet);
  const fgbEtag = await getFgbEtag(fgbUrl, signal);
  const cacheKey = await buildCacheKey(theme, normalizedPnus, fgbEtag);
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

    worker.onerror = () => {
      terminateWorker();
      reject(new Error("하이라이트 워커 처리 중 오류가 발생했습니다."));
    };

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

function normalizePnu(raw: unknown): string {
  return String(raw ?? "").replace(/\D/g, "");
}

function dedupeByPnu(features: LandFeature[], bucket: Map<string, LandFeature>): LandFeature[] {
  const deduped: LandFeature[] = [];
  for (const feature of features) {
    const pnu = normalizePnu(feature.properties?.pnu);
    if (!pnu || bucket.has(pnu)) {
      continue;
    }
    bucket.set(pnu, feature);
    deduped.push(feature);
  }
  return deduped;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
}

async function getFgbEtag(fgbUrl: string, signal?: AbortSignal): Promise<string> {
  try {
    const response = await fetch(fgbUrl, {
      method: "GET",
      headers: {
        Range: "bytes=0-0"
      },
      signal
    });
    if (!response.ok && response.status !== 206) {
      return "no-etag";
    }
    return response.headers.get("etag")?.trim() || "no-etag";
  } catch {
    return "no-etag";
  }
}

async function buildCacheKey(theme: ThemeType, pnus: string[], fgbEtag: string): Promise<string> {
  const sorted = Array.from(new Set(pnus)).sort();
  const payload = `${theme}:${fgbEtag}:${sorted.join(",")}`;
  if (typeof crypto !== "undefined" && crypto.subtle) {
    try {
      const bytes = new TextEncoder().encode(payload);
      const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map((item) => item.toString(16).padStart(2, "0")).join("");
      return `v1:${hashHex}`;
    } catch {
      // Fall through to weak hash.
    }
  }
  let hash = 2166136261;
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return `v1:${(hash >>> 0).toString(16)}`;
}

async function getCachedHighlights(key: string): Promise<CachedHighlightRecord | null> {
  const db = await openCacheDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(INDEXED_DB_STORE, "readonly");
    const store = tx.objectStore(INDEXED_DB_STORE);
    const request = store.get(key);
    request.onsuccess = () => {
      const result = request.result as CachedHighlightRecord | undefined;
      resolve(result || null);
    };
    request.onerror = () => {
      reject(request.error);
    };
  });
}

async function setCachedHighlights(record: CachedHighlightRecord): Promise<void> {
  const db = await openCacheDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(INDEXED_DB_STORE, "readwrite");
    const store = tx.objectStore(INDEXED_DB_STORE);
    store.put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function openCacheDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(INDEXED_DB_NAME, INDEXED_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(INDEXED_DB_STORE)) {
        db.createObjectStore(INDEXED_DB_STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
