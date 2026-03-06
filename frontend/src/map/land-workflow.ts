import { HttpError } from "../http";
import { loadUploadedHighlights } from "./cadastral-fgb-layer";
import { loadAllLandListItems } from "./lands-list-client";

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
};

export function createLandWorkflow(deps: LandWorkflowDeps) {
  let config: MapConfig | null = null;
  let uploadedHighlightFeatures: LandFeatureCollection = { type: "FeatureCollection", features: [] };
  let uploadedHighlightsRequestSeq = 0;
  let themeLoadRequestSeq = 0;
  let highlightLoadAbortController: AbortController | null = null;
  const overrideItemsByTheme = new Map<ThemeType, LandListItem[]>();

  const updateNavigation = (): void => {
    deps.listPanel.updateNavigation(deps.state.getCurrentIndex(), deps.state.getCurrentItems().length);
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

    const moved = deps.mapView.selectFeatureByIndex(index, {
      shouldFit: options.shouldFit
    });
    if (!moved) {
      deps.setMapStatus("선택한 필지 하이라이트를 찾지 못했습니다.", "#b45309");
    }

    updateNavigation();
    deps.listPanel.scrollTo(index);
  };

  const reloadCadastralLayers = async (): Promise<void> => {
    if (!config) {
      return;
    }

    const currentItems = deps.state.getCurrentItems();
    const featuresByPnu = new Map<string, unknown>();
    uploadedHighlightFeatures.features.forEach((feature) => {
      const pnu = String(feature.properties.pnu || "");
      if (pnu) {
        featuresByPnu.set(pnu, feature.geometry);
      }
    });

    const listLinkedFeatures = currentItems.flatMap((item, idx) => {
      const geometry = featuresByPnu.get(item.pnu);
      if (!geometry) {
        return [];
      }
      return [
        {
          type: "Feature" as const,
          geometry,
          properties: {
            list_index: idx,
            id: item.id,
            pnu: item.pnu,
            address: item.address,
            land_type: item.land_type,
            area: item.area,
            property_manager: item.property_manager,
            source_fields: item.sourceFields ?? []
          }
        }
      ];
    });

    const currentTheme = deps.state.getCurrentTheme();
    const withProperties: LandFeatureCollection = {
      type: "FeatureCollection",
      features: listLinkedFeatures
    };

    deps.mapView.renderFeatures(withProperties, { dataProjection: config.cadastralCrs });
    if (currentItems.length === 0) {
      deps.setMapStatus(`업로드 하이라이트 ${uploadedHighlightFeatures.features.length}건 준비됨`, "#166534");
    } else {
      deps.setMapStatus(
        `업로드 하이라이트 ${uploadedHighlightFeatures.features.length}건, ${deps.getThemeLabel(currentTheme)} 강조 ${withProperties.features.length}건`,
        "#166534"
      );
    }
    updateNavigation();
  };

  const prepareUploadedHighlights = async (items: LandListItem[]): Promise<void> => {
    if (!config) {
      return;
    }
    highlightLoadAbortController?.abort();

    const uploadedPnus = Array.from(new Set(items.map((item) => item.pnu)));
    if (uploadedPnus.length === 0) {
      uploadedHighlightFeatures = { type: "FeatureCollection", features: [] };
      return;
    }
    const seq = ++uploadedHighlightsRequestSeq;
    const controller = new AbortController();
    highlightLoadAbortController = controller;
    let firstVisibleApplied = false;
    try {
      deps.setMapStatus("업로드 하이라이트를 준비하는 중입니다...");
      const loaded = await loadUploadedHighlights({
        fgbUrl: config.cadastralFgbUrl,
        pnuField: config.cadastralPnuField,
        cadastralCrs: config.cadastralCrs,
        uploadedPnus,
        theme: deps.state.getCurrentTheme(),
        signal: controller.signal,
        onFeatures: (features, progress) => {
          if (seq !== uploadedHighlightsRequestSeq || features.length === 0) {
            return;
          }
          uploadedHighlightFeatures.features.push(...features);
          if (!firstVisibleApplied) {
            firstVisibleApplied = true;
            void reloadCadastralLayers();
          }
          deps.setMapStatus(
            progress.fromCache
              ? `하이라이트 캐시 ${progress.matched}건 적용`
              : `하이라이트 매칭 ${progress.matched}/${progress.total}건 (스캔 ${progress.scanned.toLocaleString()}건)`,
            "#166534"
          );
        },
        onProgress: (progress) => {
          if (seq !== uploadedHighlightsRequestSeq) {
            return;
          }
          if (!progress.done) {
            deps.setMapStatus(
              `하이라이트 매칭 ${progress.matched}/${progress.total}건 (스캔 ${progress.scanned.toLocaleString()}건)`,
              "#166534"
            );
          }
        }
      });
      if (seq !== uploadedHighlightsRequestSeq) {
        return;
      }
      uploadedHighlightFeatures = loaded;
      await reloadCadastralLayers();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      const message =
        error instanceof Error
          ? `업로드 하이라이트 준비 실패: ${error.message}`
          : "업로드 하이라이트 준비에 실패했습니다.";
      console.warn("[cadastral]", message);
      deps.setMapStatus(message, "#b45309");
    } finally {
      if (highlightLoadAbortController === controller) {
        highlightLoadAbortController = null;
      }
    }
  };

  const applyFilters = async (trackEvent = false): Promise<void> => {
    const originalItems = deps.state.getOriginalItems() ?? [];
    const values = deps.filters.getValues();
    const filteredItems = deps.filters.filterItems(originalItems, values);

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
      const uniqueManagers = Array.from(
        new Set(filteredItems.map((item) => (item.property_manager || "").trim()).filter((value) => value !== ""))
      );
      if (uniqueManagers.length >= 2) {
        deps.state.setCurrentItems([]);
        deps.listPanel.render([], () => {
          // Search is aborted when multiple managers are detected.
        });
        deps.mapView.clearInfoPanel();
        updateNavigation();
        if (config) {
          deps.mapView.renderFeatures({ type: "FeatureCollection", features: [] }, { dataProjection: config.cadastralCrs });
        }
        deps.setMapStatus(
          `재산관리관 다중 검출: ${uniqueManagers.join(", ")}. 정확한 재산관리관을 입력하세요.`,
          "#1d4ed8"
        );
        return;
      }
    }

    deps.state.setCurrentItems(filteredItems);
    deps.listPanel.render(filteredItems, (idx) => {
      selectItem(idx, { shouldFit: true, clickSource: "list_click" });
    });
    deps.mapView.clearInfoPanel();
    updateNavigation();
    await reloadCadastralLayers();
  };

  const loadThemeData = async (theme: ThemeType): Promise<void> => {
    const seq = ++themeLoadRequestSeq;
    const themeLabel = deps.getThemeLabel(theme);
    const overrideItems = overrideItemsByTheme.get(theme) ?? null;
    if (overrideItems) {
      deps.listPanel.setStatus(`${themeLabel} 목록을 로컬 업로드 데이터로 표시합니다.`);
      deps.state.setOriginalItems(overrideItems);
      await applyFilters(false);
      void prepareUploadedHighlights(overrideItems);
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
      const items = await loadAllLandListItems(theme);
      if (seq !== themeLoadRequestSeq) {
        return;
      }
      deps.state.setOriginalItems(items);
      await applyFilters(false);
      void prepareUploadedHighlights(items);
    } catch (error) {
      if (seq !== themeLoadRequestSeq) {
        return;
      }
      deps.state.setOriginalItems([]);
      await applyFilters(false);
      const fallbackMessage =
        error instanceof HttpError
          ? `${themeLabel} 목록 로딩 실패: ${error.message} (하이라이트 없이 표시됩니다.)`
          : `${themeLabel} 목록 로딩에 실패했습니다. 하이라이트 없이 표시합니다.`;
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

    selectItem(nextIndex, {
      shouldFit: true,
      clickSource: direction < 0 ? "nav_prev" : "nav_next"
    });
  };

  const downloadCurrentSearchResults = (): void => {
    const currentItems = deps.state.getCurrentItems();
    if (currentItems.length === 0) {
      deps.setMapStatus("검색 결과가 없어 다운로드할 수 없습니다.", "#b45309");
      return;
    }
    const currentTheme = deps.state.getCurrentTheme();
    if (overrideItemsByTheme.has(currentTheme)) {
      void deps.downloadClient.downloadLocalSearchResultFile({
        theme: currentTheme,
        items: currentItems
      });
      return;
    }
    const landIds = currentItems.map((item) => item.id);
    void deps.downloadClient.downloadSearchResultFile({ theme: currentTheme, landIds });
  };

  const setThemeOverrideItems = (theme: ThemeType, items: LandListItem[]): void => {
    overrideItemsByTheme.set(theme, items);
  };

  const clearThemeOverrideItems = (theme: ThemeType): void => {
    overrideItemsByTheme.delete(theme);
  };

  const hasThemeOverrideItems = (theme: ThemeType): boolean => {
    return overrideItemsByTheme.has(theme);
  };

  return {
    applyFilters,
    downloadCurrentSearchResults,
    loadThemeData,
    navigateItem,
    resetFilters,
    selectItem,
    setConfig,
    setThemeOverrideItems,
    clearThemeOverrideItems,
    hasThemeOverrideItems
  };
}

export type LandWorkflow = ReturnType<typeof createLandWorkflow>;
