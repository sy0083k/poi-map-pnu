import { HttpError, fetchBlob } from "../http";
import type { LandListItem, ThemeType } from "./types";

const XLSX_MODULE_URL = "https://esm.sh/xlsx@0.18.5";
const FALLBACK_EXPORT_COLUMNS = ["고유번호", "소재지", "지목", "실면적", "재산관리관"] as const;

type XlsxModule = {
  utils: {
    book_new: () => unknown;
    json_to_sheet: (rows: Array<Record<string, string>>, options?: Record<string, unknown>) => unknown;
    book_append_sheet: (workbook: unknown, worksheet: unknown, sheetName: string) => void;
  };
  write: (workbook: unknown, options: Record<string, unknown>) => ArrayBuffer;
};

function parseFilenameFromDisposition(contentDisposition: string | null): string | null {
  if (!contentDisposition) {
    return null;
  }

  const utf8Match = contentDisposition.match(/filename\\*=UTF-8''([^;]+)/i);
  if (utf8Match && utf8Match[1]) {
    try {
      return decodeURIComponent(utf8Match[1].trim());
    } catch {
      return utf8Match[1].trim();
    }
  }

  const plainMatch = contentDisposition.match(/filename=\"?([^\";]+)\"?/i);
  if (plainMatch && plainMatch[1]) {
    return plainMatch[1].trim();
  }
  return null;
}

function sourceFieldValueByLabel(item: LandListItem, label: string): string {
  const match = item.sourceFields.find((field) => field.label.trim() === label);
  return (match?.value || "").trim();
}

function collectColumnOrder(items: LandListItem[]): string[] {
  const columns: string[] = [];
  const seen = new Set<string>();
  items.forEach((item) => {
    item.sourceFields.forEach((field) => {
      const label = field.label.trim();
      if (!label || seen.has(label)) {
        return;
      }
      seen.add(label);
      columns.push(label);
    });
  });
  if (columns.length > 0) {
    return columns;
  }
  return [...FALLBACK_EXPORT_COLUMNS];
}

function buildRowRecord(item: LandListItem, columns: string[]): Record<string, string> {
  const record: Record<string, string> = {};
  columns.forEach((column) => {
    const bySource = sourceFieldValueByLabel(item, column);
    if (bySource !== "") {
      record[column] = bySource;
      return;
    }
    if (column === "고유번호") {
      record[column] = item.pnu;
      return;
    }
    if (column === "소재지") {
      record[column] = item.address;
      return;
    }
    if (column === "지목") {
      record[column] = item.land_type;
      return;
    }
    if (column === "실면적") {
      record[column] = Number.isFinite(item.area) ? String(item.area) : "";
      return;
    }
    if (column === "재산관리관") {
      record[column] = item.property_manager;
      return;
    }
    record[column] = "";
  });
  return record;
}

async function loadXlsxModule(): Promise<XlsxModule> {
  const loaded = (await import(/* @vite-ignore */ XLSX_MODULE_URL)) as unknown as Record<string, unknown>;
  if (
    loaded.utils &&
    typeof (loaded.utils as { book_new?: unknown }).book_new === "function" &&
    typeof (loaded.write as unknown) === "function"
  ) {
    return loaded as unknown as XlsxModule;
  }
  throw new Error("엑셀 생성 모듈을 불러오지 못했습니다.");
}

export function createDownloadClient() {
  const downloadSearchResultFile = async (params: { theme: ThemeType; landIds: number[] }): Promise<void> => {
    try {
      const { blob, headers } = await fetchBlob("/api/lands/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
        timeoutMs: 30000
      });
      const disposition = headers.get("content-disposition");
      const fallbackName = "poi-map-geo-download";
      const filename = parseFilenameFromDisposition(disposition) || fallbackName;
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      const message = error instanceof HttpError ? error.message : "파일 다운로드 중 오류가 발생했습니다.";
      alert(message);
    }
  };

  const downloadLocalSearchResultFile = async (params: {
    theme: ThemeType;
    items: LandListItem[];
  }): Promise<void> => {
    const { theme, items } = params;
    if (items.length === 0) {
      alert("검색 결과가 없어 다운로드할 수 없습니다.");
      return;
    }

    try {
      const xlsx = await loadXlsxModule();
      const columnOrder = collectColumnOrder(items);
      const rows = items.map((item) => buildRowRecord(item, columnOrder));

      const workbook = xlsx.utils.book_new();
      const worksheet = xlsx.utils.json_to_sheet(rows, { header: columnOrder });
      xlsx.utils.book_append_sheet(workbook, worksheet, "검색결과");
      const arrayBuffer = xlsx.write(workbook, { bookType: "xlsx", type: "array" });
      const blob = new Blob([arrayBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      });

      const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
      const filename = `lands-search-result-${theme}-${stamp}.xlsx`;
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : "파일 다운로드 중 오류가 발생했습니다.";
      alert(message);
    }
  };

  return {
    downloadLocalSearchResultFile,
    downloadSearchResultFile
  };
}

export type DownloadClient = ReturnType<typeof createDownloadClient>;
