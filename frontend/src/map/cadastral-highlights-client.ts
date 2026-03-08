import { fetchJson } from "../http";

import type { LandFeature, ThemeType } from "./types";

export type CadastralHighlightsApiResponse = {
  type: "FeatureCollection";
  features: LandFeature[];
  meta?: {
    requested?: number;
    matched?: number;
    scanned?: number;
    source?: "cache" | "parsed";
    fgbEtag?: string;
    bboxApplied?: boolean;
    bboxFiltered?: number;
    bboxCrs?: "EPSG:3857" | "EPSG:4326" | null;
  };
};

export async function loadUploadedHighlightsFromApi(params: {
  theme: ThemeType;
  pnus: string[];
  bbox?: [number, number, number, number];
  bboxCrs?: "EPSG:3857" | "EPSG:4326";
  signal?: AbortSignal;
}): Promise<CadastralHighlightsApiResponse> {
  const payload: {
    theme: ThemeType;
    pnus: string[];
    bbox?: [number, number, number, number];
    bboxCrs?: "EPSG:3857" | "EPSG:4326";
  } = {
    theme: params.theme,
    pnus: params.pnus,
  };
  if (params.bbox) {
    payload.bbox = params.bbox;
    payload.bboxCrs = params.bboxCrs ?? "EPSG:3857";
  }
  return fetchJson<CadastralHighlightsApiResponse>("/api/cadastral/highlights", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: params.signal,
    timeoutMs: 30000,
  });
}
