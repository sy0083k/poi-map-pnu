import { fetchJson } from "../http";

import type { CadastralCrs, ThemeType } from "./types";

export type CadastralRenderItem = {
  pnu: string;
  geometry: unknown;
  lod: "full" | "mid" | "low";
  bbox: [number, number, number, number];
  center: [number, number];
};

export type CadastralHighlightsApiResponse = {
  items: CadastralRenderItem[];
  meta?: {
    requested?: number;
    matched?: number;
    source?: "parcel_render_item";
    sourceFgbEtag?: string;
    bboxApplied?: boolean;
    bboxFiltered?: number;
    sourceCrs?: CadastralCrs;
    responseCrs?: CadastralCrs;
    geometryFormat?: "geojson";
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
