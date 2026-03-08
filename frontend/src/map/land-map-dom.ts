export type LandMapDomElements = {
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
  infoPanelElement: HTMLElement | null;
  infoPanelContent: HTMLElement | null;
  infoPanelCloseButton: HTMLButtonElement | null;
  mobileSearchFab: HTMLElement | null;
  mobileSearchCloseBtn: HTMLElement | null;
  mobileSearchBtn: HTMLElement | null;
  mobileResetBtn: HTMLElement | null;
  mapStatus: HTMLElement | null;
  mapStatusText: HTMLElement | null;
  mapStatusCloseButton: HTMLButtonElement | null;
  mapLegend: HTMLElement | null;
  mapLegendCloseButton: HTMLElement | null;
  uiToast: HTMLElement | null;
  sidebarHandle: HTMLElement | null;
  menuBasemapTrigger: HTMLElement | null;
  menuThemeTrigger: HTMLElement | null;
  file2mapUploadInput: HTMLInputElement | null;
  file2mapUploadButton: HTMLButtonElement | null;
  file2mapUploadClearButton: HTMLButtonElement | null;
};

export function queryLandMapDomElements(): LandMapDomElements {
  return {
    regionSearchInput: document.getElementById("region-search") as HTMLInputElement | null,
    minAreaInput: document.getElementById("min-area") as HTMLInputElement | null,
    maxAreaInput: document.getElementById("max-area") as HTMLInputElement | null,
    propertyManagerSearchInput: document.getElementById("property-manager-search") as HTMLInputElement | null,
    propertyUsageSearchInput: document.getElementById("property-usage-search") as HTMLSelectElement | null,
    landTypeSearchInput: document.getElementById("land-type-search") as HTMLInputElement | null,
    mobileRegionSearchInput: document.getElementById("mobile-region-search") as HTMLInputElement | null,
    mobileMinAreaInput: document.getElementById("mobile-min-area") as HTMLInputElement | null,
    mobileMaxAreaInput: document.getElementById("mobile-max-area") as HTMLInputElement | null,
    mobilePropertyManagerSearchInput: document.getElementById("mobile-property-manager-search") as HTMLInputElement | null,
    mobilePropertyUsageSearchInput: document.getElementById("mobile-property-usage-search") as HTMLSelectElement | null,
    mobileLandTypeSearchInput: document.getElementById("mobile-land-type-search") as HTMLInputElement | null,
    infoPanelElement: document.getElementById("land-info-panel"),
    infoPanelContent: document.getElementById("land-info-content"),
    infoPanelCloseButton: document.getElementById("land-info-close") as HTMLButtonElement | null,
    mobileSearchFab: document.getElementById("mobile-search-fab"),
    mobileSearchCloseBtn: document.getElementById("mobile-search-close"),
    mobileSearchBtn: document.getElementById("mobile-btn-search"),
    mobileResetBtn: document.getElementById("mobile-btn-reset-filters"),
    mapStatus: document.getElementById("map-status"),
    mapStatusText: document.getElementById("map-status-text"),
    mapStatusCloseButton: document.getElementById("map-status-close") as HTMLButtonElement | null,
    mapLegend: document.getElementById("map-legend"),
    mapLegendCloseButton: document.getElementById("map-legend-close"),
    uiToast: document.getElementById("ui-toast"),
    sidebarHandle: document.getElementById("sidebar-handle"),
    menuBasemapTrigger: document.getElementById("menu-basemap-trigger"),
    menuThemeTrigger: document.getElementById("menu-theme-trigger"),
    file2mapUploadInput: document.getElementById("file2map-upload-input") as HTMLInputElement | null,
    file2mapUploadButton: document.getElementById("file2map-upload-btn") as HTMLButtonElement | null,
    file2mapUploadClearButton: document.getElementById("file2map-upload-clear-btn") as HTMLButtonElement | null
  };
}
