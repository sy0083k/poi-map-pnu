import { HttpError } from "../http";
import { downloadCurrentSearchResults as downloadSearchResults } from "./land-workflow-download";
import { hasMultipleManagers, prepareUploadedHighlights, reloadCadastralLayers } from "./land-workflow-highlight";
import { loadServerFilteredItems } from "./land-workflow-server-filter";
import type { DownloadClient } from "./download-client";
import type { Filters } from "./filters";
import type { ListPanel } from "./list-panel";
import type { MapView } from "./map-view";
import type { MapStateStore } from "./state";
import type { Telemetry } from "./telemetry";
import type { LandClickSource, LandFeatureCollection, LandListItem, MapConfig, ThemeType } from "./types";

type SelectOptions = {
  shouldFit: boolean;
  clickSource?: LandClickSource;
};

type LandWorkflowDeps = {
  state: MapStateStore;
  telemetry: Telemetry;
  mapView: MapView;
  listPanel: ListPanel;
  filters: Filters;
  downloadClient: DownloadClient;
  setMapStatus: (message: string, color?: string) => void;
  getThemeLabel: (theme: ThemeType) => string;
  loadLandListItems: (theme: ThemeType, filters?: ReturnType<Filters["getValues"]>) => Promise<LandListItem[]>;
};

