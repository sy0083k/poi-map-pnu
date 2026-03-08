import type { LandListItem, LandSourceField } from "./types";
import type { PhotoImportSummary } from "./photo-mode-types";

export function isJpeg(file: File): boolean {
  const type = (file.type || "").toLowerCase();
  if (type === "image/jpeg" || type === "image/jpg") {
    return true;
  }
  const lower = file.name.toLowerCase();
  return lower.endsWith(".jpg") || lower.endsWith(".jpeg");
}

export function getFileLabel(file: File): { fileName: string; relativePath: string } {
  const withPath = file as File & { webkitRelativePath?: string };
  const relativePath = withPath.webkitRelativePath || file.name;
  return {
    fileName: file.name,
    relativePath
  };
}

export function updateSummary(element: HTMLElement | null, summary: PhotoImportSummary): void {
  if (!(element instanceof HTMLElement)) {
    return;
  }
  element.textContent =
    `총 파일 ${summary.totalFiles}개, JPEG 후보 ${summary.jpegCandidates}개, ` +
    `GPS 추출 ${summary.gpsFound}개, GPS 없음 ${summary.skippedNoGps}개, ` +
    `미지원 ${summary.skippedUnsupported}개, 파싱 오류 ${summary.parseErrors}개`;
}

export function normalizeInline(value: string): string {
  return value.replace(/[\r\n\t]+/g, " ").trim();
}

export function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

export function buildLandFallbackRows(item: LandListItem): LandSourceField[] {
  return [
    { key: "pnu", label: "PNU", value: stringifyValue(item.pnu) },
    { key: "address", label: "주소", value: stringifyValue(item.address) },
    { key: "area", label: "면적", value: `${item.area}㎡` },
    { key: "land_type", label: "지목", value: stringifyValue(item.land_type) },
    { key: "property_manager", label: "재산관리관", value: stringifyValue(item.property_manager) }
  ].filter((row) => row.value !== "");
}
