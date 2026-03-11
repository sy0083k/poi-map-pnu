import { HttpError } from "../http";
import { downloadCurrentSearchResults as downloadSearchResults } from "./land-workflow-download";
import { hasMultipleManagers, prepareUploadedHighlights, reloadCadastralLayers } from "./land-workflow-highlight";
import type { FilterValues, Filters } from "./filters";
import type { HighlightGeometryRecord } from "./rendered-land-records";
import type { DownloadClient } from "./download-client";
import type { ListPanel } from "./list-panel";
import type { MapView } from "./map-view";
import type { MapStateStore } from "./state";
import type { Telemetry } from "./telemetry";
import type { LandClickSource, LandFeatureCollection, LandListItem, LandListPageResponse, MapConfig, ThemeType } from "./types";

type SelectOptions = {
  shouldFit: boolean;
  clickSource?: LandClickSource;
};

type EngineAwareMapView = Omit<MapView, "getEngine"> & {
  getEngine: () => "openlayers" | "maplibre";
};

type ListQueryMode = "empty" | "override" | "search" | "viewport";

type LandWorkflowDeps = {
  state: MapStateStore;
  telemetry: Telemetry;
  mapView: EngineAwareMapView;
  listPanel: ListPanel;
  filters: Filters;
  downloadClient: DownloadClient;
  setMapStatus: (message: string, color?: string) => void;
  getThemeLabel: (theme: ThemeType) => string;
  loadAllLandListItems: (theme: ThemeType, filters?: FilterValues) => Promise<LandListItem[]>;
  loadFirstLandListPage: (
    theme: ThemeType,
    filters?: FilterValues,
    bbox?: [number, number, number, number],
    bboxCrs?: "EPSG:3857" | "EPSG:4326"
  ) => Promise<LandListPageResponse>;
  loadNextLandListPage: (
    theme: ThemeType,
    cursor: string,
    filters?: FilterValues,
    bbox?: [number, number, number, number],
    bboxCrs?: "EPSG:3857" | "EPSG:4326"
  ) => Promise<LandListPageResponse>;
};

const MAX_DATASET_INDEX_CACHE_SIZE = 5;
const MAX_INITIAL_HIGHLIGHTS = 300;
const VIEWPORT_CONTEXT_INFLATE_FACTOR = 1.5;
const LIST_PAGE_LIMIT_HINT = 500;

function inflateExtent(
  extent: [number, number, number, number],
  factor: number
): [number, number, number, number] {
  const [minX, minY, maxX, maxY] = extent;
  const width = Math.max(maxX - minX, 0.0001);
  const height = Math.max(maxY - minY, 0.0001);
  const extraWidth = ((factor - 1) * width) / 2;
  const extraHeight = ((factor - 1) * height) / 2;
  return [minX - extraWidth, minY - extraHeight, maxX + extraWidth, maxY + extraHeight];
}

function bboxContainsPoint(
  bbox: [number, number, number, number],
  point: [number, number]
): boolean {
  return point[0] >= bbox[0] && point[0] <= bbox[2] && point[1] >= bbox[1] && point[1] <= bbox[3];
}

function normalizePnuForSort(raw: string): string {
  return raw.replace(/\D/g, "");
}

function comparePnuAscending(left: string, right: string): number {
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
}

function sortItemsByPnuAscending(items: LandListItem[]): LandListItem[] {
  return [...items].sort((a, b) => {
    const pnuCompare = comparePnuAscending(normalizePnuForSort(a.pnu), normalizePnuForSort(b.pnu));
    if (pnuCompare !== 0) {
      return pnuCompare;
    }
    return a.id - b.id;
  });
}

function mergeUniqueItems(base: LandListItem[], incoming: LandListItem[]): LandListItem[] {
  const byId = new Map<number, LandListItem>();
  [...base, ...incoming].forEach((item) => {
    byId.set(item.id, item);
  });
  return sortItemsByPnuAscending(Array.from(byId.values()));
}

function bboxKey(bbox: [number, number, number, number] | null): string {
  if (!bbox) {
    return "bbox:none";
  }
  return bbox.map((value) => value.toFixed(4)).join(",");
}

