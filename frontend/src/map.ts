import "ol/ol.css";

import { HttpError, fetchJson } from "./http";
import { loadUploadedHighlights } from "./map/cadastral-fgb-layer";
import { createDownloadClient } from "./map/download-client";
import { createFilters } from "./map/filters";
import { loadAllLandListItems } from "./map/lands-list-client";
import { createListPanel } from "./map/list-panel";
import { createMapView } from "./map/map-view";
import { createSessionTracker } from "./map/session-tracker";
import { createMapState } from "./map/state";
import { createTelemetry } from "./map/telemetry";

import type {
  BaseType,
  LandClickSource,
  LandFeatureCollection,
  LandListItem,
  MapConfig,
  ThemeType
} from "./map/types";

type SelectOptions = {
  shouldFit: boolean;
  clickSource?: LandClickSource;
};

type MobileViewState = "home" | "search" | "results";
const MOBILE_MEDIA_QUERY = "(max-width: 768px)";
const DESKTOP_MEDIA_QUERY = "(min-width: 769px)";
const MOBILE_HISTORY_KEY = "mobileMapViewState";
const SIDEBAR_COLLAPSED_STORAGE_KEY = "sidebarCollapsed";

function isMobileViewport(): boolean {
  return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
}

function readMobileViewState(value: unknown): MobileViewState | null {
  if (value === "home" || value === "search" || value === "results") {
    return value;
  }
  return null;
}

