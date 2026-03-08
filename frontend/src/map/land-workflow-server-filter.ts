import { HttpError } from "../http";

import type { FilterValues } from "./filters";
import type { LandListItem, ThemeType } from "./types";

type ServerFilterDeps = {
  loadLandListItems: (theme: ThemeType, filters?: FilterValues) => Promise<LandListItem[]>;
  setMapStatus: (message: string, color?: string) => void;
};

export async function loadServerFilteredItems(params: {
  deps: ServerFilterDeps;
  theme: ThemeType;
  values: FilterValues;
  originalItems: LandListItem[];
  isServerFilterEnabled: boolean;
  localFilter: (items: LandListItem[], values: FilterValues) => LandListItem[];
}): Promise<LandListItem[]> {
  if (!params.isServerFilterEnabled) {
    return params.localFilter(params.originalItems, params.values);
  }

  try {
    return await params.deps.loadLandListItems(params.theme, params.values);
  } catch (error) {
    const fallbackMessage =
      error instanceof HttpError
        ? `서버 검색 실패: ${error.message}. 기존 로컬 데이터로 표시합니다.`
        : "서버 검색 실패로 기존 로컬 데이터로 표시합니다.";
    params.deps.setMapStatus(fallbackMessage, "#b45309");
    return params.localFilter(params.originalItems, params.values);
  }
}
