import type { DownloadClient } from "./download-client";
import type { LandListItem, ThemeType } from "./types";

export function downloadCurrentSearchResults(params: {
  currentItems: LandListItem[];
  currentTheme: ThemeType;
  hasThemeOverrideItems: boolean;
  downloadClient: DownloadClient;
  setMapStatus: (message: string, color?: string) => void;
}): void {
  if (params.currentItems.length === 0) {
    params.setMapStatus("검색 결과가 없어 다운로드할 수 없습니다.", "#b45309");
    return;
  }
  if (params.hasThemeOverrideItems) {
    void params.downloadClient.downloadLocalSearchResultFile({
      theme: params.currentTheme,
      items: params.currentItems,
    });
    return;
  }
  void params.downloadClient.downloadSearchResultFile({
    theme: params.currentTheme,
    landIds: params.currentItems.map((item) => item.id),
  });
}
