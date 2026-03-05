import type { CadastralCrs, LandFeature, LandFeatureCollection } from "./types";

type FlatGeobufModule = {
  deserialize: (
    source: string,
    rect?: { minX: number; minY: number; maxX: number; maxY: number }
  ) => AsyncIterable<Record<string, unknown>>;
};

let flatgeobufModulePromise: Promise<FlatGeobufModule> | null = null;
const FLATGEOBUF_MODULE_URLS = [
  "https://esm.sh/flatgeobuf@4.3.1/geojson?bundle",
  "https://esm.sh/flatgeobuf@4.3.1?bundle"
];

function normalizePnu(raw: unknown): string {
  return String(raw ?? "").replace(/\D/g, "");
}

async function getFlatGeobufModule(): Promise<FlatGeobufModule> {
  if (!flatgeobufModulePromise) {
    flatgeobufModulePromise = (async () => {
      let lastError: unknown = null;
      for (const moduleUrl of FLATGEOBUF_MODULE_URLS) {
        try {
          const mod = (await import(/* @vite-ignore */ moduleUrl)) as Record<string, unknown>;
          if (typeof mod.deserialize === "function") {
            return mod as FlatGeobufModule;
          }
          const geojson = mod.geojson as Record<string, unknown> | undefined;
          if (geojson && typeof geojson.deserialize === "function") {
            return geojson as FlatGeobufModule;
          }
          lastError = new Error("FlatGeobuf module loaded but deserialize export was not found.");
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError instanceof Error
        ? lastError
        : new Error("FlatGeobuf 모듈을 불러오지 못했습니다. 네트워크/CSP 설정을 확인하세요.");
    })();
  }
  return flatgeobufModulePromise;
}

export async function loadUploadedHighlights(
  params: {
    fgbUrl: string;
    pnuField: string;
    cadastralCrs: CadastralCrs;
    uploadedPnus: string[];
    signal?: AbortSignal;
  }
): Promise<LandFeatureCollection> {
  const { fgbUrl, pnuField, cadastralCrs, uploadedPnus, signal } = params;
  const requestedPnuSet = new Set(uploadedPnus.map((item) => normalizePnu(item)).filter((item) => item.length === 19));
  if (requestedPnuSet.size === 0) {
    return { type: "FeatureCollection", features: [] };
  }

  const flatgeobuf = await getFlatGeobufModule();
  const matchedByPnu = new Map<string, LandFeature>();
  const fullRect =
    cadastralCrs === "EPSG:3857"
      ? {
          minX: -20037508.342789244,
          minY: -20037508.342789244,
          maxX: 20037508.342789244,
          maxY: 20037508.342789244
        }
      : {
          minX: -180,
          minY: -90,
          maxX: 180,
          maxY: 90
        };

  for await (const feature of flatgeobuf.deserialize(fgbUrl, fullRect)) {
    if (signal?.aborted) {
      break;
    }
    const properties = (feature.properties ?? {}) as Record<string, unknown>;
    const pnuRaw =
      properties[pnuField] ??
      properties[pnuField.toLowerCase()] ??
      properties[pnuField.toUpperCase()] ??
      properties.JIBUN ??
      properties.jibun;
    const pnu = normalizePnu(pnuRaw);
    if (!requestedPnuSet.has(pnu) || matchedByPnu.has(pnu)) {
      continue;
    }
    matchedByPnu.set(pnu, {
      type: "Feature",
      geometry: feature.geometry,
      properties: { pnu }
    });
    if (matchedByPnu.size >= requestedPnuSet.size) {
      break;
    }
  }

  return { type: "FeatureCollection", features: Array.from(matchedByPnu.values()) };
}
