import { fetchWithHeaders } from "../http";

import type { LandFeature, ThemeType } from "./types";

export type CachedHighlightRecord = {
  key: string;
  createdAt: number;
  features: LandFeature[];
};

const INDEXED_DB_NAME = "poi_map_cache";
const INDEXED_DB_VERSION = 2;
const INDEXED_DB_STORE = "cadastral_highlights";
const INDEXED_DB_CREATED_AT_INDEX = "createdAt";
const CACHE_KEY_VERSION = 2;
const LEGACY_CACHE_KEY_VERSION = 1;
const CACHE_MAX_RECORDS = 1000;
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function normalizePnu(raw: unknown): string {
  return String(raw ?? "").replace(/\D/g, "");
}

export function dedupeByPnu(features: LandFeature[], bucket: Map<string, LandFeature>): LandFeature[] {
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

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
}

export async function getFgbEtag(fgbUrl: string, signal?: AbortSignal): Promise<string> {
  try {
    const response = await fetchWithHeaders(fgbUrl, {
      method: "GET",
      headers: {
        Range: "bytes=0-0"
      },
      signal,
      timeoutMs: 10000
    });
    if (!response.ok && response.status !== 206) {
      return "no-etag";
    }
    return response.headers.get("etag")?.trim() || "no-etag";
  } catch {
    return "no-etag";
  }
}

export async function buildCacheKey(
  theme: ThemeType,
  pnus: string[],
  fgbEtag: string,
  bboxKey: string = "bbox:none",
  version: number = CACHE_KEY_VERSION
): Promise<string> {
  const sorted = Array.from(new Set(pnus)).sort();
  const payload = `${theme}:${fgbEtag}:${bboxKey}:${sorted.join(",")}`;
  if (typeof crypto !== "undefined" && crypto.subtle) {
    try {
      const bytes = new TextEncoder().encode(payload);
      const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map((item) => item.toString(16).padStart(2, "0")).join("");
      return `v${version}:${hashHex}`;
    } catch {
      // Fall through to weak hash.
    }
  }
  let hash = 2166136261;
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return `v${version}:${(hash >>> 0).toString(16)}`;
}

export async function buildLegacyCacheKey(
  theme: ThemeType,
  pnus: string[],
  fgbEtag: string,
  bboxKey: string = "bbox:none"
): Promise<string> {
  return buildCacheKey(theme, pnus, fgbEtag, bboxKey, LEGACY_CACHE_KEY_VERSION);
}

export function buildBboxKey(
  bbox: [number, number, number, number] | undefined,
  bboxCrs: "EPSG:3857" | "EPSG:4326"
): string {
  if (!bbox) {
    return "bbox:none";
  }
  return `bbox:${bbox[0].toFixed(2)},${bbox[1].toFixed(2)},${bbox[2].toFixed(2)},${bbox[3].toFixed(2)}:${bboxCrs}`;
}

export async function getCachedHighlights(keyOrKeys: string | string[]): Promise<CachedHighlightRecord | null> {
  const db = await openCacheDb();
  await cleanupCacheStore(db);
  const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
  return new Promise((resolve, reject) => {
    const tx = db.transaction(INDEXED_DB_STORE, "readonly");
    const store = tx.objectStore(INDEXED_DB_STORE);
    let cursor = 0;

    const loadNext = (): void => {
      if (cursor >= keys.length) {
        resolve(null);
        return;
      }
      const request = store.get(keys[cursor]);
      request.onsuccess = () => {
        const result = request.result as CachedHighlightRecord | undefined;
        if (result) {
          resolve(result);
          return;
        }
        cursor += 1;
        loadNext();
      };
      request.onerror = () => {
        reject(request.error);
      };
    };
    loadNext();
  });
}

export async function setCachedHighlights(record: CachedHighlightRecord): Promise<void> {
  const db = await openCacheDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(INDEXED_DB_STORE, "readwrite");
    const store = tx.objectStore(INDEXED_DB_STORE);
    store.put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  await cleanupCacheStore(db);
}

async function openCacheDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(INDEXED_DB_NAME, INDEXED_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(INDEXED_DB_STORE)) {
        const store = db.createObjectStore(INDEXED_DB_STORE, { keyPath: "key" });
        store.createIndex(INDEXED_DB_CREATED_AT_INDEX, "createdAt", { unique: false });
        return;
      }
      const tx = req.transaction;
      if (!tx) {
        return;
      }
      const store = tx.objectStore(INDEXED_DB_STORE);
      if (!store.indexNames.contains(INDEXED_DB_CREATED_AT_INDEX)) {
        store.createIndex(INDEXED_DB_CREATED_AT_INDEX, "createdAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function cleanupCacheStore(db: IDBDatabase): Promise<void> {
  const now = Date.now();
  const threshold = now - CACHE_MAX_AGE_MS;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(INDEXED_DB_STORE, "readwrite");
    const store = tx.objectStore(INDEXED_DB_STORE);
    const index = store.index(INDEXED_DB_CREATED_AT_INDEX);
    const request = index.openCursor();

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        return;
      }
      const value = cursor.value as CachedHighlightRecord;
      if (typeof value.createdAt !== "number" || value.createdAt < threshold) {
        cursor.delete();
      }
      cursor.continue();
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(INDEXED_DB_STORE, "readwrite");
    const store = tx.objectStore(INDEXED_DB_STORE);
    const index = store.index(INDEXED_DB_CREATED_AT_INDEX);
    let count = 0;
    const request = index.openCursor();

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        return;
      }
      count += 1;
      if (count > CACHE_MAX_RECORDS) {
        cursor.delete();
      }
      cursor.continue();
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
