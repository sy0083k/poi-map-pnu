import { getThemeFromPathname } from "./theme-routing";

export function bindLandMapEvents(deps: {
  mapView: {
    setFeatureClickHandler: (handler: (payload: { index: number }) => void) => void;
    setMoveEndHandler: (handler: (() => void) | null) => void;
    setTheme: (theme: "national_public" | "city_owned") => void;
    clearInfoPanel: () => void;
  };
  workflow: {
    selectItem: (index: number, options: { shouldFit: boolean; clickSource?: "map_click" | "list_click" | "nav_prev" | "nav_next" }) => void;
    applyFilters: (trackEvent?: boolean) => Promise<void>;
    resetFilters: (syncDesktopToMobileInputs: () => void) => void;
    downloadCurrentSearchResults: () => void;
    navigateItem: (direction: number) => void;
    loadThemeData: (theme: "national_public" | "city_owned") => Promise<void>;
  };
  state: {
    getCurrentTheme: () => "national_public" | "city_owned";
    setCurrentTheme: (theme: "national_public" | "city_owned") => void;
  };
  listPanel: {
    bindNavigation: (onPrev: () => void, onNext: () => void) => void;
    initBottomSheet: () => void;
  };
  filters: {
    attachEnter: (handler: () => void) => void;
  };
  syncDesktopToMobileInputs: () => void;
  applyThemeUiState: (theme: "national_public" | "city_owned") => void;
  clearFile2MapSpecificFilters: () => void;
  syncThemeMenuActiveState: (theme: "national_public" | "city_owned") => void;
  closePhotoPanelUi: () => void;
  applyLegendUiState: (theme: "national_public" | "city_owned") => void;
  resetLegendDismissed: () => void;
}): void {
  deps.mapView.setFeatureClickHandler(({ index }) => deps.workflow.selectItem(index, { shouldFit: false, clickSource: "map_click" }));
  deps.mapView.setMoveEndHandler(() => {});

  document.getElementById("btn-search")?.addEventListener("click", () => void deps.workflow.applyFilters(true));
  document.getElementById("btn-reset-filters")?.addEventListener("click", () => deps.workflow.resetFilters(deps.syncDesktopToMobileInputs));
  document.getElementById("btn-download-all")?.addEventListener("click", () => deps.workflow.downloadCurrentSearchResults());

  deps.listPanel.bindNavigation(() => deps.workflow.navigateItem(-1), () => deps.workflow.navigateItem(1));
  deps.filters.attachEnter(() => void deps.workflow.applyFilters(true));
  deps.listPanel.initBottomSheet();

  window.addEventListener("popstate", () => {
    const nextTheme = getThemeFromPathname(window.location.pathname);
    if (!nextTheme || nextTheme === deps.state.getCurrentTheme()) {
      return;
    }
    if (deps.state.getCurrentTheme() !== "city_owned" && nextTheme === "city_owned") {
      deps.resetLegendDismissed();
    }
    deps.state.setCurrentTheme(nextTheme);
    deps.mapView.setTheme(nextTheme);
    deps.applyThemeUiState(nextTheme);
    if (nextTheme === "national_public") {
      deps.clearFile2MapSpecificFilters();
    }
    deps.syncThemeMenuActiveState(nextTheme);
    deps.closePhotoPanelUi();
    deps.applyLegendUiState(nextTheme);
    deps.mapView.clearInfoPanel();
    void deps.workflow.loadThemeData(nextTheme);
  });
}
