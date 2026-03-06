import "ol/ol.css";

import { HttpError, fetchJson } from "./http";
import { createDownloadClient } from "./map/download-client";
import { createFeedback } from "./map/feedback";
import { createFilters } from "./map/filters";
import { createLandWorkflow } from "./map/land-workflow";
import { setupLayoutControls, readInitialSidebarCollapsed } from "./map/layout-controls";
import { createListPanel } from "./map/list-panel";
import { createMapView } from "./map/map-view";
import { createSessionTracker } from "./map/session-tracker";
import { createMapState } from "./map/state";
import { createTelemetry } from "./map/telemetry";
import { setupTopbarMenus } from "./map/topbar-menu";
import {
  asThemeType,
  getThemeFromPathname,
  getThemeLabel,
  pushThemeHistory,
  replaceThemeHistory
} from "./map/theme-routing";

import type { BaseType, MapConfig } from "./map/types";

async function bootstrap(): Promise<void> {
  const regionSearchInput = document.getElementById("region-search") as HTMLInputElement | null;
  const minAreaInput = document.getElementById("min-area") as HTMLInputElement | null;
  const maxAreaInput = document.getElementById("max-area") as HTMLInputElement | null;
  const propertyManagerSearchInput = document.getElementById("property-manager-search") as HTMLInputElement | null;
  const propertyUsageSearchInput = document.getElementById("property-usage-search") as HTMLSelectElement | null;
  const landTypeSearchInput = document.getElementById("land-type-search") as HTMLInputElement | null;

  const mobileRegionSearchInput = document.getElementById("mobile-region-search") as HTMLInputElement | null;
  const mobileMinAreaInput = document.getElementById("mobile-min-area") as HTMLInputElement | null;
  const mobileMaxAreaInput = document.getElementById("mobile-max-area") as HTMLInputElement | null;
  const mobilePropertyManagerSearchInput = document.getElementById("mobile-property-manager-search") as HTMLInputElement | null;
  const mobilePropertyUsageSearchInput = document.getElementById("mobile-property-usage-search") as HTMLSelectElement | null;
  const mobileLandTypeSearchInput = document.getElementById("mobile-land-type-search") as HTMLInputElement | null;
  const mobileSearchFab = document.getElementById("mobile-search-fab");
  const mobileSearchCloseBtn = document.getElementById("mobile-search-close");
  const mobileSearchBtn = document.getElementById("mobile-btn-search");
  const mobileResetBtn = document.getElementById("mobile-btn-reset-filters");

  const infoPanelElement = document.getElementById("land-info-panel");
  const infoPanelContent = document.getElementById("land-info-content");
  const infoPanelCloseButton = document.getElementById("land-info-close");
  const mapStatus = document.getElementById("map-status");
  const mapStatusText = document.getElementById("map-status-text");
  const mapStatusCloseButton = document.getElementById("map-status-close");
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
    propertyManagerInput: propertyManagerSearchInput,
    propertyUsageInput: propertyUsageSearchInput,
    landTypeInput: landTypeSearchInput
  });
  const downloadClient = createDownloadClient();

  const { setMapStatus, showToast } = createFeedback({
    mapStatus: mapStatus instanceof HTMLElement ? mapStatus : null,
    mapStatusText: mapStatusText instanceof HTMLElement ? mapStatusText : null,
    mapStatusCloseButton: mapStatusCloseButton instanceof HTMLButtonElement ? mapStatusCloseButton : null,
    uiToast: uiToast instanceof HTMLElement ? uiToast : null
  });

  const syncDesktopToMobileInputs = (): void => {
    if (
      !regionSearchInput ||
      !minAreaInput ||
      !maxAreaInput ||
      !propertyManagerSearchInput ||
      !propertyUsageSearchInput ||
      !landTypeSearchInput ||
      !mobileRegionSearchInput ||
      !mobileMinAreaInput ||
      !mobileMaxAreaInput ||
      !mobilePropertyManagerSearchInput ||
      !mobilePropertyUsageSearchInput ||
      !mobileLandTypeSearchInput
    ) {
      return;
    }
    mobileRegionSearchInput.value = regionSearchInput.value;
    mobileMinAreaInput.value = minAreaInput.value;
    mobileMaxAreaInput.value = maxAreaInput.value;
    mobilePropertyManagerSearchInput.value = propertyManagerSearchInput.value;
    mobilePropertyUsageSearchInput.value = propertyUsageSearchInput.value;
    mobileLandTypeSearchInput.value = landTypeSearchInput.value;
  };

  const syncMobileToDesktopInputs = (): void => {
    if (
      !regionSearchInput ||
      !minAreaInput ||
      !maxAreaInput ||
      !propertyManagerSearchInput ||
      !propertyUsageSearchInput ||
      !landTypeSearchInput ||
      !mobileRegionSearchInput ||
      !mobileMinAreaInput ||
      !mobileMaxAreaInput ||
      !mobilePropertyManagerSearchInput ||
      !mobilePropertyUsageSearchInput ||
      !mobileLandTypeSearchInput
    ) {
      return;
    }
    regionSearchInput.value = mobileRegionSearchInput.value;
    minAreaInput.value = mobileMinAreaInput.value;
    maxAreaInput.value = mobileMaxAreaInput.value;
    propertyManagerSearchInput.value = mobilePropertyManagerSearchInput.value;
    propertyUsageSearchInput.value = mobilePropertyUsageSearchInput.value;
    landTypeSearchInput.value = mobileLandTypeSearchInput.value;
  };

  const clearPropertyManagerInputs = (): void => {
    if (propertyManagerSearchInput) {
      propertyManagerSearchInput.value = "";
    }
    if (mobilePropertyManagerSearchInput) {
      mobilePropertyManagerSearchInput.value = "";
    }
  };

  const applyThemeUiState = (theme: "national_public" | "city_owned"): void => {
    document.body.classList.toggle("theme-city-owned", theme === "city_owned");
    document.body.classList.toggle("theme-national-public", theme === "national_public");
  };

  const workflow = createLandWorkflow({
    state,
    telemetry,
    mapView,
    listPanel,
    filters,
    downloadClient,
    setMapStatus,
    getThemeLabel
  });

  const layoutControls = setupLayoutControls({
    sidebarHandle,
    mobileSearchFab,
    mobileSearchCloseBtn,
    mobileSearchBtn,
    mobileResetBtn,
    syncDesktopToMobileInputs,
    syncMobileToDesktopInputs,
    onSearch: () => {
      void workflow.applyFilters(true);
    },
    onReset: () => {
      workflow.resetFilters(syncDesktopToMobileInputs);
    },
    onDesktopResize: () => {
      mapView.resize();
    }
  });

  let syncThemeMenuActiveState = (_theme: "national_public" | "city_owned"): void => {
    // Assigned after topbar menu initialization.
  };

  const topbarMenus = setupTopbarMenus({
    menuBasemapTrigger,
    menuThemeTrigger,
    onThemeSelected: (theme) => {
      const previousTheme = state.getCurrentTheme();
      if (previousTheme === "city_owned" && theme !== "city_owned") {
        clearPropertyManagerInputs();
      }
      state.setCurrentTheme(theme);
      applyThemeUiState(theme);
      syncThemeMenuActiveState(theme);
      mapView.clearInfoPanel();
      pushThemeHistory(theme);
      void workflow.loadThemeData(theme);
      showToast(`${getThemeLabel(theme)} 레이어로 전환했습니다.`);
    },
    onBasemapSelected: (layerType: BaseType) => {
      mapView.changeLayer(layerType);
      const label =
        layerType === "Base"
          ? "일반지도"
          : layerType === "White"
            ? "백지도"
            : layerType === "Satellite"
              ? "영상지도"
              : "하이브리드";
      showToast(`${label}로 변경했습니다.`);
    },
    showToast
  });
  syncThemeMenuActiveState = topbarMenus.syncThemeMenuActiveState;

  mapView.setFeatureClickHandler(({ index }) => {
    workflow.selectItem(index, {
      shouldFit: false,
      clickSource: "map_click"
    });
  });
  mapView.setMoveEndHandler(() => {
    // Keep moveend lightweight to avoid layer tear-down flicker during nav/fit animations.
  });

  document.getElementById("btn-search")?.addEventListener("click", () => {
    void workflow.applyFilters(true);
  });
  document.getElementById("btn-reset-filters")?.addEventListener("click", () => {
    workflow.resetFilters(syncDesktopToMobileInputs);
  });
  document.getElementById("btn-download-all")?.addEventListener("click", () => {
    workflow.downloadCurrentSearchResults();
  });

  listPanel.bindNavigation(
    () => workflow.navigateItem(-1),
    () => workflow.navigateItem(1)
  );

  filters.attachEnter(() => {
    void workflow.applyFilters(true);
  });

  listPanel.initBottomSheet();
  sessionTracker.mount();

  window.addEventListener("popstate", () => {
    const nextTheme = getThemeFromPathname(window.location.pathname);
    if (!nextTheme || nextTheme === state.getCurrentTheme()) {
      return;
    }

    const previousTheme = state.getCurrentTheme();
    if (previousTheme === "city_owned" && nextTheme !== "city_owned") {
      clearPropertyManagerInputs();
    }
    state.setCurrentTheme(nextTheme);
    applyThemeUiState(nextTheme);
    syncThemeMenuActiveState(nextTheme);
    mapView.clearInfoPanel();
    void workflow.loadThemeData(nextTheme);
  });

  try {
    listPanel.setStatus("데이터를 불러오는 중입니다...");
    setMapStatus("지도를 초기화하는 중입니다...");
    const config = await fetchJson<MapConfig>("/api/config", { timeoutMs: 10000 });
    workflow.setConfig(config);
    mapView.init(config);

    layoutControls.applySidebarCollapsed(readInitialSidebarCollapsed(), false);

    const initialTheme =
      asThemeType(document.body.dataset.initialTheme || "") ??
      getThemeFromPathname(window.location.pathname) ??
      "national_public";

    state.setCurrentTheme(initialTheme);
    applyThemeUiState(initialTheme);
    syncThemeMenuActiveState(initialTheme);
    replaceThemeHistory(initialTheme);
    state.setOriginalItems([]);

    await workflow.applyFilters(false);
    await workflow.loadThemeData(state.getCurrentTheme());

    syncDesktopToMobileInputs();
    layoutControls.maybeInitMobileHistory();
    if (window.matchMedia("(max-width: 768px)").matches) {
      layoutControls.setMobileState("home", false);
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