export function createLandWorkflow(deps: LandWorkflowDeps) {
  let config: MapConfig | null = null;
  let uploadedHighlightFeatures: LandFeatureCollection = { type: "FeatureCollection", features: [] };
  let uploadedHighlightsRequestSeq = 0;
  let themeLoadRequestSeq = 0;
  let highlightLoadAbortController: AbortController | null = null;
  const overrideItemsByTheme = new Map<ThemeType, LandListItem[]>();
  const serverFilterTheme: ThemeType = "city_owned";

  const updateNavigation = (): void => {
    deps.listPanel.updateNavigation(deps.state.getCurrentIndex(), deps.state.getCurrentItems().length);
  };

  const highlightDeps = {
    getConfig: () => config,
    getCurrentTheme: () => deps.state.getCurrentTheme(),
    getCurrentItems: () => deps.state.getCurrentItems(),
    getUploadedHighlightFeatures: () => uploadedHighlightFeatures,
    setUploadedHighlightFeatures: (value: LandFeatureCollection) => {
      uploadedHighlightFeatures = value;
    },
    getUploadedHighlightsRequestSeq: () => uploadedHighlightsRequestSeq,
    setUploadedHighlightsRequestSeq: (value: number) => {
      uploadedHighlightsRequestSeq = value;
    },
    getHighlightLoadAbortController: () => highlightLoadAbortController,
    setHighlightLoadAbortController: (value: AbortController | null) => {
      highlightLoadAbortController = value;
    },
    mapView: deps.mapView,
    setMapStatus: deps.setMapStatus,
    getThemeLabel: deps.getThemeLabel,
    updateNavigation
  };

  const setConfig = (nextConfig: MapConfig): void => {
    config = nextConfig;
  };

  const selectItem = (index: number, options: SelectOptions): void => {
    const currentItems = deps.state.getCurrentItems();
    if (index < 0 || index >= currentItems.length) {
      return;
    }
    deps.state.setCurrentIndex(index);
    if (options.clickSource) {
      const selected = currentItems[index];
      deps.telemetry.trackLandClickEvent(selected?.address || "", options.clickSource, selected?.id);
    }
    const moved = deps.mapView.selectFeatureByIndex(index, { shouldFit: options.shouldFit });
    if (!moved) {
      deps.setMapStatus("선택한 필지 하이라이트를 찾지 못했습니다.", "#b45309");
    }
    updateNavigation();
    deps.listPanel.scrollTo(index);
  };

  const applyFilters = async (trackEvent = false): Promise<void> => {
    const originalItems = deps.state.getOriginalItems() ?? [];
    const values = deps.filters.getValues();
    const currentTheme = deps.state.getCurrentTheme();
    const shouldUseServerFilters = currentTheme === serverFilterTheme && !overrideItemsByTheme.has(currentTheme);
    const filteredItems = await loadServerFilteredItems({
      deps: {
        loadLandListItems: deps.loadLandListItems,
        setMapStatus: deps.setMapStatus,
      },
      theme: currentTheme,
      values,
      originalItems,
      isServerFilterEnabled: shouldUseServerFilters,
      localFilter: deps.filters.filterItems,
    });
    if (shouldUseServerFilters) {
      deps.state.setOriginalItems(filteredItems);
    }
    if (trackEvent) {
      deps.telemetry.trackSearchEvent(values.minArea, values.searchTerm, values.rawSearchTerm, values.rawMinAreaInput, values.rawMaxAreaInput, "false");
    }

    if (values.propertyManagerTerm !== "") {
      const uniqueManagers = hasMultipleManagers(filteredItems);
      if (uniqueManagers.length >= 2) {
        deps.state.setCurrentItems([]);
        deps.listPanel.render([], () => {});
        deps.mapView.clearInfoPanel();
        updateNavigation();
        if (config) {
          deps.mapView.renderFeatures({ type: "FeatureCollection", features: [] }, { dataProjection: config.cadastralCrs });
        }
        deps.setMapStatus(`재산관리관 다중 검출: ${uniqueManagers.join(", ")}. 정확한 재산관리관을 입력하세요.`, "#1d4ed8");
        return;
      }
    }

    deps.state.setCurrentItems(filteredItems);
    deps.listPanel.render(filteredItems, (idx) => selectItem(idx, { shouldFit: true, clickSource: "list_click" }));
    deps.mapView.clearInfoPanel();
    updateNavigation();
    await reloadCadastralLayers(highlightDeps);
  };

  const loadThemeData = async (theme: ThemeType): Promise<void> => {
    const seq = ++themeLoadRequestSeq;
    const themeLabel = deps.getThemeLabel(theme);
    const overrideItems = overrideItemsByTheme.get(theme) ?? null;
    if (overrideItems) {
      deps.listPanel.setStatus(`${themeLabel} 목록을 로컬 업로드 데이터로 표시합니다.`);
      deps.state.setOriginalItems(overrideItems);
      await applyFilters(false);
      void prepareUploadedHighlights(highlightDeps, overrideItems);
      return;
    }

    if (theme === "national_public") {
      deps.state.setOriginalItems([]);
      deps.state.setCurrentItems([]);
      deps.listPanel.clear();
      deps.mapView.clearInfoPanel();
      updateNavigation();
      uploadedHighlightFeatures = { type: "FeatureCollection", features: [] };
      if (config) {
        deps.mapView.renderFeatures({ type: "FeatureCollection", features: [] }, { dataProjection: config.cadastralCrs });
      }
      deps.setMapStatus("표시할 파일을 적용하면 목록이 표시됩니다.", "#1f2937");
      return;
    }
    try {
      deps.listPanel.setStatus(`${themeLabel} 목록을 불러오는 중입니다...`);
      const items = await deps.loadLandListItems(theme);
      if (seq !== themeLoadRequestSeq) {
        return;
      }
      deps.state.setOriginalItems(items);
      deps.state.setCurrentItems(items);
      deps.listPanel.render(items, (idx) => selectItem(idx, { shouldFit: true, clickSource: "list_click" }));
      deps.mapView.clearInfoPanel();
      updateNavigation();
      await reloadCadastralLayers(highlightDeps);
      void prepareUploadedHighlights(highlightDeps, items);
    } catch (error) {
      if (seq !== themeLoadRequestSeq) {
        return;
      }
      deps.state.setOriginalItems([]);
      await applyFilters(false);
      const fallbackMessage = error instanceof HttpError ? `${themeLabel} 목록 로딩 실패: ${error.message} (하이라이트 없이 표시됩니다.)` : `${themeLabel} 목록 로딩에 실패했습니다. 하이라이트 없이 표시합니다.`;
      deps.listPanel.setStatus(fallbackMessage, "#b45309");
      deps.setMapStatus(fallbackMessage, "#b45309");
    }
  };

  const resetFilters = (syncDesktopToMobileInputs: () => void): void => {
    deps.filters.reset();
    syncDesktopToMobileInputs();
    deps.mapView.clearInfoPanel();
    void applyFilters(false);
  };

  const navigateItem = (direction: number): void => {
    const nextIndex = deps.state.getCurrentIndex() + direction;
    if (nextIndex < 0 || nextIndex >= deps.state.getCurrentItems().length) {
      return;
    }
    selectItem(nextIndex, { shouldFit: true, clickSource: direction < 0 ? "nav_prev" : "nav_next" });
  };

  const downloadCurrentSearchResults = (): void =>
    downloadSearchResults({
      currentItems: deps.state.getCurrentItems(),
      currentTheme: deps.state.getCurrentTheme(),
      hasThemeOverrideItems: overrideItemsByTheme.has(deps.state.getCurrentTheme()),
      downloadClient: deps.downloadClient,
      setMapStatus: deps.setMapStatus,
    });

  return {
    applyFilters,
    downloadCurrentSearchResults,
    loadThemeData,
    navigateItem,
    resetFilters,
    selectItem,
    setConfig,
    setThemeOverrideItems: (theme: ThemeType, items: LandListItem[]) => overrideItemsByTheme.set(theme, items),
    clearThemeOverrideItems: (theme: ThemeType) => overrideItemsByTheme.delete(theme),
    hasThemeOverrideItems: (theme: ThemeType) => overrideItemsByTheme.has(theme)
  };
}

export type LandWorkflow = ReturnType<typeof createLandWorkflow>;
