import type { LandListItem, LandSourceField } from "./types";

const REQUIRED_COLUMNS = ["고유번호", "소재지", "지목", "실면적", "재산관리관"] as const;
const DB_NAME = "poi_map_local_upload";
const DB_VERSION = 1;
const STORE_NAME = "uploads";
const STORE_KEY = "file2map";
const XLSX_MODULE_URL = "https://esm.sh/xlsx@0.18.5";

type StoredUploadPayload = {
  key: string;
  fileName: string;
  savedAt: number;
  items: LandListItem[];
};

type XlsxModule = {
  read: (data: ArrayBuffer, options: Record<string, unknown>) => { SheetNames: string[]; Sheets: Record<string, unknown> };
  utils: {
    sheet_to_json: (sheet: unknown, options?: Record<string, unknown>) => Record<string, unknown>[];
  };
};

export type LocalUploadSummary = {
  fileName: string;
  rowCount: number;
  uniquePnuCount: number;
  savedAt: number;
};

export type LocalUploadResult = {
  items: LandListItem[];
  summary: LocalUploadSummary;
};

export type LocalUploadAppliedEvent = {
  result: LocalUploadResult;
  source: "uploaded" | "restored";
};

type SetupFile2MapUploadOptions = {
  fileInput: HTMLInputElement | null;
  uploadButton: HTMLButtonElement | null;
  clearButton: HTMLButtonElement | null;
  onStatusMessage: (message: string, color?: string) => void;
  onApplied: (event: LocalUploadAppliedEvent) => void;
  onCleared: () => void;
};

export type SetupFile2MapUploadResult = {
  hasRestoredUpload: boolean;
};

function normalizePnu(raw: unknown): string {
  return String(raw ?? "").replace(/\D/g, "");
}

function toText(raw: unknown): string {
  if (raw === null || raw === undefined) {
    return "";
  }
  return String(raw).trim();
}

async function loadXlsxModule(): Promise<XlsxModule> {
  const loaded = (await import(/* @vite-ignore */ XLSX_MODULE_URL)) as unknown as Record<string, unknown>;
  if (typeof loaded.read === "function" && loaded.utils && typeof (loaded.utils as { sheet_to_json?: unknown }).sheet_to_json === "function") {
    return loaded as unknown as XlsxModule;
  }
  throw new Error("엑셀 파서 모듈을 불러오지 못했습니다.");
}

function buildSourceFields(row: Record<string, unknown>, headers: string[]): LandSourceField[] {
  const fields: LandSourceField[] = [];
  headers.forEach((header) => {
    const label = header.trim();
    if (!label) {
      return;
    }
    fields.push({
      key: label,
      label,
      value: toText(row[label])
    });
  });
  return fields;
}

function parseArea(raw: unknown): number | null {
  if (raw === null || raw === undefined || toText(raw) === "") {
    return null;
  }
  const parsed = Number.parseFloat(String(raw));
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

function parseRowsToItems(rows: Record<string, unknown>[]): LandListItem[] {
  if (rows.length === 0) {
    return [];
  }

  const headers = Object.keys(rows[0] ?? {}).map((header) => header.trim()).filter((header) => header !== "");
  const missing = REQUIRED_COLUMNS.filter((column) => !headers.includes(column));
  if (missing.length > 0) {
    throw new Error(`필수 컬럼 누락: ${missing.join(", ")}`);
  }

  const items: LandListItem[] = [];
  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const pnu = normalizePnu(row["고유번호"]);
    if (!pnu || pnu.length !== 19) {
      throw new Error(`${rowNumber}행 고유번호(PNU)가 올바르지 않습니다.`);
    }

    const address = toText(row["소재지"]);
    if (!address) {
      throw new Error(`${rowNumber}행 소재지가 비어 있습니다.`);
    }

    const area = parseArea(row["실면적"]);
    if (area === null) {
      throw new Error(`${rowNumber}행 실면적이 숫자가 아닙니다.`);
    }

    const landType = toText(row["지목"]);
    const propertyManager = toText(row["재산관리관"]);

    items.push({
      id: index + 1,
      pnu,
      address,
      land_type: landType,
      area,
      property_manager: propertyManager,
      sourceFields: buildSourceFields(row, headers)
    });
  });

  return items;
}

