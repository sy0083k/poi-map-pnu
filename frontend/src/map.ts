import "ol/ol.css";
import "maplibre-gl/dist/maplibre-gl.css";

import { createDownloadClient } from "./map/download-client";
import { createFeedback } from "./map/feedback";
import { createFilters } from "./map/filters";
import { queryLandMapDomElements } from "./map/land-map-dom";
import { bindLandMapEvents } from "./map/land-map-events";
import { initializeLandMapPage } from "./map/land-map-init";
import { createInputSyncController, applyThemeUiState, closePhotoPanelUi, createLegendController } from "./map/land-map-ui";
import { createLandWorkflow } from "./map/land-workflow";
import { setupLayoutControls } from "./map/layout-controls";
import { createListPanel } from "./map/list-panel";
import { setupFile2MapUpload } from "./map/local-upload";
import { loadAllLandListItems } from "./map/lands-list-client";
import { createMapView } from "./map/map-view";
import { createMapLibreMapView } from "./map/map-view-maplibre";
import { bootstrapPhotoMode } from "./map/photo-mode";
import { createSessionTracker } from "./map/session-tracker";
import { createMapState } from "./map/state";
import { createTelemetry } from "./map/telemetry";
import { setupTopbarMenus } from "./map/topbar-menu";
import { getThemeLabel, getThemePath, pushThemeHistory } from "./map/theme-routing";

import type { BaseType } from "./map/types";

