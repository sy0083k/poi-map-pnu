import { HttpError, fetchJson } from "../http";
import { bootstrapPersistedPhotoOverlay } from "./persisted-photo-overlay";
import { readInitialSidebarCollapsed } from "./layout-controls";
import { asThemeType, getThemeFromPathname, replaceThemeHistory } from "./theme-routing";

import type { SetupFile2MapUploadResult } from "./local-upload";
import type { MapConfig } from "./types";

type InitDeps = {
  listPanel: {
    setStatus: (message: string, color?: string) => void;
    clear: () => void;
  };
  setMapStatus: (message: string, color?: string) => void;
  showToast: (message: string) => void;
  workflow: {
    setConfig: (config: MapConfig) => void;
    setThemeOverrideItems: (theme: "national_public", items: any[]) => void;
    clearThemeOverrideItems: (theme: "national_public") => void;
    loadThemeData: (theme: "national_public" | "city_owned") => Promise<void>;
  };
  mapView: {
    init: (config: MapConfig) => void;
    loadDebugProbe: (config: MapConfig, setMapStatus: (message: string, color?: string) => void) => Promise<void>;
    setTheme: (theme: "national_public" | "city_owned") => void;
  };
  state: {
    getCurrentTheme: () => "national_public" | "city_owned";
    setCurrentTheme: (theme: "national_public" | "city_owned") => void;
    setOriginalItems: (items: any[]) => void;
  };
  layoutControls: {
    applySidebarCollapsed: (collapsed: boolean, saveState: boolean) => void;
    maybeInitMobileHistory: () => void;
    setMobileState: (state: "home" | "search" | "results", pushHistory?: boolean) => void;
  };
  setupUpload: () => Promise<SetupFile2MapUploadResult>;
  applyThemeUiState: (theme: "national_public" | "city_owned") => void;
  applyLegendUiState: (theme: "national_public" | "city_owned") => void;
  clearFile2MapSpecificFilters: () => void;
  syncThemeMenuActiveState: (theme: "national_public" | "city_owned") => void;
  syncDesktopToMobileInputs: () => void;
};

export async function initializeLandMapPage(deps: InitDeps): Promise<void> {
  try {
    deps.listPanel.setStatus("데이터를 불러오는 중입니다...");
    deps.setMapStatus("지도를 초기화하는 중입니다...");
    const config = await fetchJson<MapConfig>("/api/config", { timeoutMs: 10000 });
    deps.workflow.setConfig(config);
    deps.mapView.init(config);

    const hasPhotoPanel = document.getElementById("photo-info-panel") instanceof HTMLElement;
    if (hasPhotoPanel) {
      await bootstrapPersistedPhotoOverlay({
        mapView: deps.mapView as any,
        setMapStatus: deps.setMapStatus,
        showToast: deps.showToast
      });
    }
    await deps.mapView.loadDebugProbe(config, deps.setMapStatus);

    deps.layoutControls.applySidebarCollapsed(readInitialSidebarCollapsed(), false);

    const initialTheme =
      asThemeType(document.body.dataset.initialTheme || "") ??
      getThemeFromPathname(window.location.pathname) ??
      "national_public";

    deps.state.setCurrentTheme(initialTheme);
    deps.mapView.setTheme(initialTheme);
    deps.applyThemeUiState(initialTheme);
    deps.applyLegendUiState(initialTheme);
    if (initialTheme === "national_public") {
      deps.clearFile2MapSpecificFilters();
    }
    deps.syncThemeMenuActiveState(initialTheme);
    replaceThemeHistory(initialTheme);
    deps.state.setOriginalItems([]);

    const uploadSetup = await deps.setupUpload();
    if (initialTheme === "national_public" && !uploadSetup.hasRestoredUpload) {
      deps.listPanel.clear();
      deps.setMapStatus("표시할 파일을 적용하면 목록이 표시됩니다.", "#1f2937");
    }

    await deps.workflow.loadThemeData(deps.state.getCurrentTheme());
    deps.syncDesktopToMobileInputs();
    deps.layoutControls.maybeInitMobileHistory();
    if (window.matchMedia("(max-width: 768px)").matches) {
      deps.layoutControls.setMobileState("home", false);
    }
  } catch (error) {
    const message = error instanceof HttpError ? error.message : "지도를 초기화하지 못했습니다.";
    deps.listPanel.setStatus(message, "red");
    deps.setMapStatus(message, "#b91c1c");
  }
}
