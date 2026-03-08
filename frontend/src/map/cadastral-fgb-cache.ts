import { fetchWithHeaders } from "../http";

import type { LandFeature, ThemeType } from "./types";

export type CachedHighlightRecord = {
  key: string;
  createdAt: number;
  features: LandFeature[];
};

const INDEXED_DB_NAME = "poi_map_cache";
const INDEXED_DB_VERSION = 1;
const INDEXED_DB_STORE = "cadastral_highlights";

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

export async function buildCacheKey(theme: ThemeType, pnus: string[], fgbEtag: string): Promise<string> {
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

export async function getCachedHighlights(key: string): Promise<CachedHighlightRecord | null> {
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

export async function setCachedHighlights(record: CachedHighlightRecord): Promise<void> {
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