async function bootstrap(): Promise<void> {
  const regionSearchInput = document.getElementById("region-search") as HTMLInputElement | null;
  const minAreaInput = document.getElementById("min-area") as HTMLInputElement | null;
  const maxAreaInput = document.getElementById("max-area") as HTMLInputElement | null;
  const propertyManagerSearchInput = document.getElementById("property-manager-search") as HTMLInputElement | null;

  const mobileRegionSearchInput = document.getElementById("mobile-region-search") as HTMLInputElement | null;
  const mobileMinAreaInput = document.getElementById("mobile-min-area") as HTMLInputElement | null;
  const mobileMaxAreaInput = document.getElementById("mobile-max-area") as HTMLInputElement | null;
  const mobilePropertyManagerSearchInput = document.getElementById("mobile-property-manager-search") as HTMLInputElement | null;
  const mobileSearchFab = document.getElementById("mobile-search-fab");
  const mobileSearchCloseBtn = document.getElementById("mobile-search-close");
  const mobileSearchBtn = document.getElementById("mobile-btn-search");
  const mobileResetBtn = document.getElementById("mobile-btn-reset-filters");

  const infoPanelElement = document.getElementById("land-info-panel");
  const infoPanelContent = document.getElementById("land-info-content");
  const infoPanelCloseButton = document.getElementById("land-info-close");
  const mapStatus = document.getElementById("map-status");
  const uiToast = document.getElementById("ui-toast");
  const sidebarHandle = document.getElementById("sidebar-handle");
  const menuBasemapTrigger = document.getElementById("menu-basemap-trigger");
  const menuThemeTrigger = document.getElementById("menu-theme-trigger");

  if (!(infoPanelElement instanceof HTMLElement) || !(infoPanelContent instanceof HTMLElement)) {
    return;
  }

  const state = createMapState();
  const telemetry = createTelemetry();
  const sessionTracker = createSessionTracker({
    getOrCreateAnonId: telemetry.getOrCreateAnonId,
    postWebEvent: telemetry.postWebEvent
  });
  const mapView = createMapView({
    infoPanelElement,
    infoPanelContent,
    infoPanelCloseButton: infoPanelCloseButton instanceof HTMLButtonElement ? infoPanelCloseButton : null
  });
  const listPanel = createListPanel({
    listContainer: document.getElementById("list-container"),
    navInfo: document.getElementById("nav-info"),
    prevBtn: document.getElementById("prev-btn") as HTMLButtonElement | null,
    nextBtn: document.getElementById("next-btn") as HTMLButtonElement | null,
    sidebar: document.getElementById("sidebar"),
    handle: document.querySelector(".mobile-handle")
  });
  const filters = createFilters({
    regionSearchInput,
    minAreaInput,
    maxAreaInput,
    propertyManagerInput: propertyManagerSearchInput
  });
  const downloadClient = createDownloadClient();

  let mobileState: MobileViewState = "home";
  let config: MapConfig | null = null;
  let uploadedHighlightFeatures: LandFeatureCollection = { type: "FeatureCollection", features: [] };
  let uploadedHighlightsRequestSeq = 0;
  let themeLoadRequestSeq = 0;
  let toastTimer: number | null = null;

  const syncDesktopToMobileInputs = (): void => {
    if (
      !regionSearchInput ||
      !minAreaInput ||
      !maxAreaInput ||
      !propertyManagerSearchInput ||
      !mobileRegionSearchInput ||
      !mobileMinAreaInput ||
      !mobileMaxAreaInput ||
      !mobilePropertyManagerSearchInput
    ) {
      return;
    }
    mobileRegionSearchInput.value = regionSearchInput.value;
    mobileMinAreaInput.value = minAreaInput.value;
    mobileMaxAreaInput.value = maxAreaInput.value;
    mobilePropertyManagerSearchInput.value = propertyManagerSearchInput.value;
  };

  const syncMobileToDesktopInputs = (): void => {
    if (
      !regionSearchInput ||
      !minAreaInput ||
      !maxAreaInput ||
      !propertyManagerSearchInput ||
      !mobileRegionSearchInput ||
      !mobileMinAreaInput ||
      !mobileMaxAreaInput ||
      !mobilePropertyManagerSearchInput
    ) {
      return;
    }
    regionSearchInput.value = mobileRegionSearchInput.value;
    minAreaInput.value = mobileMinAreaInput.value;
    maxAreaInput.value = mobileMaxAreaInput.value;
    propertyManagerSearchInput.value = mobilePropertyManagerSearchInput.value;
  };

  const applyMobileClass = (): void => {
    document.body.classList.remove("mobile-home", "mobile-search", "mobile-results");
    if (!isMobileViewport()) {
      return;
    }
    document.body.classList.add(`mobile-${mobileState}`);
  };

  const setMobileState = (nextState: MobileViewState, pushHistory = true): void => {
    mobileState = nextState;
    applyMobileClass();
    if (!isMobileViewport() || !pushHistory) {
      return;
    }
    const current = history.state && typeof history.state === "object" ? history.state : {};
    history.pushState({ ...current, [MOBILE_HISTORY_KEY]: nextState }, "");
  };

  const maybeInitMobileHistory = (): void => {
    if (!isMobileViewport()) {
      return;
    }
    const current = history.state && typeof history.state === "object" ? history.state : {};
    history.replaceState({ ...current, [MOBILE_HISTORY_KEY]: mobileState }, "");
    applyMobileClass();
  };

  const updateNavigation = (): void => {
    listPanel.updateNavigation(state.getCurrentIndex(), state.getCurrentItems().length);
  };

  const setMapStatus = (message: string, color = "#6b7280"): void => {
    if (!(mapStatus instanceof HTMLElement)) {
      return;
    }
    mapStatus.textContent = message;
    mapStatus.style.color = color;
  };

  const showToast = (message: string): void => {
    if (!(uiToast instanceof HTMLElement)) {
      return;
    }
    if (toastTimer !== null) {
      window.clearTimeout(toastTimer);
    }
    uiToast.textContent = message;
    uiToast.classList.add("is-visible");
    toastTimer = window.setTimeout(() => {
      uiToast.classList.remove("is-visible");
      toastTimer = null;
    }, 1800);
  };

  const asThemeType = (raw: string): ThemeType | null => {
    if (raw === "national_public" || raw === "city_owned") {
      return raw;
    }
    return null;
  };

  const getThemeLabel = (theme: ThemeType): string => {
    return theme === "national_public" ? "국·공유재산" : "시유재산";
  };

  const clearPropertyManagerInputs = (): void => {
    if (propertyManagerSearchInput) {
      propertyManagerSearchInput.value = "";
    }
    if (mobilePropertyManagerSearchInput) {
      mobilePropertyManagerSearchInput.value = "";
    }
  };

  const applyThemeUiState = (theme: ThemeType): void => {
    document.body.classList.toggle("theme-city-owned", theme === "city_owned");
    document.body.classList.toggle("theme-national-public", theme === "national_public");
  };

  const themeMenuItems = Array.from(document.querySelectorAll<HTMLButtonElement>(".menu-item[data-theme]"));

  const syncThemeMenuActiveState = (): void => {
    const currentTheme = state.getCurrentTheme();
    themeMenuItems.forEach((item) => {
      item.classList.toggle("is-active", item.dataset.theme === currentTheme);
    });
  };

  const menuTriggers = [
    menuBasemapTrigger instanceof HTMLButtonElement ? menuBasemapTrigger : null,
    menuThemeTrigger instanceof HTMLButtonElement ? menuThemeTrigger : null
  ];

  const closeAllMenus = (): void => {
    menuTriggers.forEach((trigger) => {
      if (!trigger) {
        return;
      }
      trigger.setAttribute("aria-expanded", "false");
      trigger.parentElement?.classList.remove("is-open");
    });
  };

  const applySidebarCollapsed = (collapsed: boolean, persist = true): void => {
    if (!window.matchMedia(DESKTOP_MEDIA_QUERY).matches) {
      document.body.classList.remove("sidebar-collapsed");
      return;
    }
    document.body.classList.toggle("sidebar-collapsed", collapsed);
    if (sidebarHandle instanceof HTMLButtonElement) {
      sidebarHandle.setAttribute("aria-expanded", collapsed ? "false" : "true");
      sidebarHandle.setAttribute("aria-label", collapsed ? "사이드 메뉴 펼치기" : "사이드 메뉴 접기");
    }
    if (persist) {
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? "true" : "false");
      } catch {
        // Ignore storage failures.
      }
    }
    window.setTimeout(() => {
      mapView.resize();
    }, 240);
  };

  const selectItem = (index: number, options: SelectOptions): void => {
    const currentItems = state.getCurrentItems();
    if (index < 0 || index >= currentItems.length) {
      return;
    }

    state.setCurrentIndex(index);

    if (options.clickSource) {
      const selected = currentItems[index];
      telemetry.trackLandClickEvent(selected?.address || "", options.clickSource, selected?.id);
    }

    const moved = mapView.selectFeatureByIndex(index, {
      shouldFit: options.shouldFit
    });
    if (!moved) {
      setMapStatus("선택한 필지 하이라이트를 찾지 못했습니다.", "#b45309");
    }

    updateNavigation();
    listPanel.scrollTo(index);
  };

  const reloadCadastralLayers = async (): Promise<void> => {
    if (!config) {
      return;
    }

    const currentItems = state.getCurrentItems();
    const featuresByPnu = new Map<string, unknown>();
    uploadedHighlightFeatures.features.forEach((feature) => {
      const pnu = String(feature.properties.pnu || "");
      if (pnu) {
        featuresByPnu.set(pnu, feature.geometry);
      }
    });

    const buildThemeFeatureCollection = (theme: ThemeType): LandFeatureCollection => {
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

      switch (theme) {
        case "national_public":
        case "city_owned":
          return {
            type: "FeatureCollection",
            features: listLinkedFeatures
          };
      }
    };

    const currentTheme = state.getCurrentTheme();
    const withProperties = buildThemeFeatureCollection(currentTheme);

    mapView.renderFeatures(withProperties, { dataProjection: config.cadastralCrs });
    if (currentItems.length === 0) {
      setMapStatus(`업로드 하이라이트 ${uploadedHighlightFeatures.features.length}건 준비됨`, "#166534");
    } else {
      setMapStatus(
        `업로드 하이라이트 ${uploadedHighlightFeatures.features.length}건, ${getThemeLabel(currentTheme)} 강조 ${withProperties.features.length}건`,
        "#166534"
      );
    }
    updateNavigation();
  };

  const prepareUploadedHighlights = async (items: LandListItem[]): Promise<void> => {
    if (!config) {
      return;
    }
    const uploadedPnus = Array.from(new Set(items.map((item) => item.pnu)));
    if (uploadedPnus.length === 0) {
      uploadedHighlightFeatures = { type: "FeatureCollection", features: [] };
      return;
    }
    const seq = ++uploadedHighlightsRequestSeq;
    const controller = new AbortController();
    try {
      setMapStatus("업로드 하이라이트를 준비하는 중입니다...");
      const loaded = await loadUploadedHighlights({
        fgbUrl: config.cadastralFgbUrl,
        pnuField: config.cadastralPnuField,
        cadastralCrs: config.cadastralCrs,
        uploadedPnus,
        signal: controller.signal
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
      setMapStatus(message, "#b45309");
    }
  };

  const loadThemeData = async (theme: ThemeType): Promise<void> => {
    const seq = ++themeLoadRequestSeq;
    const themeLabel = getThemeLabel(theme);
    try {
      listPanel.setStatus(`${themeLabel} 목록을 불러오는 중입니다...`);
      const items = await loadAllLandListItems(theme);
      if (seq !== themeLoadRequestSeq) {
        return;
      }
      state.setOriginalItems(items);
      await applyFilters(false);
      void prepareUploadedHighlights(items);
    } catch (error) {
      if (seq !== themeLoadRequestSeq) {
        return;
      }
      state.setOriginalItems([]);
      await applyFilters(false);
      const fallbackMessage =
        error instanceof HttpError
          ? `${themeLabel} 목록 로딩 실패: ${error.message} (하이라이트 없이 표시됩니다.)`
          : `${themeLabel} 목록 로딩에 실패했습니다. 하이라이트 없이 표시합니다.`;
      listPanel.setStatus(fallbackMessage, "#b45309");
      setMapStatus(fallbackMessage, "#b45309");
    }
  };

  const applyFilters = async (trackEvent = false): Promise<void> => {
    const originalItems = state.getOriginalItems() ?? [];
    const currentTheme = state.getCurrentTheme();

    const values = filters.getValues();
    const effectiveValues =
      currentTheme === "city_owned"
        ? values
        : {
            ...values,
            propertyManagerTerm: ""
          };
    const filteredItems = filters.filterItems(originalItems, effectiveValues);

    if (trackEvent) {
      telemetry.trackSearchEvent(
        values.minArea,
        values.searchTerm,
        values.rawSearchTerm,
        values.rawMinAreaInput,
        values.rawMaxAreaInput,
        "false"
      );
    }

    if (currentTheme === "city_owned" && effectiveValues.propertyManagerTerm !== "") {
      const uniqueManagers = Array.from(
        new Set(
          filteredItems
            .map((item) => (item.property_manager || "").trim())
            .filter((value) => value !== "")
        )
      );
      if (uniqueManagers.length >= 2) {
        state.setCurrentItems([]);
        listPanel.render([], () => {
          // Intentionally noop. Search is aborted when multiple managers are detected.
        });
        mapView.clearInfoPanel();
        updateNavigation();
        if (config) {
          mapView.renderFeatures({ type: "FeatureCollection", features: [] }, { dataProjection: config.cadastralCrs });
        }
        setMapStatus(
          `재산관리관 다중 검출: ${uniqueManagers.join(", ")}. 정확한 재산관리관을 입력하세요.`,
          "#1d4ed8"
        );
        return;
      }
    }

    state.setCurrentItems(filteredItems);
    listPanel.render(filteredItems, (idx) => {
      selectItem(idx, { shouldFit: true, clickSource: "list_click" });
    });
    mapView.clearInfoPanel();
    updateNavigation();
    await reloadCadastralLayers();
  };

  const resetFilters = (): void => {
    filters.reset();
    syncDesktopToMobileInputs();
    mapView.clearInfoPanel();
    void applyFilters(false);
  };

  const navigateItem = (direction: number): void => {
    const nextIndex = state.getCurrentIndex() + direction;
    if (nextIndex < 0 || nextIndex >= state.getCurrentItems().length) {
      return;
    }

    selectItem(nextIndex, {
      shouldFit: true,
      clickSource: direction < 0 ? "nav_prev" : "nav_next"
    });
  };

  mapView.setFeatureClickHandler(({ index }) => {
    selectItem(index, {
      shouldFit: false,
      clickSource: "map_click"
    });
  });
  mapView.setMoveEndHandler(() => {
    // Keep moveend lightweight to avoid layer tear-down flicker during nav/fit animations.
  });

  document.getElementById("btn-search")?.addEventListener("click", () => {
    void applyFilters(true);
  });
  document.getElementById("btn-reset-filters")?.addEventListener("click", resetFilters);
  document.getElementById("btn-download-all")?.addEventListener("click", () => {
    const landIds = state.getCurrentItems().map((item) => item.id);
    if (landIds.length === 0) {
      setMapStatus("검색 결과가 없어 다운로드할 수 없습니다.", "#b45309");
      return;
    }
    void downloadClient.downloadSearchResultFile({
      theme: state.getCurrentTheme(),
      landIds
    });
  });

  listPanel.bindNavigation(
    () => navigateItem(-1),
    () => navigateItem(1)
  );

  filters.attachEnter(() => {
    void applyFilters(true);
  });
  listPanel.initBottomSheet();
  sessionTracker.mount();

  menuTriggers.forEach((trigger) => {
    if (!trigger) {
      return;
    }
    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      const isOpen = trigger.getAttribute("aria-expanded") === "true";
      closeAllMenus();
      if (!isOpen) {
        trigger.setAttribute("aria-expanded", "true");
        trigger.parentElement?.classList.add("is-open");
      }
    });
  });

  document.querySelectorAll<HTMLElement>(".menu-item[data-menu-action='coming-soon']").forEach((item) => {
    item.addEventListener("click", () => {
      closeAllMenus();
      showToast("준비 중입니다.");
    });
  });

  themeMenuItems.forEach((item) => {
    item.addEventListener("click", () => {
      const theme = asThemeType(item.dataset.theme || "");
      if (!theme) {
        return;
      }
      const previousTheme = state.getCurrentTheme();
      if (previousTheme === "city_owned" && theme !== "city_owned") {
        clearPropertyManagerInputs();
      }
      state.setCurrentTheme(theme);
      applyThemeUiState(theme);
      syncThemeMenuActiveState();
      mapView.clearInfoPanel();
      closeAllMenus();
      void loadThemeData(theme);
      showToast(`${getThemeLabel(theme)} 레이어로 전환했습니다.`);
    });
  });

  const asBaseType = (raw: string): BaseType | null => {
    if (raw === "Base" || raw === "Satellite" || raw === "Hybrid") {
      return raw;
    }
    return null;
  };

  document.querySelectorAll<HTMLElement>(".menu-item[data-basemap]").forEach((item) => {
    item.addEventListener("click", () => {
      const layerType = asBaseType(item.dataset.basemap || "");
      if (!layerType) {
        return;
      }
      mapView.changeLayer(layerType);
      closeAllMenus();
      const label =
        layerType === "Base" ? "일반지도" : layerType === "Satellite" ? "영상지도" : "하이브리드";
      showToast(`${label}로 변경했습니다.`);
    });
  });

  syncThemeMenuActiveState();
  applyThemeUiState(state.getCurrentTheme());

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }
    if (!target.parentElement?.closest(".menu-group")) {
      closeAllMenus();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeAllMenus();
    }
  });

  const toggleSidebar = (): void => {
    const collapsed = !document.body.classList.contains("sidebar-collapsed");
    applySidebarCollapsed(collapsed);
  };

  sidebarHandle?.addEventListener("click", toggleSidebar);
  sidebarHandle?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleSidebar();
    }
  });

  mobileSearchFab?.addEventListener("click", () => {
    if (!isMobileViewport()) {
      return;
    }
    syncDesktopToMobileInputs();
    setMobileState("search", true);
  });
  mobileSearchCloseBtn?.addEventListener("click", () => {
    if (!isMobileViewport()) {
      return;
    }
    history.back();
  });
  mobileSearchBtn?.addEventListener("click", () => {
    if (!isMobileViewport()) {
      return;
    }
    syncMobileToDesktopInputs();
    void applyFilters(true);
    setMobileState("results", true);
  });
  mobileResetBtn?.addEventListener("click", () => {
    syncMobileToDesktopInputs();
    resetFilters();
    syncDesktopToMobileInputs();
  });

  window.addEventListener("popstate", (event) => {
    if (!isMobileViewport()) {
      return;
    }
    const nextState = readMobileViewState(
      event.state && typeof event.state === "object"
        ? (event.state as Record<string, unknown>)[MOBILE_HISTORY_KEY]
        : null
    );
    if (!nextState) {
      return;
    }
    setMobileState(nextState, false);
  });

  window.matchMedia(MOBILE_MEDIA_QUERY).addEventListener("change", () => {
    applyMobileClass();
  });

  window.matchMedia(DESKTOP_MEDIA_QUERY).addEventListener("change", () => {
    if (window.matchMedia(DESKTOP_MEDIA_QUERY).matches) {
      let shouldCollapse = false;
      try {
        shouldCollapse = localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
      } catch {
        shouldCollapse = false;
      }
      applySidebarCollapsed(shouldCollapse, false);
    } else {
      applySidebarCollapsed(false, false);
    }
    mapView.resize();
  });

  try {
    listPanel.setStatus("데이터를 불러오는 중입니다...");
    setMapStatus("지도를 초기화하는 중입니다...");
    config = await fetchJson<MapConfig>("/api/config", { timeoutMs: 10000 });
    mapView.init(config);
    let initialSidebarCollapsed = false;
    try {
      initialSidebarCollapsed = localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
    } catch {
      initialSidebarCollapsed = false;
    }
    applySidebarCollapsed(initialSidebarCollapsed, false);
    state.setOriginalItems([]);
    await applyFilters(false);
    await loadThemeData(state.getCurrentTheme());

    syncDesktopToMobileInputs();
    maybeInitMobileHistory();
    if (isMobileViewport()) {
      setMobileState("home", false);
    }
  } catch (error) {
    const message = error instanceof HttpError ? error.message : "지도를 초기화하지 못했습니다.";
    listPanel.setStatus(message, "red");
    setMapStatus(message, "#b91c1c");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  void bootstrap();
});
