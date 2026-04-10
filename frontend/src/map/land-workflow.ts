import { HttpError } from "../http";
import { downloadCurrentSearchResults as downloadSearchResults } from "./land-workflow-download";
import { hasMultipleManagers, prepareUploadedHighlights, reloadCadastralLayers } from "./land-workflow-highlight";
import { loadServerFilteredItems } from "./land-workflow-server-filter";
import type { DownloadClient } from "./download-client";
import type { Filters, FilterValues } from "./filters";
import type { ListPanel } from "./list-panel";
import type { MapView } from "./map-view";
import type { MapStateStore } from "./state";
import type { Telemetry } from "./telemetry";
import type {
  LandClickSource,
  LandFeatureCollection,
  LandListItem,
  MapConfig,
  ResultsSummaryChip,
  ResultsSummaryState,
  ResultsSummaryStatus,
  ThemeType
} from "./types";

type SelectOptions = {
  shouldFit: boolean;
  clickSource?: LandClickSource;
};

type ViewSelectOptions = {
  shouldFit: boolean;
  showInfoPanel?: boolean;
};

type EngineAwareMapView = Omit<MapView, "getEngine" | "selectFeatureByIndex"> & {
  getEngine: () => "openlayers" | "maplibre";
  selectFeatureByIndex: (index: number, options: ViewSelectOptions) => Promise<boolean>;
};

type LandWorkflowDeps = {
  state: MapStateStore;
  telemetry: Telemetry;
  mapView: EngineAwareMapView;
  listPanel: ListPanel;
  filters: Filters;
  downloadClient: DownloadClient;
  setMapStatus: (message: string, color?: string) => void;
  getThemeLabel: (theme: ThemeType) => string;
  loadLandListItems: (
    theme: ThemeType,
    filters?: ReturnType<Filters["getValues"]>,
    onPage?: (pageItems: LandListItem[]) => void
  ) => Promise<LandListItem[]>;
};

