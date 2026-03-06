const DB_NAME = "poi_map_photo_upload";
const DB_VERSION = 1;
const STORE_NAME = "photo_markers";
const STORE_KEY = "photo2map";

export type PersistedPhotoMarkerItem = {
  id: number;
  file: File;
  fileName: string;
  relativePath: string;
  lat: number;
  lon: number;
};

type StoredPhotoPayload = {
  key: string;
  savedAt: number;
  items: PersistedPhotoMarkerItem[];
};

export type PersistedPhotoMarkerSnapshot = {
  savedAt: number;
  items: PersistedPhotoMarkerItem[];
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

export async function savePersistedPhotoMarkers(items: PersistedPhotoMarkerItem[]): Promise<void> {
  const db = await openDb();
  const payload: StoredPhotoPayload = {
    key: STORE_KEY,
    savedAt: Date.now(),
    items
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(payload);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadPersistedPhotoMarkers(): Promise<PersistedPhotoMarkerSnapshot | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(STORE_KEY);
    req.onsuccess = () => {
      const stored = req.result as StoredPhotoPayload | undefined;
      if (!stored || !Array.isArray(stored.items)) {
        resolve(null);
        return;
      }
      resolve({
        savedAt: stored.savedAt,
        items: stored.items
      });
    };
    req.onerror = () => reject(req.error);
  });
}

export async function clearPersistedPhotoMarkers(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(STORE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
