import type { LandListItem } from "./types";

const DB_NAME = "poi_map_local_upload";
const DB_VERSION = 1;
const STORE_NAME = "uploads";
const STORE_KEY = "file2map";

export type StoredUploadPayload = {
  key: string;
  fileName: string;
  savedAt: number;
  items: LandListItem[];
};

async function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveUploadToIndexedDb(payload: Omit<StoredUploadPayload, "key">): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put({ ...payload, key: STORE_KEY });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadUploadFromIndexedDb(): Promise<StoredUploadPayload | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(STORE_KEY);
    req.onsuccess = () => {
      const result = req.result as StoredUploadPayload | undefined;
      resolve(result ?? null);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function clearUploadFromIndexedDb(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(STORE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
