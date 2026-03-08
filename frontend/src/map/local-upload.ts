import { parseFile2MapUploadOnServer } from "./file2map-upload-client";
import { parseExcelFile } from "./local-upload-parser";
import {
  clearUploadFromIndexedDb,
  loadUploadFromIndexedDb,
  saveUploadToIndexedDb
} from "./local-upload-storage";

import type { LandListItem } from "./types";

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

export type PersistedFile2MapUpload = {
  items: LandListItem[];
  summary: LocalUploadSummary;
};

function buildSummary(fileName: string, items: LandListItem[], savedAt: number): LocalUploadSummary {
  return {
    fileName,
    rowCount: items.length,
    uniquePnuCount: new Set(items.map((item) => item.pnu)).size,
    savedAt
  };
}

export async function loadPersistedFile2MapUpload(): Promise<PersistedFile2MapUpload | null> {
  const persisted = await loadUploadFromIndexedDb();
  if (!persisted || !Array.isArray(persisted.items)) {
    return null;
  }
  return {
    items: persisted.items,
    summary: buildSummary(persisted.fileName, persisted.items, persisted.savedAt)
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
    const persisted = await loadUploadFromIndexedDb();
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
        let items: LandListItem[] = [];
        try {
          const parsed = await parseFile2MapUploadOnServer(file);
          items = parsed.items;
        } catch {
          items = await parseExcelFile(file);
        }
        const savedAt = Date.now();
        const summary = buildSummary(file.name, items, savedAt);
        await saveUploadToIndexedDb({
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
        await clearUploadFromIndexedDb();
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
