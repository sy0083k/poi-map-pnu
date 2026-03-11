import type { LandListItem, LandSourceField, RenderedLandRecord, RenderedLandRecordMap } from "./types";

function normalizePnu(raw: unknown): string {
  return String(raw ?? "").replace(/\D/g, "");
}

function areSourceFieldsEqual(left: LandSourceField[] | undefined, right: LandSourceField[] | undefined): boolean {
  const leftFields = left ?? [];
  const rightFields = right ?? [];
  if (leftFields.length !== rightFields.length) {
    return false;
  }
  for (let index = 0; index < leftFields.length; index += 1) {
    const leftField = leftFields[index];
    const rightField = rightFields[index];
    if (
      leftField?.key !== rightField?.key ||
      leftField?.label !== rightField?.label ||
      leftField?.value !== rightField?.value
    ) {
      return false;
    }
  }
  return true;
}

export function haveRenderedPropertiesChanged(
  left: {
    list_index?: number;
    id?: number;
    pnu?: string;
    address?: string;
    land_type?: string;
    area?: number;
    property_manager?: string;
    source_fields?: LandSourceField[];
  },
  right: {
    list_index?: number;
    id?: number;
    pnu?: string;
    address?: string;
    land_type?: string;
    area?: number;
    property_manager?: string;
    source_fields?: LandSourceField[];
  }
): boolean {
  return (
    left.list_index !== right.list_index ||
    left.id !== right.id ||
    left.pnu !== right.pnu ||
    left.address !== right.address ||
    left.land_type !== right.land_type ||
    left.area !== right.area ||
    left.property_manager !== right.property_manager ||
    !areSourceFieldsEqual(left.source_fields, right.source_fields)
  );
}

export function createRenderedLandRecordMap(
  items: LandListItem[],
  geometriesByPnu: Map<string, unknown>
): RenderedLandRecordMap {
  const next = new Map<string, RenderedLandRecord>();
  items.forEach((item, index) => {
    const normalizedPnu = normalizePnu(item.pnu);
    if (!normalizedPnu) {
      return;
    }
    const geometry = geometriesByPnu.get(normalizedPnu);
    if (!geometry) {
      return;
    }
    next.set(normalizedPnu, {
      pnu: normalizedPnu,
      geometry,
      properties: {
        list_index: index,
        id: item.id,
        pnu: item.pnu,
        address: item.address,
        land_type: item.land_type,
        area: item.area,
        property_manager: item.property_manager,
        source_fields: item.sourceFields ?? []
      }
    });
  });
  return next;
}

export function normalizeRenderedRecordPnu(raw: unknown): string {
  return normalizePnu(raw);
}

function toCoordinateArray(value: unknown): unknown[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  return value;
}

function foldGeometryBbox(
  coordinates: unknown,
  bbox: [number, number, number, number] | null
): [number, number, number, number] | null {
  const items = toCoordinateArray(coordinates);
  if (!items) {
    return bbox;
  }
  if (
    items.length >= 2 &&
    typeof items[0] === "number" &&
    Number.isFinite(items[0]) &&
    typeof items[1] === "number" &&
    Number.isFinite(items[1])
  ) {
    const x = items[0];
    const y = items[1];
    return bbox
      ? [Math.min(bbox[0], x), Math.min(bbox[1], y), Math.max(bbox[2], x), Math.max(bbox[3], y)]
      : [x, y, x, y];
  }

  let nextBbox = bbox;
  items.forEach((child) => {
    nextBbox = foldGeometryBbox(child, nextBbox);
  });
  return nextBbox;
}

export function computeGeometryBbox(geometry: unknown): [number, number, number, number] | null {
  if (!geometry || typeof geometry !== "object") {
    return null;
  }
  const coordinates = (geometry as { coordinates?: unknown }).coordinates;
  return foldGeometryBbox(coordinates, null);
}

export function intersectsGeometryBbox(
  geometry: unknown,
  extent: [number, number, number, number]
): boolean {
  const bbox = computeGeometryBbox(geometry);
  if (!bbox) {
    return false;
  }
  return bbox[0] <= extent[2] && bbox[2] >= extent[0] && bbox[1] <= extent[3] && bbox[3] >= extent[1];
}
