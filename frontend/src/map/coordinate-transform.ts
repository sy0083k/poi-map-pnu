import type { CadastralCrs } from "./types";

const WEB_MERCATOR_HALF_WORLD = 20037508.34;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function mercatorToWgs84(x: number, y: number): [number, number] {
  const lon = (x / WEB_MERCATOR_HALF_WORLD) * 180;
  const lat = (Math.atan(Math.sinh((y / WEB_MERCATOR_HALF_WORLD) * Math.PI)) * 180) / Math.PI;
  return [lon, lat];
}

export function toWgs84CoordinatePair(
  x: unknown,
  y: unknown,
  sourceCrs: CadastralCrs
): [number, number] | null {
  if (!isFiniteNumber(x) || !isFiniteNumber(y)) {
    return null;
  }
  if (sourceCrs === "EPSG:4326") {
    return x >= -180 && x <= 180 && y >= -90 && y <= 90 ? [x, y] : null;
  }
  if (sourceCrs === "EPSG:3857") {
    const [lon, lat] = mercatorToWgs84(x, y);
    return lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90 ? [lon, lat] : null;
  }
  return null;
}

export function transformCoordinatesToOutputCrs(
  node: unknown,
  sourceCrs: CadastralCrs,
  outputCrs: CadastralCrs
): unknown {
  if (!Array.isArray(node) && !ArrayBuffer.isView(node) && !(!!node && typeof node === "object" && Symbol.iterator in node)) {
    return null;
  }
  const items = Array.from(node as Iterable<unknown>);
  if (items.length >= 2 && isFiniteNumber(items[0]) && isFiniteNumber(items[1])) {
    if (sourceCrs === outputCrs) {
      return [...items];
    }
    if (outputCrs === "EPSG:4326") {
      const transformed = toWgs84CoordinatePair(items[0], items[1], sourceCrs);
      return transformed ? [transformed[0], transformed[1], ...items.slice(2)] : null;
    }
    return null;
  }
  const transformedChildren = items.map((item) => transformCoordinatesToOutputCrs(item, sourceCrs, outputCrs));
  return transformedChildren.some((item) => item === null) ? null : transformedChildren;
}