async function bootstrap(): Promise<void> {
  if (document.body.dataset.mapMode === "photo") {
    await bootstrapPhotoMode();
    return;
  }

  const dom = queryLandMapDomElements();
  if (!(dom.infoPanelElement instanceof HTMLElement) || !(dom.infoPanelContent instanceof HTMLElement)) {
    return;
  }

  const state = createMapState();
  const telemetry = createTelemetry();
  const sessionTracker = createSessionTracker({
    getOrCreateAnonId: telemetry.getOrCreateAnonId,
    postWebEvent: telemetry.postWebEvent
  });

  const mapView = createMapView({
    infoPanelElement: dom.infoPanelElement,
    infoPanelContent: dom.infoPanelContent,
    infoPanelCloseButton: dom.infoPanelCloseButton
  });
  const activeMapView = window.location.pathname === "/siyu"
    ? createMapLibreMapView({
        infoPanelElement: dom.infoPanelElement,
        infoPanelContent: dom.infoPanelContent,
        infoPanelCloseButton: dom.infoPanelCloseButton
      })
    : mapView;

  const listPanel = createListPanel({
    listContainer: document.getElementById("list-container"),
    navInfo: document.getElementById("nav-info"),
    prevBtn: document.getElementById("prev-btn") as HTMLButtonElement | null,
    nextBtn: document.getElementById("next-btn") as HTMLButtonElement | null,
    sidebar: document.getElementById("sidebar"),
    handle: document.querySelector(".mobile-handle")
  });

  const filters = createFilters({
    regionSearchInput: dom.regionSearchInput,
    minAreaInput: dom.minAreaInput,
    maxAreaInput: dom.maxAreaInput,
    propertyManagerInput: dom.propertyManagerSearchInput,
    propertyUsageInput: dom.propertyUsageSearchInput,
    landTypeInput: dom.landTypeSearchInput
  });

  const { syncDesktopToMobileInputs, syncMobileToDesktopInputs, clearFile2MapSpecificFilters } = createInputSyncController({
    regionSearchInput: dom.regionSearchInput,
    minAreaInput: dom.minAreaInput,
    maxAreaInput: dom.maxAreaInput,
    propertyManagerSearchInput: dom.propertyManagerSearchInput,
    propertyUsageSearchInput: dom.propertyUsageSearchInput,
    landTypeSearchInput: dom.landTypeSearchInput,
    mobileRegionSearchInput: dom.mobileRegionSearchInput,
    mobileMinAreaInput: dom.mobileMinAreaInput,
    mobileMaxAreaInput: dom.mobileMaxAreaInput,
    mobilePropertyManagerSearchInput: dom.mobilePropertyManagerSearchInput,
    mobilePropertyUsageSearchInput: dom.mobilePropertyUsageSearchInput,
    mobileLandTypeSearchInput: dom.mobileLandTypeSearchInput
  });

  const { setMapStatus, showToast } = createFeedback({
    mapStatus: dom.mapStatus,
    mapStatusText: dom.mapStatusText,
    mapStatusCloseButton: dom.mapStatusCloseButton,
    uiToast: dom.uiToast
  });

  const workflow = createLandWorkflow({
    state,
    telemetry,
    mapView: activeMapView as typeof mapView,
    listPanel,
    filters,
    downloadClient: createDownloadClient(),
    setMapStatus,
    getThemeLabel,
    loadLandListItems: loadAllLandListItems
  });

  const layoutControls = setupLayoutControls({
    sidebarHandle: dom.sidebarHandle,
    mobileSearchFab: dom.mobileSearchFab,
    mobileSearchCloseBtn: dom.mobileSearchCloseBtn,
    mobileSearchBtn: dom.mobileSearchBtn,
    mobileResetBtn: dom.mobileResetBtn,
    syncDesktopToMobileInputs,
    syncMobileToDesktopInputs,
    onSearch: () => {
      void workflow.applyFilters(true);
    },
    onReset: () => {
      workflow.resetFilters(syncDesktopToMobileInputs);
    },
    onDesktopResize: () => {
      activeMapView.resize();
    }
  });

  const legendController = createLegendController(dom.mapLegend);
  let syncThemeMenuActiveState = (_theme: "national_public" | "city_owned"): void => {};

  const topbarMenus = setupTopbarMenus({
    menuBasemapTrigger: dom.menuBasemapTrigger,
    menuThemeTrigger: dom.menuThemeTrigger,
    onThemeSelected: (theme) => {
      const targetPath = getThemePath(theme);
      if (window.location.pathname !== targetPath) {
        window.location.assign(targetPath);
        return;
      }
      if (state.getCurrentTheme() !== "city_owned" && theme === "city_owned") {
        legendController.resetLegendDismissed();
      }
      state.setCurrentTheme(theme);
      activeMapView.setTheme(theme);
      applyThemeUiState(theme);
      if (theme === "national_public") {
        clearFile2MapSpecificFilters();
      }
      syncThemeMenuActiveState(theme);
      closePhotoPanelUi();
      legendController.applyLegendUiState(theme);
      activeMapView.clearInfoPanel();
      pushThemeHistory(theme);
      void workflow.loadThemeData(theme);
      showToast(`${getThemeLabel(theme)} 레이어로 전환했습니다.`);
    },
    onBasemapSelected: (layerType: BaseType) => {
      activeMapView.changeLayer(layerType);
      const label = layerType === "Base" ? "일반지도" : layerType === "White" ? "백지도" : layerType === "Satellite" ? "영상지도" : "하이브리드";
      showToast(`${label}로 변경했습니다.`);
    },
    showToast
  });
  syncThemeMenuActiveState = topbarMenus.syncThemeMenuActiveState;

  bindLandMapEvents({
    mapView: activeMapView as typeof mapView,
    workflow,
    state,
    listPanel,
    filters,
    syncDesktopToMobileInputs,
    applyThemeUiState,
    clearFile2MapSpecificFilters,
    syncThemeMenuActiveState,
    closePhotoPanelUi,
    applyLegendUiState: legendController.applyLegendUiState,
    resetLegendDismissed: legendController.resetLegendDismissed
  });
  sessionTracker.mount();

  await initializeLandMapPage({
    listPanel,
    setMapStatus,
    showToast,
    workflow,
    mapView: activeMapView as typeof mapView,
    state,
    layoutControls,
    setupUpload: async () =>
      setupFile2MapUpload({
        fileInput: dom.file2mapUploadInput,
        uploadButton: dom.file2mapUploadButton,
        clearButton: dom.file2mapUploadClearButton,
        onStatusMessage: (message, color) => setMapStatus(message, color),
        onApplied: (event) => {
          workflow.setThemeOverrideItems("national_public", event.result.items);
          if (state.getCurrentTheme() === "national_public" && event.source === "uploaded") {
            void workflow.loadThemeData("national_public");
            setMapStatus(`${event.result.summary.fileName} 적용 완료 (${event.result.summary.rowCount.toLocaleString()}건)`, "#166534");
          }
        },
        onCleared: () => {
          workflow.clearThemeOverrideItems("national_public");
          if (state.getCurrentTheme() === "national_public") {
            void workflow.loadThemeData("national_public");
            setMapStatus("업로드 데이터를 초기화했습니다.", "#1f2937");
          }
        }
      }),
    applyThemeUiState,
    applyLegendUiState: legendController.applyLegendUiState,
    clearFile2MapSpecificFilters,
    syncThemeMenuActiveState,
    syncDesktopToMobileInputs
  });

  dom.mapLegendCloseButton?.addEventListener("click", () => {
    if (state.getCurrentTheme() !== "city_owned") {
      return;
    }
    legendController.dismissLegend();
    legendController.applyLegendUiState("city_owned");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  void bootstrap();
});
