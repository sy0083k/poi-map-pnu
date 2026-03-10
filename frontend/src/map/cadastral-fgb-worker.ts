import type { CadastralCrs, LandFeature } from "./types";

type FlatGeobufModule = {
  deserialize: (
    source: string,
    rect?: { minX: number; minY: number; maxX: number; maxY: number }
  ) => AsyncIterable<Record<string, unknown>>;
};

type StartMessage = {
  type: "start";
  payload: {
    fgbUrl: string;
    pnuField: string;
    cadastralCrs: CadastralCrs;
    outputCrs: CadastralCrs;
    uploadedPnus: string[];
  };
};

type WorkerResponse =
  | {
      type: "chunk";
      payload: {
        features: LandFeature[];
        scanned: number;
        matched: number;
        total: number;
      };
    }
  | {
      type: "progress";
      payload: {
        scanned: number;
        matched: number;
        total: number;
      };
    }
  | {
      type: "done";
      payload: {
        scanned: number;
        matched: number;
        total: number;
      };
    }
  | {
      type: "error";
      payload: {
        message: string;
      };
    };

let flatgeobufModulePromise: Promise<FlatGeobufModule> | null = null;
const FLATGEOBUF_MODULE_URLS = [
  "https://esm.sh/flatgeobuf@4.3.1/geojson?bundle",
  "https://esm.sh/flatgeobuf@4.3.1?bundle"
];
const CHUNK_SIZE = 50;
const PROGRESS_TICK = 5000;
const WEB_MERCATOR_HALF_WORLD = 20037508.34;

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

function postMessageSafe(message: WorkerResponse): void {
  self.postMessage(message);
}

function mercatorToWgs84(x: number, y: number): [number, number] {
  const lon = (x / WEB_MERCATOR_HALF_WORLD) * 180;
  const lat = (Math.atan(Math.sinh((y / WEB_MERCATOR_HALF_WORLD) * Math.PI)) * 180) / Math.PI;
  return [lon, lat];
}

function transformCoordinates(node: unknown, sourceCrs: CadastralCrs, outputCrs: CadastralCrs): unknown {
  if (sourceCrs === outputCrs) {
    return node;
  }
  if (!Array.isArray(node)) {
    return null;
  }
  if (node.length >= 2 && typeof node[0] === "number" && typeof node[1] === "number") {
    if (sourceCrs === "EPSG:3857" && outputCrs === "EPSG:4326") {
      const [lon, lat] = mercatorToWgs84(node[0], node[1]);
      return [lon, lat, ...node.slice(2)];
    }
    return null;
  }
  const transformedChildren = node.map((item) => transformCoordinates(item, sourceCrs, outputCrs));
  return transformedChildren.some((item) => item === null) ? null : transformedChildren;
}

function transformGeometry(geometry: unknown, sourceCrs: CadastralCrs, outputCrs: CadastralCrs): Record<string, unknown> | null {
  if (!geometry || typeof geometry !== "object") {
    return null;
  }
  const candidate = geometry as { type?: unknown; coordinates?: unknown; geometries?: unknown[] };
  if (typeof candidate.type !== "string") {
    return null;
  }
  if (sourceCrs === outputCrs) {
    return candidate as Record<string, unknown>;
  }
  if (candidate.type === "GeometryCollection") {
    if (!Array.isArray(candidate.geometries)) {
      return null;
    }
    const geometries = candidate.geometries.map((item) => transformGeometry(item, sourceCrs, outputCrs));
    return geometries.some((item) => item === null) ? null : { type: candidate.type, geometries };
  }
  const coordinates = transformCoordinates(candidate.coordinates, sourceCrs, outputCrs);
  return coordinates === null ? null : { type: candidate.type, coordinates };
}

function getFullRect(cadastralCrs: CadastralCrs): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  if (cadastralCrs === "EPSG:3857") {
    return {
      minX: -20037508.342789244,
      minY: -20037508.342789244,
      maxX: 20037508.342789244,
      maxY: 20037508.342789244
    };
  }
  return {
    minX: -180,
    minY: -90,
    maxX: 180,
    maxY: 90
  };
}

self.onmessage = (evt: MessageEvent<StartMessage>) => {
  void (async () => {
    const data = evt.data;
    if (!data || data.type !== "start") {
      return;
    }

    try {
      const { fgbUrl, pnuField, cadastralCrs, outputCrs, uploadedPnus } = data.payload;
      const requestedPnuSet = new Set(
        uploadedPnus.map((item) => normalizePnu(item)).filter((item) => item.length === 19)
      );
      const total = requestedPnuSet.size;
      if (total === 0) {
        postMessageSafe({ type: "done", payload: { scanned: 0, matched: 0, total: 0 } });
        return;
      }

      const flatgeobuf = await getFlatGeobufModule();
      const matchedByPnu = new Set<string>();
      const pending: LandFeature[] = [];
      let scanned = 0;
      const fullRect = getFullRect(cadastralCrs);

      for await (const feature of flatgeobuf.deserialize(fgbUrl, fullRect)) {
        scanned += 1;
        const properties = (feature.properties ?? {}) as Record<string, unknown>;
        const pnuRaw =
          properties[pnuField] ??
          properties[pnuField.toLowerCase()] ??
          properties[pnuField.toUpperCase()] ??
          properties.JIBUN ??
          properties.jibun;
        const pnu = normalizePnu(pnuRaw);

        if (requestedPnuSet.has(pnu) && !matchedByPnu.has(pnu)) {
          const geometry = transformGeometry(feature.geometry, cadastralCrs, outputCrs);
          if (!geometry) {
            continue;
          }
          matchedByPnu.add(pnu);
          pending.push({
            type: "Feature",
            geometry,
            properties: { pnu }
          });
        }

        if (pending.length >= CHUNK_SIZE) {
          postMessageSafe({
            type: "chunk",
            payload: {
              features: pending.splice(0, pending.length),
              scanned,
              matched: matchedByPnu.size,
              total
            }
          });
        }

        if (scanned % PROGRESS_TICK === 0) {
          postMessageSafe({
            type: "progress",
            payload: { scanned, matched: matchedByPnu.size, total }
          });
        }

        if (matchedByPnu.size >= total) {
          break;
        }
      }

      if (pending.length > 0) {
        postMessageSafe({
          type: "chunk",
          payload: {
            features: pending,
            scanned,
            matched: matchedByPnu.size,
            total
          }
        });
      }

      postMessageSafe({
        type: "done",
        payload: { scanned, matched: matchedByPnu.size, total }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "하이라이트 로딩 중 오류가 발생했습니다.";
      postMessageSafe({
        type: "error",
        payload: { message }
      });
    }
  })();
};