export function createLandWorkflow(deps: LandWorkflowDeps) {
  let config: MapConfig | null = null;
  let uploadedHighlightFeatures: LandFeatureCollection = { type: "FeatureCollection", features: [] };
  let uploadedHighlightDatasetKey = "";
  let uploadedHighlightsRequestSeq = 0;
  let themeLoadRequestSeq = 0;
  let highlightLoadAbortController: AbortController | null = null;
  let lastRenderedHighlightSignature = "";
  let pendingHighlightRenderSignature = "";
  let highlightRenderRequestSeq = 0;
  let currentListMode: ListQueryMode = "empty";
  let currentListCursor: string | null = null;
  let currentListFilters: FilterValues | undefined;
  let currentListBbox: [number, number, number, number] | null = null;
  let currentListTotalCount = 0;
  let lastViewportContextKey = "";
  const featuresByPnuIndexByDataset = new Map<
    string,
    { recordsByPnu: Map<string, HighlightGeometryRecord>; sourceFeatureCount: number }
  >();
  const overrideItemsByTheme = new Map<ThemeType, LandListItem[]>();
  const serverFilterTheme: ThemeType = "city_owned";
  const getRenderProjection = (): MapConfig["cadastralCrs"] => config?.cadastralCrs ?? "EPSG:4326";

  const getViewportBboxCrs = (): "EPSG:3857" | "EPSG:4326" =>
    deps.mapView.getEngine() === "maplibre" ? "EPSG:4326" : (config?.cadastralCrs ?? "EPSG:4326");

  const updateNavigation = (): void => {
    deps.listPanel.updateNavigation(
      deps.state.getCurrentIndex(),
      currentListTotalCount,
      deps.state.getCurrentItems().length
    );
  };

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
    setFeaturesByPnuIndex: (
      datasetKey: string,
      entry: { recordsByPnu: Map<string, HighlightGeometryRecord>; sourceFeatureCount: number }
    ) => {
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
    updateNavigation,
    getLastRenderedSignature: () => lastRenderedHighlightSignature,
    setLastRenderedSignature: (value: string) => {
      lastRenderedHighlightSignature = value;
    },
    getPendingRenderSignature: () => pendingHighlightRenderSignature,
    setPendingRenderSignature: (value: string) => {
      pendingHighlightRenderSignature = value;
    },
    getRenderRequestSeq: () => highlightRenderRequestSeq,
    setRenderRequestSeq: (value: number) => {
      highlightRenderRequestSeq = value;
    },
    getCurrentIndex: () => deps.state.getCurrentIndex(),
    getCurrentExtent: () => deps.mapView.getCurrentExtent()
  };

  const cancelPendingHighlightRender = (): void => {
    highlightRenderRequestSeq += 1;
    pendingHighlightRenderSignature = "";
  };

  const setLastRenderedHighlightSignature = (value: string): void => {
    lastRenderedHighlightSignature = value;
    if (value !== "") {
      pendingHighlightRenderSignature = "";
    }
  };

  highlightDeps.setLastRenderedSignature = setLastRenderedHighlightSignature;

  const setConfig = (nextConfig: MapConfig): void => {
    config = nextConfig;
  };

  const waitForNextPaint = async (): Promise<void> => {
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
  };

  const getInflatedViewportBbox = (): [number, number, number, number] | null => {
    const extent = deps.mapView.getCurrentExtent();
    if (!extent || extent.length !== 4) {
      return null;
    }
    return inflateExtent(
      [extent[0], extent[1], extent[2], extent[3]],
      VIEWPORT_CONTEXT_INFLATE_FACTOR
    );
  };

  const syncSelectedIndexAfterItemSet = (items: LandListItem[]): void => {
    const currentIndex = deps.state.getCurrentIndex();
    const currentItems = deps.state.getCurrentItems();
    const selectedId =
      currentIndex >= 0 && currentIndex < currentItems.length ? currentItems[currentIndex]?.id : null;
    deps.state.setCurrentItems(items);
    if (selectedId === null) {
      return;
    }
    const nextIndex = items.findIndex((item) => item.id === selectedId);
    if (nextIndex >= 0) {
      deps.state.setCurrentIndex(nextIndex);
    }
  };

  const renderCurrentList = (): void => {
    const items = deps.state.getCurrentItems();
    deps.listPanel.render(items, (idx) => selectItem(idx, { shouldFit: true, clickSource: "list_click" }));
    deps.listPanel.setLoadMore({
      visible: currentListMode !== "empty" && currentListCursor !== null,
      disabled: false,
      label: "목록 더 불러오기",
      onClick: () => {
        void loadMoreCurrentQuery();
      }
    });
    updateNavigation();
  };

  const prepareContextHighlights = async (
    items: LandListItem[],
    bbox: [number, number, number, number] | null
  ): Promise<void> => {
    await waitForNextPaint();
    await prepareUploadedHighlights(highlightDeps, items, {
      bbox: bbox ?? undefined,
      bboxCrs: bbox ? getViewportBboxCrs() : undefined,
      maxPnus: MAX_INITIAL_HIGHLIGHTS
    });
  };

  const loadSelectionHighlight = async (index: number): Promise<void> => {
    const selected = deps.state.getCurrentItems()[index];
    if (!selected) {
      return;
    }
    await prepareUploadedHighlights(highlightDeps, [selected], { maxPnus: 1 });
    const movedAfterReload = deps.mapView.selectFeatureByIndex(index, { shouldFit: true });
    if (!movedAfterReload) {
      deps.setMapStatus("선택한 필지 하이라이트를 찾지 못했습니다.", "#b45309");
      return;
    }
    updateNavigation();
    deps.listPanel.scrollTo(index);
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
      deps.setMapStatus("선택한 필지 하이라이트를 다시 준비하는 중입니다...", "#166534");
      void loadSelectionHighlight(index);
      return;
    }
    updateNavigation();
    deps.listPanel.scrollTo(index);
  };

  const fetchListPage = async (params: {
    theme: ThemeType;
    filters?: FilterValues;
    cursor?: string | null;
    bbox?: [number, number, number, number];
  }): Promise<LandListPageResponse> => {
    if (params.cursor) {
      return deps.loadNextLandListPage(
        params.theme,
        params.cursor,
        params.filters,
        params.bbox,
        params.bbox ? getViewportBboxCrs() : undefined
      );
    }
    return deps.loadFirstLandListPage(
      params.theme,
      params.filters,
      params.bbox,
      params.bbox ? getViewportBboxCrs() : undefined
    );
  };

  const applyPageToState = (page: LandListPageResponse, options: {
    append: boolean;
    mode: ListQueryMode;
    filters?: FilterValues;
    bbox?: [number, number, number, number] | null;
  }): LandListItem[] => {
    const nextItems = options.append
      ? mergeUniqueItems(deps.state.getCurrentItems(), page.items)
      : sortItemsByPnuAscending(page.items);
    deps.state.setOriginalItems(nextItems);
    syncSelectedIndexAfterItemSet(nextItems);
    currentListMode = options.mode;
    currentListCursor = page.nextCursor;
    currentListFilters = options.filters;
    currentListBbox = options.bbox ?? null;
    currentListTotalCount = page.totalCount;
    renderCurrentList();
    return nextItems;
  };

  const loadViewportContext = async (options?: {
    append?: boolean;
    fromMoveEnd?: boolean;
  }): Promise<void> => {
    if (deps.state.getCurrentTheme() !== "city_owned" || overrideItemsByTheme.has("city_owned")) {
      return;
    }
    const bbox = getInflatedViewportBbox();
    const bboxHash = bboxKey(bbox);
    if (options?.fromMoveEnd && bboxHash === lastViewportContextKey) {
      return;
    }
    const page = await fetchListPage({
      theme: "city_owned",
      bbox: bbox ?? undefined
    });
    const nextItems = applyPageToState(page, {
      append: Boolean(options?.append) || Boolean(options?.fromMoveEnd),
      mode: "viewport",
      bbox
    });
    lastViewportContextKey = bboxHash;
    await prepareContextHighlights(nextItems, bbox);
  };

  const loadMoreCurrentQuery = async (): Promise<void> => {
    if (deps.state.getCurrentTheme() !== "city_owned" || !currentListCursor) {
      return;
    }
    const page = await fetchListPage({
      theme: "city_owned",
      cursor: currentListCursor,
      filters: currentListMode === "search" ? currentListFilters : undefined,
      bbox: currentListMode === "viewport" ? currentListBbox ?? undefined : undefined
    });
    const mergedItems = applyPageToState(page, {
      append: true,
      mode: currentListMode,
      filters: currentListMode === "search" ? currentListFilters : undefined,
      bbox: currentListMode === "viewport" ? currentListBbox : null
    });
    if (currentListMode === "viewport") {
      await prepareContextHighlights(mergedItems, currentListBbox);
      return;
    }
    await prepareContextHighlights(mergedItems, getInflatedViewportBbox());
  };

  const applyFilters = async (trackEvent = false): Promise<void> => {
    const values = deps.filters.getValues();
    const currentTheme = deps.state.getCurrentTheme();
    if (currentTheme !== serverFilterTheme || overrideItemsByTheme.has(currentTheme)) {
      const filteredItems = deps.filters.filterItems(deps.state.getOriginalItems() ?? [], values);
      const sortedItems = sortItemsByPnuAscending(filteredItems);
      deps.state.setOriginalItems(sortedItems);
      syncSelectedIndexAfterItemSet(sortedItems);
      renderCurrentList();
      await reloadCadastralLayers(highlightDeps);
      return;
    }

    const page = await deps.loadFirstLandListPage(currentTheme, values);
    const sortedItems = sortItemsByPnuAscending(page.items);
    if (trackEvent) {
      deps.telemetry.trackSearchEvent(
        values.minArea,
        values.searchTerm,
        values.rawSearchTerm,
        values.rawMinAreaInput,
        values.rawMaxAreaInput,
        "false"
      );
    }

    if (values.propertyManagerTerm !== "") {
      const uniqueManagers = hasMultipleManagers(sortedItems);
      if (uniqueManagers.length >= 2) {
        deps.state.setOriginalItems([]);
        deps.state.setCurrentItems([]);
        deps.listPanel.render([], () => {});
        deps.listPanel.setLoadMore({ visible: false });
        deps.mapView.clearInfoPanelContentOnly();
        updateNavigation();
        cancelPendingHighlightRender();
        deps.mapView.clearRenderedFeatures();
        deps.setMapStatus(`재산관리관 다중 검출: ${uniqueManagers.join(", ")}. 정확한 재산관리관을 입력하세요.`, "#1d4ed8");
        currentListMode = "search";
        currentListCursor = null;
        currentListFilters = values;
        currentListBbox = null;
        currentListTotalCount = 0;
        return;
      }
    }

    deps.state.setOriginalItems(sortedItems);
    syncSelectedIndexAfterItemSet(sortedItems);
    currentListMode = "search";
    currentListCursor = page.nextCursor;
    currentListFilters = values;
    currentListBbox = null;
    currentListTotalCount = page.totalCount;
    deps.mapView.clearInfoPanel();
    renderCurrentList();
    await prepareContextHighlights(sortedItems, getInflatedViewportBbox());
    if (trackEvent) {
      const topVisibleIndex = findMinVisiblePnuIndex(deps.state.getCurrentItems());
      if (topVisibleIndex !== null) {
        deps.listPanel.scrollTo(topVisibleIndex, { alignToTop: true });
      }
    }
  };

  const loadThemeData = async (theme: ThemeType): Promise<void> => {
    const seq = ++themeLoadRequestSeq;
    const themeLabel = deps.getThemeLabel(theme);
    const overrideItems = overrideItemsByTheme.get(theme) ?? null;
    currentListCursor = null;
    currentListFilters = undefined;
    currentListBbox = null;
    currentListTotalCount = 0;
    lastViewportContextKey = "";

    if (overrideItems) {
      currentListMode = "override";
      currentListTotalCount = overrideItems.length;
      deps.listPanel.setStatus(`${themeLabel} 목록을 로컬 업로드 데이터로 표시합니다.`);
      deps.state.setOriginalItems(overrideItems);
      syncSelectedIndexAfterItemSet(overrideItems);
      renderCurrentList();
      deps.setMapStatus(`${themeLabel} 하이라이트를 준비하는 중입니다...`, "#166534");
      await waitForNextPaint();
      if (seq === themeLoadRequestSeq) {
        await prepareUploadedHighlights(highlightDeps, overrideItems, {
          maxPnus: MAX_INITIAL_HIGHLIGHTS
        });
      }
      return;
    }

    if (theme === "national_public") {
      currentListMode = "empty";
      currentListTotalCount = 0;
      deps.state.setOriginalItems([]);
      deps.state.setCurrentItems([]);
      deps.listPanel.clear();
      deps.listPanel.setLoadMore({ visible: false });
      deps.mapView.clearInfoPanel();
      updateNavigation();
      cancelPendingHighlightRender();
      uploadedHighlightFeatures = { type: "FeatureCollection", features: [] };
      uploadedHighlightDatasetKey = "empty";
      deps.mapView.clearRenderedFeatures();
      deps.setMapStatus("표시할 파일을 적용하면 목록이 표시됩니다.", "#1f2937");
      return;
    }

    try {
      deps.listPanel.setStatus(`${themeLabel} 주변 목록을 불러오는 중입니다...`);
      await loadViewportContext();
      if (seq !== themeLoadRequestSeq) {
        return;
      }
      deps.setMapStatus(`${themeLabel} 주변 하이라이트를 표시했습니다.`, "#166534");
    } catch (error) {
      if (seq !== themeLoadRequestSeq) {
        return;
      }
      deps.state.setOriginalItems([]);
      deps.state.setCurrentItems([]);
      currentListMode = "empty";
      currentListCursor = null;
      currentListTotalCount = 0;
      cancelPendingHighlightRender();
      deps.listPanel.setLoadMore({ visible: false });
      const fallbackMessage =
        error instanceof HttpError
          ? `${themeLabel} 초기 목록 로딩 실패: ${error.message}`
          : `${themeLabel} 초기 목록 로딩에 실패했습니다.`;
      deps.listPanel.setStatus(fallbackMessage, "#b45309");
      deps.setMapStatus(fallbackMessage, "#b45309");
    }
  };

  const resetFilters = (syncDesktopToMobileInputs: () => void): void => {
    deps.filters.reset();
    syncDesktopToMobileInputs();
    deps.mapView.clearInfoPanel();
    if (deps.state.getCurrentTheme() === "city_owned" && !overrideItemsByTheme.has("city_owned")) {
      void loadViewportContext();
      return;
    }
    void applyFilters(false);
  };

  const navigateItem = (direction: number): void => {
    const nextIndex = deps.state.getCurrentIndex() + direction;
    if (nextIndex < 0 || nextIndex >= deps.state.getCurrentItems().length) {
      return;
    }
    selectItem(nextIndex, { shouldFit: true, clickSource: direction < 0 ? "nav_prev" : "nav_next" });
  };

  const handleMoveEnd = (): void => {
    if (deps.state.getCurrentTheme() !== "city_owned") {
      return;
    }
    if (overrideItemsByTheme.has("city_owned") || currentListMode === "search") {
      return;
    }
    void loadViewportContext({ fromMoveEnd: true });
  };

  const downloadCurrentSearchResults = (): void => {
    if (deps.state.getCurrentTheme() === "city_owned" && currentListMode === "search") {
      void (async () => {
        const items = await deps.loadAllLandListItems("city_owned", currentListFilters);
        downloadSearchResults({
          currentItems: items,
          currentTheme: deps.state.getCurrentTheme(),
          hasThemeOverrideItems: false,
          downloadClient: deps.downloadClient,
          setMapStatus: deps.setMapStatus,
        });
      })();
      return;
    }
    downloadSearchResults({
      currentItems: deps.state.getCurrentItems(),
      currentTheme: deps.state.getCurrentTheme(),
      hasThemeOverrideItems: overrideItemsByTheme.has(deps.state.getCurrentTheme()),
      downloadClient: deps.downloadClient,
      setMapStatus: deps.setMapStatus,
    });
  };

  return {
    applyFilters,
    downloadCurrentSearchResults,
    handleMoveEnd,
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
