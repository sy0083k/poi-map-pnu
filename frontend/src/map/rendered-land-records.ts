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