export function createLandWorkflow(deps: LandWorkflowDeps) {
  const MAX_DATASET_INDEX_CACHE_SIZE = 5;
  let config: MapConfig | null = null;
  let uploadedHighlightFeatures: LandFeatureCollection = { type: "FeatureCollection", features: [] };
  let uploadedHighlightDatasetKey = "";
  let uploadedHighlightsRequestSeq = 0;
  let themeLoadRequestSeq = 0;
  let highlightLoadAbortController: AbortController | null = null;
  const featuresByPnuIndexByDataset = new Map<string, { featuresByPnu: Map<string, unknown>; sourceFeatureCount: number }>();
  const overrideItemsByTheme = new Map<ThemeType, LandListItem[]>();
  const serverFilterTheme: ThemeType = "city_owned";
  const getRenderProjection = (): MapConfig["cadastralCrs"] =>
    deps.mapView.getEngine() === "maplibre" ? "EPSG:4326" : (config?.cadastralCrs ?? "EPSG:4326");

  const updateNavigation = (): void => {
    deps.listPanel.updateNavigation(deps.state.getCurrentIndex(), deps.state.getCurrentItems().length);
  };

  const buildFilterChips = (values: FilterValues): ResultsSummaryChip[] => {
    const chips: ResultsSummaryChip[] = [];
    if (values.searchTerm !== "") {
      chips.push({ label: "지역명·주소", value: values.searchTerm });
    }
    if (values.propertyUsageTerm !== "") {
      chips.push({ label: "재산용도", value: values.propertyUsageTerm });
    }
    if (values.landTypeTerm !== "") {
      chips.push({ label: "지목", value: values.landTypeTerm });
    }
    if (values.rawMinAreaInput !== "" || values.rawMaxAreaInput !== "") {
      const minArea = values.rawMinAreaInput.trim();
      const maxArea = values.rawMaxAreaInput.trim();
      const areaLabel = minArea !== "" && maxArea !== ""
        ? `${minArea}㎡~${maxArea}㎡`
        : minArea !== ""
          ? `최소 ${minArea}㎡`
          : `최대 ${maxArea}㎡`;
      chips.push({ label: "면적", value: areaLabel });
    }
    if (values.propertyManagerTerm !== "") {
      chips.push({ label: "재산관리관", value: values.propertyManagerTerm });
    }
    return chips;
  };

  const hasActiveFilters = (values: FilterValues): boolean => buildFilterChips(values).length > 0;

  const getDefaultSummaryMessage = (status: ResultsSummaryStatus, resultCount: number): string => {
    if (status === "loading") {
      return "검색 결과를 불러오는 중입니다.";
    }
    if (status === "empty") {
      return "조건에 맞는 결과가 없습니다. 조건을 줄이거나 초기화하세요.";
    }
    if (status === "blocked") {
      return "다음 작업이 필요합니다.";
    }
    if (status === "error") {
      return "검색 결과를 불러오지 못했습니다.";
    }
    if (resultCount > 0) {
      return "현재 조건의 결과가 목록과 지도에 반영되었습니다.";
    }
    return "검색 조건을 입력하거나 목록을 불러오세요.";
  };

  const updateResultsSummary = (
    items: LandListItem[],
    values = deps.filters.getValues(),
    overrides: Partial<Omit<ResultsSummaryState, "themeLabel" | "resultCount" | "filters" | "resetAvailable">> = {}
  ): void => {
    const activeFilters = hasActiveFilters(values);
    const inferredStatus: ResultsSummaryStatus = items.length > 0 ? "ready" : activeFilters ? "empty" : "idle";
    const status = overrides.status ?? inferredStatus;
    const downloadAvailable = overrides.downloadAvailable ?? (items.length > 0 && status === "ready");
    const downloadReason = overrides.downloadReason ?? (downloadAvailable ? undefined : "다운로드할 검색 결과가 없습니다.");
    deps.listPanel.updateResultsSummary({
      status,
      themeLabel: deps.getThemeLabel(deps.state.getCurrentTheme()),
      resultCount: items.length,
      filters: buildFilterChips(values),
      message: overrides.message ?? getDefaultSummaryMessage(status, items.length),
      downloadAvailable,
      downloadReason,
      resetAvailable: activeFilters,
      actionsDisabled: overrides.actionsDisabled
    });
  };

  const normalizePnuForSort = (raw: string): string => raw.replace(/\D/g, "");

  const comparePnuAscending = (left: string, right: string): number => {
    if (left === right) {
      return 0;
    }
    if (left === "") {
      return 1;
    }
    if (right === "") {
      return -1;
    }
    return left.localeCompare(right, "ko", { numeric: true });
  };

  const sortItemsByPnuAscending = (items: LandListItem[]): LandListItem[] =>
    [...items].sort((a, b) => {
      const pnuCompare = comparePnuAscending(normalizePnuForSort(a.pnu), normalizePnuForSort(b.pnu));
      if (pnuCompare !== 0) {
        return pnuCompare;
      }
      return a.id - b.id;
    });

  const findMinVisiblePnuIndex = (items: LandListItem[]): number | null => {
    const visibleIndexes = deps.mapView.getVisibleListIndexes();
    if (visibleIndexes.length === 0) {
      return null;
    }

    let bestIndex: number | null = null;
    let bestPnu = "";
    for (const index of visibleIndexes) {
      if (index < 0 || index >= items.length) {
        continue;
      }
      const normalized = normalizePnuForSort(items[index].pnu);
      if (bestIndex === null || comparePnuAscending(normalized, bestPnu) < 0) {
        bestIndex = index;
        bestPnu = normalized;
      }
    }
    return bestIndex;
  };

  const highlightDeps = {
    getConfig: () => config,
    getCurrentTheme: () => deps.state.getCurrentTheme(),
    getCurrentItems: () => deps.state.getCurrentItems(),
    getUploadedHighlightFeatures: () => uploadedHighlightFeatures,
    setUploadedHighlightFeatures: (value: LandFeatureCollection) => {
      uploadedHighlightFeatures = value;
    },
    getUploadedHighlightDatasetKey: () => uploadedHighlightDatasetKey,
    setUploadedHighlightDatasetKey: (value: string) => {
      uploadedHighlightDatasetKey = value;
    },
    getFeaturesByPnuIndex: (datasetKey: string) => featuresByPnuIndexByDataset.get(datasetKey),
    setFeaturesByPnuIndex: (datasetKey: string, entry: { featuresByPnu: Map<string, unknown>; sourceFeatureCount: number }) => {
      if (featuresByPnuIndexByDataset.has(datasetKey)) {
        featuresByPnuIndexByDataset.delete(datasetKey);
      }
      featuresByPnuIndexByDataset.set(datasetKey, entry);
      while (featuresByPnuIndexByDataset.size > MAX_DATASET_INDEX_CACHE_SIZE) {
        const oldestKey = featuresByPnuIndexByDataset.keys().next().value;
        if (!oldestKey) {
          break;
        }
        featuresByPnuIndexByDataset.delete(oldestKey);
      }
    },
    deleteFeaturesByPnuIndex: (datasetKey: string) => {
      featuresByPnuIndexByDataset.delete(datasetKey);
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

  const selectItem = async (index: number, options: SelectOptions): Promise<void> => {
    const currentItems = deps.state.getCurrentItems();
    if (index < 0 || index >= currentItems.length) {
      return;
    }
    deps.state.setCurrentIndex(index);
    if (options.clickSource) {
      const selected = currentItems[index];
      deps.telemetry.trackLandClickEvent(selected?.address || "", options.clickSource, selected?.id);
    }
    const shouldShowInfoPanel = deps.mapView.getEngine() !== "maplibre" || options.clickSource === "map_click";
    const moved = await deps.mapView.selectFeatureByIndex(index, {
      shouldFit: options.shouldFit,
      showInfoPanel: shouldShowInfoPanel
    });
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
    updateResultsSummary(deps.state.getCurrentItems(), values, {
      status: "loading",
      message: "검색 조건을 적용하는 중입니다.",
      downloadAvailable: false,
      downloadReason: "검색 결과를 불러오는 중입니다.",
      actionsDisabled: true
    });
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
    const sortedItems = sortItemsByPnuAscending(filteredItems);
    if (shouldUseServerFilters) {
      deps.state.setOriginalItems(sortedItems);
    }
    if (trackEvent) {
      deps.telemetry.trackSearchEvent(values.minArea, values.searchTerm, values.rawSearchTerm, values.rawMinAreaInput, values.rawMaxAreaInput, "false");
    }

    if (values.propertyManagerTerm !== "") {
      const uniqueManagers = hasMultipleManagers(sortedItems);
      if (uniqueManagers.length >= 2) {
        deps.state.setCurrentItems([]);
        deps.listPanel.render([], () => {});
        deps.mapView.clearInfoPanelContentOnly();
        updateNavigation();
        if (config) {
          deps.mapView.setVisibleItems([]);
          deps.mapView.renderFeatures({ type: "FeatureCollection", features: [] }, { dataProjection: getRenderProjection() });
        }
        deps.setMapStatus(`재산관리관 다중 검출: ${uniqueManagers.join(", ")}. 정확한 재산관리관을 입력하세요.`, "#1d4ed8");
        updateResultsSummary([], values, {
          status: "blocked",
          message: `재산관리관이 ${uniqueManagers.length}개 검출되었습니다. 정확한 재산관리관을 입력하세요.`,
          downloadAvailable: false,
          downloadReason: "재산관리관 조건을 더 정확히 입력해야 다운로드할 수 있습니다."
        });
        return;
      }
    }

    deps.state.setCurrentItems(sortedItems);
    deps.listPanel.render(sortedItems, (idx) => { void selectItem(idx, { shouldFit: true, clickSource: "list_click" }); });
    if (sortedItems.length === 0) {
      deps.mapView.clearInfoPanelContentOnly();
    } else {
      deps.mapView.clearInfoPanel();
    }
    updateNavigation();
    updateResultsSummary(sortedItems, values);
    await reloadCadastralLayers(highlightDeps);
    if (trackEvent && sortedItems.length > 0) {
      const topVisibleIndex = findMinVisiblePnuIndex(deps.state.getCurrentItems());
      if (topVisibleIndex === null) {
        // 뷰포트에 폴리곤 없음 → 첫 번째 항목 중심으로 pan (줌 유지, 선택 없음)
        await deps.mapView.panToItemCenter(0);
      } else {
        // 뷰포트에 이미 폴리곤 있음 → 스크롤만
        deps.listPanel.scrollTo(topVisibleIndex, { alignToTop: true });
      }
    }
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
      updateResultsSummary([], deps.filters.getValues(), {
        status: "blocked",
        message: "파일을 적용하면 검색 결과와 다운로드 대상이 표시됩니다.",
        downloadAvailable: false,
        downloadReason: "파일을 먼저 적용해야 다운로드할 수 있습니다."
      });
      uploadedHighlightFeatures = { type: "FeatureCollection", features: [] };
      uploadedHighlightDatasetKey = "empty";
      if (config) {
        deps.mapView.setVisibleItems([]);
        deps.mapView.renderFeatures({ type: "FeatureCollection", features: [] }, { dataProjection: getRenderProjection() });
      }
      deps.setMapStatus("표시할 파일을 적용하면 목록이 표시됩니다.", "#1f2937");
      return;
    }
    try {
      deps.listPanel.setStatus(`${themeLabel} 목록을 불러오는 중입니다...`);
      updateResultsSummary(deps.state.getCurrentItems(), deps.filters.getValues(), {
        status: "loading",
        message: `${themeLabel} 목록을 불러오는 중입니다.`,
        downloadAvailable: false,
        downloadReason: "목록 로딩이 끝난 뒤 다운로드할 수 있습니다.",
        actionsDisabled: true
      });

      let accumulated: LandListItem[] = [];
      let firstPageDone = false;

      const items = await deps.loadLandListItems(theme, undefined, (pageItems) => {
        if (seq !== themeLoadRequestSeq) return;
        accumulated = sortItemsByPnuAscending([...accumulated, ...pageItems]);
        deps.state.setOriginalItems(accumulated);
        deps.state.setCurrentItems(accumulated);
        deps.listPanel.render(accumulated, (idx) =>
          void selectItem(idx, { shouldFit: true, clickSource: "list_click" }));
        deps.mapView.clearInfoPanel();
        updateNavigation();
        updateResultsSummary(accumulated);
        if (!firstPageDone) {
          firstPageDone = true;
          void reloadCadastralLayers(highlightDeps);
          void prepareUploadedHighlights(highlightDeps, accumulated);
        }
      });

      if (seq !== themeLoadRequestSeq) {
        return;
      }
      const sortedItems = sortItemsByPnuAscending(items);
      deps.state.setOriginalItems(sortedItems);
      deps.state.setCurrentItems(sortedItems);
      deps.listPanel.render(sortedItems, (idx) => { void selectItem(idx, { shouldFit: true, clickSource: "list_click" }); });
      deps.mapView.clearInfoPanel();
      updateNavigation();
      updateResultsSummary(sortedItems);
      await reloadCadastralLayers(highlightDeps);
      void prepareUploadedHighlights(highlightDeps, sortedItems);
    } catch (error) {
      if (seq !== themeLoadRequestSeq) {
        return;
      }
      deps.state.setOriginalItems([]);
      await applyFilters(false);
      const fallbackMessage = error instanceof HttpError ? `${themeLabel} 목록 로딩 실패: ${error.message} (하이라이트 없이 표시됩니다.)` : `${themeLabel} 목록 로딩에 실패했습니다. 하이라이트 없이 표시합니다.`;
      deps.listPanel.setStatus(fallbackMessage, "#b45309");
      deps.setMapStatus(fallbackMessage, "#b45309");
      updateResultsSummary([], deps.filters.getValues(), {
        status: "error",
        message: fallbackMessage,
        downloadAvailable: false,
        downloadReason: "목록 로딩 오류가 해결된 뒤 다운로드할 수 있습니다."
      });
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
    void selectItem(nextIndex, { shouldFit: true, clickSource: direction < 0 ? "nav_prev" : "nav_next" });
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
