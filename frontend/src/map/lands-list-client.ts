import { fetchJson } from "../http";
import type { FilterValues } from "./filters";

import type { LandListItem, LandListPageResponse, ThemeType } from "./types";

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

export async function loadAllLandListItems(
  theme: ThemeType,
  filters?: FilterValues,
  onPage?: (pageItems: LandListItem[]) => void
): Promise<LandListItem[]> {
  const allItems: LandListItem[] = [];
  let cursor: string | null = null;

  while (true) {
    const query = new URLSearchParams({ limit: "500", theme });
    appendFilterQuery(query, filters);
    if (cursor) {
      query.set("cursor", cursor);
    }

    const page = await fetchJson<LandListPageResponse>(`/api/lands/list?${query.toString()}`, {
      timeoutMs: 20000
    });
    allItems.push(...page.items);
    if (onPage && page.items.length > 0) {
      onPage(page.items);
    }

    if (!page.nextCursor) {
      break;
    }
    cursor = page.nextCursor;
  }

  return allItems;
}
