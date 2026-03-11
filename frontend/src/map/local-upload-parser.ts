import type { LandListItem, LandSourceField } from "./types";

const REQUIRED_COLUMNS = ["고유번호", "소재지", "지목", "실면적", "재산관리관"] as const;
const XLSX_MODULE_URL = "https://esm.sh/xlsx@0.18.5";

type XlsxModule = {
  read: (data: ArrayBuffer, options: Record<string, unknown>) => { SheetNames: string[]; Sheets: Record<string, unknown> };
  utils: {
    sheet_to_json: (sheet: unknown, options?: Record<string, unknown>) => Record<string, unknown>[];
  };
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
      bbox: null,
      sourceFields: buildSourceFields(row, headers)
    });
  });

  return items;
}

export async function parseExcelFile(file: File): Promise<LandListItem[]> {
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
