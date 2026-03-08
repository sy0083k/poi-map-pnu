export type LandInputElements = {
  regionSearchInput: HTMLInputElement | null;
  minAreaInput: HTMLInputElement | null;
  maxAreaInput: HTMLInputElement | null;
  propertyManagerSearchInput: HTMLInputElement | null;
  propertyUsageSearchInput: HTMLSelectElement | null;
  landTypeSearchInput: HTMLInputElement | null;
  mobileRegionSearchInput: HTMLInputElement | null;
  mobileMinAreaInput: HTMLInputElement | null;
  mobileMaxAreaInput: HTMLInputElement | null;
  mobilePropertyManagerSearchInput: HTMLInputElement | null;
  mobilePropertyUsageSearchInput: HTMLSelectElement | null;
  mobileLandTypeSearchInput: HTMLInputElement | null;
};

export function createInputSyncController(elements: LandInputElements): {
  syncDesktopToMobileInputs: () => void;
  syncMobileToDesktopInputs: () => void;
  clearFile2MapSpecificFilters: () => void;
} {
  const syncDesktopToMobileInputs = (): void => {
    if (
      !elements.regionSearchInput ||
      !elements.minAreaInput ||
      !elements.maxAreaInput ||
      !elements.propertyManagerSearchInput ||
      !elements.propertyUsageSearchInput ||
      !elements.landTypeSearchInput ||
      !elements.mobileRegionSearchInput ||
      !elements.mobileMinAreaInput ||
      !elements.mobileMaxAreaInput ||
      !elements.mobilePropertyManagerSearchInput ||
      !elements.mobilePropertyUsageSearchInput ||
      !elements.mobileLandTypeSearchInput
    ) {
      return;
    }
    elements.mobileRegionSearchInput.value = elements.regionSearchInput.value;
    elements.mobileMinAreaInput.value = elements.minAreaInput.value;
    elements.mobileMaxAreaInput.value = elements.maxAreaInput.value;
    elements.mobilePropertyManagerSearchInput.value = elements.propertyManagerSearchInput.value;
    elements.mobilePropertyUsageSearchInput.value = elements.propertyUsageSearchInput.value;
    elements.mobileLandTypeSearchInput.value = elements.landTypeSearchInput.value;
  };

  const syncMobileToDesktopInputs = (): void => {
    if (
      !elements.regionSearchInput ||
      !elements.minAreaInput ||
      !elements.maxAreaInput ||
      !elements.propertyManagerSearchInput ||
      !elements.propertyUsageSearchInput ||
      !elements.landTypeSearchInput ||
      !elements.mobileRegionSearchInput ||
      !elements.mobileMinAreaInput ||
      !elements.mobileMaxAreaInput ||
      !elements.mobilePropertyManagerSearchInput ||
      !elements.mobilePropertyUsageSearchInput ||
      !elements.mobileLandTypeSearchInput
    ) {
      return;
    }
    elements.regionSearchInput.value = elements.mobileRegionSearchInput.value;
    elements.minAreaInput.value = elements.mobileMinAreaInput.value;
    elements.maxAreaInput.value = elements.mobileMaxAreaInput.value;
    elements.propertyManagerSearchInput.value = elements.mobilePropertyManagerSearchInput.value;
    elements.propertyUsageSearchInput.value = elements.mobilePropertyUsageSearchInput.value;
    elements.landTypeSearchInput.value = elements.mobileLandTypeSearchInput.value;
  };

  const clearFile2MapSpecificFilters = (): void => {
    if (elements.propertyManagerSearchInput) {
      elements.propertyManagerSearchInput.value = "";
    }
    if (elements.propertyUsageSearchInput) {
      elements.propertyUsageSearchInput.value = "";
    }
    if (elements.mobilePropertyManagerSearchInput) {
      elements.mobilePropertyManagerSearchInput.value = "";
    }
    if (elements.mobilePropertyUsageSearchInput) {
      elements.mobilePropertyUsageSearchInput.value = "";
    }
  };

  return {
    syncDesktopToMobileInputs,
    syncMobileToDesktopInputs,
    clearFile2MapSpecificFilters
  };
}

export function applyThemeUiState(theme: "national_public" | "city_owned"): void {
  document.body.classList.toggle("theme-city-owned", theme === "city_owned");
  document.body.classList.toggle("theme-national-public", theme === "national_public");
  document.body.classList.toggle("file2map-mode", theme === "national_public");
}

export function closePhotoPanelUi(): void {
  document.body.classList.remove("photo-panel-open");
  document.body.style.removeProperty("--photo-panel-runtime-height");
  document.body.style.removeProperty("--photo-panel-runtime-bottom-offset");
  const photoPanel = document.getElementById("photo-info-panel");
  if (photoPanel instanceof HTMLElement) {
    photoPanel.classList.add("is-hidden");
    photoPanel.setAttribute("aria-expanded", "false");
  }
}

export function createLegendController(mapLegend: HTMLElement | null): {
  applyLegendUiState: (theme: "national_public" | "city_owned") => void;
  resetLegendDismissed: () => void;
  dismissLegend: () => void;
} {
  let isLegendDismissedByUser = false;

  const applyLegendUiState = (theme: "national_public" | "city_owned"): void => {
    if (!(mapLegend instanceof HTMLElement)) {
      return;
    }
    mapLegend.classList.toggle("is-hidden", theme !== "city_owned" || isLegendDismissedByUser);
  };

  return {
    applyLegendUiState,
    resetLegendDismissed: () => {
      isLegendDismissedByUser = false;
    },
    dismissLegend: () => {
      isLegendDismissedByUser = true;
    }
  };
}
