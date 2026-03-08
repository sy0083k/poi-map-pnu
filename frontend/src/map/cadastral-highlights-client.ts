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
  };
};

export async function loadUploadedHighlightsFromApi(params: {
  theme: ThemeType;
  pnus: string[];
  signal?: AbortSignal;
}): Promise<CadastralHighlightsApiResponse> {
  return fetchJson<CadastralHighlightsApiResponse>("/api/cadastral/highlights", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      theme: params.theme,
      pnus: params.pnus,
    }),
    signal: params.signal,
    timeoutMs: 30000,
  });
}
