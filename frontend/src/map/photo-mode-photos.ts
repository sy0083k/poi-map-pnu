import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import { fromLonLat } from "ol/proj";
import type VectorSource from "ol/source/Vector";
import type OlMap from "ol/Map";

import type { createPanelOverlapGuard } from "./panel-overlap-guard";
import type { createPhotoLightbox } from "./photo-lightbox";
import type { PhotoMarkerItem } from "./photo-mode-types";

type Deps = {
  map: OlMap;
  markerSource: VectorSource<Feature<Point>>;
  selectedMarkerSource: VectorSource<Feature<Point>>;
  listContainer: HTMLElement;
  listEmpty: HTMLElement | null;
  navInfo: HTMLElement | null;
  prevButton: HTMLButtonElement;
  nextButton: HTMLButtonElement;
  panel: HTMLElement;
  panelImage: HTMLImageElement;
  panelCaption: HTMLElement | null;
  overlapGuard: ReturnType<typeof createPanelOverlapGuard>;
  lightbox: ReturnType<typeof createPhotoLightbox>;
  showToast: (message: string) => void;
  setMapStatus: (message: string, color?: string) => void;
};

export function createPhotoModePhotosController(deps: Deps) {
  let photoItems: PhotoMarkerItem[] = [];
  let currentIndex = -1;
  let currentObjectUrl: string | null = null;
  const markerItemsById = new globalThis.Map<number, PhotoMarkerItem>();
  const featureByMarkerId = new globalThis.Map<number, Feature<Point>>();

  const clearPanelObjectUrl = (): void => {
    if (!currentObjectUrl) {
      return;
    }
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  };

  const updateNavigation = (): void => {
    const total = photoItems.length;
    if (deps.navInfo instanceof HTMLElement) {
      deps.navInfo.textContent = total === 0 || currentIndex < 0 ? `0 / ${total}` : `${currentIndex + 1} / ${total}`;
    }
    deps.prevButton.disabled = currentIndex <= 0;
    deps.nextButton.disabled = total === 0 || currentIndex >= total - 1;
  };

  const renderList = (): void => {
    deps.listContainer.replaceChildren();
    if (deps.listEmpty instanceof HTMLElement) {
      deps.listEmpty.style.display = photoItems.length === 0 ? "block" : "none";
    }
    photoItems.forEach((item, index) => {
      const li = document.createElement("li");
      li.className = "photo-list-item";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "photo-list-btn list-item";
      if (index === currentIndex) {
        button.classList.add("is-active", "selected");
      }
      button.innerHTML = `<span class="photo-list-name">${item.fileName}</span><span class="photo-list-path">${item.relativePath}</span>`;
      button.addEventListener("click", () => selectPhoto(index, { shouldMoveMap: true, source: "list" }));
      li.appendChild(button);
      deps.listContainer.appendChild(li);
    });
  };

  const updateSelectedMarker = (markerId: number | null): void => {
    deps.selectedMarkerSource.clear();
    if (markerId === null) {
      return;
    }
    const feature = featureByMarkerId.get(markerId);
    if (feature) {
      deps.selectedMarkerSource.addFeature(feature.clone());
    }
  };

  const hidePanel = (): void => {
    deps.overlapGuard.close();
    deps.panel.classList.add("is-hidden");
    deps.panel.setAttribute("aria-expanded", "false");
  };

  const showPanel = (): void => {
    deps.panel.classList.remove("is-hidden");
    deps.overlapGuard.open();
  };

  const clearSelection = (): void => {
    currentIndex = -1;
    updateSelectedMarker(null);
    clearPanelObjectUrl();
    deps.panelImage.removeAttribute("src");
    if (deps.panelCaption instanceof HTMLElement) {
      deps.panelCaption.textContent = "마커 또는 목록에서 사진을 선택하세요.";
    }
    hidePanel();
    renderList();
    updateNavigation();
  };

  const selectPhoto = (index: number, options: { shouldMoveMap: boolean; source: "marker" | "list" | "nav" }): void => {
    if (index < 0 || index >= photoItems.length) {
      return;
    }
    currentIndex = index;
    const selected = photoItems[index];
    updateSelectedMarker(selected.id);
    clearPanelObjectUrl();
    currentObjectUrl = URL.createObjectURL(selected.file);
    deps.panelImage.src = currentObjectUrl;
    deps.panelImage.alt = selected.fileName;
    if (deps.panelCaption instanceof HTMLElement) {
      deps.panelCaption.textContent = `${selected.fileName} (${selected.relativePath})`;
    }
    showPanel();
    renderList();
    updateNavigation();
    if (options.shouldMoveMap) {
      deps.map.getView().animate({ center: fromLonLat([selected.lon, selected.lat]), duration: 250 });
    }
    if (options.source === "marker") {
      deps.showToast(`${selected.fileName} 선택`);
    }
  };

  const clearMarkers = (): void => {
    deps.markerSource.clear();
    deps.selectedMarkerSource.clear();
    markerItemsById.clear();
    featureByMarkerId.clear();
    photoItems = [];
    clearSelection();
  };

  const applyPhotoItems = (nextItems: PhotoMarkerItem[], options: { shouldFitMap: boolean; statusMessage?: string; toastMessage?: string }): void => {
    clearMarkers();
    const features: Feature<Point>[] = nextItems.map((item) => {
      const feature = new Feature({ geometry: new Point(fromLonLat([item.lon, item.lat])) }) as Feature<Point>;
      feature.set("photo_marker_id", item.id);
      feature.set("photo_file_name", item.fileName);
      feature.set("photo_relative_path", item.relativePath);
      return feature;
    });
    deps.markerSource.addFeatures(features);
    nextItems.forEach((item, index) => {
      markerItemsById.set(item.id, item);
      const feature = features[index];
      if (feature) {
        featureByMarkerId.set(item.id, feature);
      }
    });
    photoItems = nextItems;
    if (options.shouldFitMap && features.length > 0) {
      deps.map.getView().fit(deps.markerSource.getExtent(), { padding: [80, 80, 80, 80], duration: 350, maxZoom: 18 });
    }
    renderList();
    updateNavigation();
    hidePanel();
    if (options.statusMessage) {
      deps.setMapStatus(options.statusMessage, "#166534");
    }
    if (options.toastMessage) {
      deps.showToast(options.toastMessage);
    }
  };

  return {
    applyPhotoItems,
    clearMarkers,
    clearPanelObjectUrl,
    clearSelection,
    findIndexByMarkerId: (markerId: number): number => photoItems.findIndex((item) => item.id === markerId),
    hidePanel,
    navigate: (direction: number): void => {
      const total = photoItems.length;
      if (total === 0) {
        return;
      }
      if (currentIndex < 0) {
        if (direction > 0) {
          selectPhoto(0, { shouldMoveMap: true, source: "nav" });
        }
        return;
      }
      const nextIndex = currentIndex + direction;
      if (nextIndex < 0 || nextIndex >= total) {
        return;
      }
      selectPhoto(nextIndex, { shouldMoveMap: true, source: "nav" });
    },
    openSelectedPhotoInLightbox: (): void => {
      if (currentIndex < 0 || currentIndex >= photoItems.length) {
        return;
      }
      deps.lightbox.open(photoItems.map((item) => ({ file: item.file, fileName: item.fileName, relativePath: item.relativePath })), currentIndex);
    },
    renderList,
    selectPhoto,
    updateNavigation
  };
}
