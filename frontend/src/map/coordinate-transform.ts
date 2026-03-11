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

export function wgs84ToMercator(lon: number, lat: number): [number, number] {
  const boundedLat = Math.max(Math.min(lat, 89.999999), -89.999999);
  const x = (lon * WEB_MERCATOR_HALF_WORLD) / 180;
  const y = (WEB_MERCATOR_HALF_WORLD * Math.log(Math.tan((Math.PI / 4) + (boundedLat * Math.PI) / 360))) / Math.PI;
  return [x, y];
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

export function transformBboxToOutputCrs(
  bbox: [number, number, number, number],
  sourceCrs: CadastralCrs,
  outputCrs: CadastralCrs
): [number, number, number, number] | null {
  if (sourceCrs === outputCrs) {
    return bbox;
  }

  let minCorner: [number, number] | null = null;
  let maxCorner: [number, number] | null = null;
  if (sourceCrs === "EPSG:4326" && outputCrs === "EPSG:3857") {
    minCorner = wgs84ToMercator(bbox[0], bbox[1]);
    maxCorner = wgs84ToMercator(bbox[2], bbox[3]);
  } else if (sourceCrs === "EPSG:3857" && outputCrs === "EPSG:4326") {
    minCorner = mercatorToWgs84(bbox[0], bbox[1]);
    maxCorner = mercatorToWgs84(bbox[2], bbox[3]);
  }

  if (!minCorner || !maxCorner) {
    return null;
  }

  return [
    Math.min(minCorner[0], maxCorner[0]),
    Math.min(minCorner[1], maxCorner[1]),
    Math.max(minCorner[0], maxCorner[0]),
    Math.max(minCorner[1], maxCorner[1])
  ];
}
