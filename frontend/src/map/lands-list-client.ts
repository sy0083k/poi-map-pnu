import { fetchJson } from "../http";
import type { FilterValues } from "./filters";

import type { LandListItem, LandListPageResponse, ThemeType } from "./types";

async function yieldToBrowser(): Promise<void> {
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

function appendFilterQuery(query: URLSearchParams, filters?: FilterValues): void {
  if (!filters) {
    return;
  }

  if (filters.searchTerm !== "") {
    query.set("searchTerm", filters.searchTerm);
  }
  if (filters.rawMinAreaInput.trim() !== "") {
    query.set("minArea", filters.rawMinAreaInput.trim());
  }
  if (filters.rawMaxAreaInput.trim() !== "") {
    query.set("maxArea", filters.rawMaxAreaInput.trim());
  }
  if (filters.propertyManagerTerm !== "") {
    query.set("propertyManager", filters.propertyManagerTerm);
  }
  if (filters.propertyUsageTerm !== "") {
    query.set("propertyUsage", filters.propertyUsageTerm);
  }
  if (filters.landTypeTerm !== "") {
    query.set("landType", filters.landTypeTerm);
  }
}

type LoadLandListPageParams = {
  theme: ThemeType;
  filters?: FilterValues;
  cursor?: string | null;
  bbox?: [number, number, number, number];
  bboxCrs?: "EPSG:3857" | "EPSG:4326";
};

function buildPageQuery(params: LoadLandListPageParams): URLSearchParams {
  const query = new URLSearchParams({ limit: "500", theme: params.theme });
  appendFilterQuery(query, params.filters);
  if (params.cursor) {
    query.set("cursor", params.cursor);
  }
  if (params.bbox) {
    query.set("bbox", params.bbox.join(","));
    query.set("bboxCrs", params.bboxCrs ?? "EPSG:4326");
  }
  return query;
}

export async function loadLandListPage(params: LoadLandListPageParams): Promise<LandListPageResponse> {
  const query = buildPageQuery(params);
  return fetchJson<LandListPageResponse>(`/api/lands/list?${query.toString()}`, {
    timeoutMs: 20000
  });
}

export async function loadFirstLandListPage(
  theme: ThemeType,
  filters?: FilterValues,
  bbox?: [number, number, number, number],
  bboxCrs?: "EPSG:3857" | "EPSG:4326"
): Promise<LandListPageResponse> {
  return loadLandListPage({ theme, filters, bbox, bboxCrs });
}

export async function loadNextLandListPage(
  theme: ThemeType,
  cursor: string,
  filters?: FilterValues,
  bbox?: [number, number, number, number],
  bboxCrs?: "EPSG:3857" | "EPSG:4326"
): Promise<LandListPageResponse> {
  return loadLandListPage({ theme, cursor, filters, bbox, bboxCrs });
}

export async function loadAllLandListItems(theme: ThemeType, filters?: FilterValues): Promise<LandListItem[]> {
  const allItems: LandListItem[] = [];
  let cursor: string | null = null;
  while (true) {
    const page = await loadLandListPage({ theme, filters, cursor });
    allItems.push(...page.items);

    if (!page.nextCursor) {
      break;
    }
    cursor = page.nextCursor;
    await yieldToBrowser();
  }

  return allItems;
}