async function parseExcelFile(file: File): Promise<LandListItem[]> {
  const name = file.name.toLowerCase();
  if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) {
    throw new Error("엑셀 파일(.xlsx, .xls)만 업로드할 수 있습니다.");
  }

  const xlsx = await loadXlsxModule();
  const arrayBuffer = await file.arrayBuffer();
  const workbook = xlsx.read(arrayBuffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error("엑셀 시트를 찾을 수 없습니다.");
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const rows = xlsx.utils.sheet_to_json(worksheet, { defval: "" });
  return parseRowsToItems(rows);
}

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

async function saveToIndexedDb(payload: StoredUploadPayload): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(payload);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadFromIndexedDb(): Promise<StoredUploadPayload | null> {
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

async function clearIndexedDb(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(STORE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function buildSummary(fileName: string, items: LandListItem[], savedAt: number): LocalUploadSummary {
  return {
    fileName,
    rowCount: items.length,
    uniquePnuCount: new Set(items.map((item) => item.pnu)).size,
    savedAt
  };
}

export async function setupFile2MapUpload(options: SetupFile2MapUploadOptions): Promise<SetupFile2MapUploadResult> {
  const { fileInput, uploadButton, clearButton, onStatusMessage, onApplied, onCleared } = options;

  if (!fileInput || !uploadButton || !clearButton) {
    return { hasRestoredUpload: false };
  }
  let hasRestoredUpload = false;

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    const title = file ? `선택 파일: ${file.name}` : "";
    fileInput.title = title;
    uploadButton.title = title;
  });

  try {
    const persisted = await loadFromIndexedDb();
    if (persisted && Array.isArray(persisted.items)) {
      const summary = buildSummary(persisted.fileName, persisted.items, persisted.savedAt);
      fileInput.title = `선택 파일: ${persisted.fileName}`;
      uploadButton.title = `선택 파일: ${persisted.fileName}`;
      onStatusMessage("저장된 업로드 파일을 복원했습니다.", "#166534");
      onApplied({ result: { items: persisted.items, summary }, source: "restored" });
      hasRestoredUpload = true;
    }
  } catch {
    onStatusMessage("저장된 업로드 복원에 실패했습니다.", "#b45309");
  }

  uploadButton.addEventListener("click", () => {
    const file = fileInput.files?.[0];
    if (!file) {
      onStatusMessage("업로드할 파일을 선택하세요.", "#b45309");
      return;
    }

    onStatusMessage("파일을 검증하는 중입니다...", "#1f2937");
    void (async () => {
      try {
        const items = await parseExcelFile(file);
        const savedAt = Date.now();
        const summary = buildSummary(file.name, items, savedAt);
        await saveToIndexedDb({
          key: STORE_KEY,
          fileName: file.name,
          savedAt,
          items
        });
        fileInput.title = `선택 파일: ${file.name}`;
        uploadButton.title = `선택 파일: ${file.name}`;
        onStatusMessage("파일 적용이 완료되었습니다.", "#166534");
        onApplied({ result: { items, summary }, source: "uploaded" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "파일 처리 중 오류가 발생했습니다.";
        onStatusMessage(message, "#b91c1c");
      }
    })();
  });

  clearButton.addEventListener("click", () => {
    void (async () => {
      try {
        await clearIndexedDb();
      } catch {
        // Ignore persistence clear errors and continue UI reset.
      }
      fileInput.value = "";
      fileInput.title = "";
      uploadButton.title = "";
      onStatusMessage("업로드 데이터를 초기화했습니다.", "#1f2937");
      onCleared();
    })();
  });

  return { hasRestoredUpload };
}
