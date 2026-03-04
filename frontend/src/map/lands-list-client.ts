import { fetchJson } from "../http";

import type { LandListItem, LandListPageResponse } from "./types";

export async function loadAllLandListItems(): Promise<LandListItem[]> {
  const allItems: LandListItem[] = [];
  let cursor: string | null = null;

  while (true) {
    const query = new URLSearchParams({ limit: "500" });
    if (cursor) {
      query.set("cursor", cursor);
    }

    const page = await fetchJson<LandListPageResponse>(`/api/lands/list?${query.toString()}`, {
      timeoutMs: 20000
    });
    allItems.push(...page.items);

    if (!page.nextCursor) {
      break;
    }
    cursor = page.nextCursor;
  }

  return allItems;
}
