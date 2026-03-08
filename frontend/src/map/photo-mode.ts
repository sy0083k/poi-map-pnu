import Feature from "ol/Feature";
import type Geometry from "ol/geom/Geometry";
import Point from "ol/geom/Point";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import OlMap from "ol/Map";
import View from "ol/View";
import { fromLonLat } from "ol/proj";
import VectorSource from "ol/source/Vector";
import XYZ from "ol/source/XYZ";

import { fetchJson } from "../http";
import { createFeedback } from "./feedback";
import { updateSummary } from "./photo-mode-helpers";
import { createPhotoModeImport } from "./photo-mode-import";
import { createPhotoModeLandController } from "./photo-mode-land";
import { createPhotoModePhotosController } from "./photo-mode-photos";
import { landFeatureStyle, markerStyle, selectedLandFeatureStyle, selectedMarkerStyle } from "./photo-mode-styles";
import { createPanelOverlapGuard } from "./panel-overlap-guard";
import { createPhotoLightbox } from "./photo-lightbox";
import { loadPersistedPhotoMarkers, savePersistedPhotoMarkers, clearPersistedPhotoMarkers } from "./photo-persistence";

import type { MapConfig } from "./types";

export async function bootstrapPhotoMode(): Promise<void> {
  const folderInput = document.getElementById("photo-folder-input") as HTMLInputElement | null;
  const loadButton = document.getElementById("photo-load-btn") as HTMLButtonElement | null;
  const clearButton = document.getElementById("photo-clear-btn") as HTMLButtonElement | null;
  const listContainer = document.getElementById("photo-list");
  const prevButton = document.getElementById("photo-prev-btn") as HTMLButtonElement | null;
  const nextButton = document.getElementById("photo-next-btn") as HTMLButtonElement | null;
  const panel = document.getElementById("photo-info-panel");
  const panelImage = document.getElementById("photo-info-image") as HTMLImageElement | null;
  if (!(folderInput && loadButton && clearButton && listContainer && prevButton && nextButton && panel && panelImage)) {
    return;
  }

  const summaryElement = document.getElementById("photo-summary");
  const listEmpty = document.getElementById("photo-list-empty");
  const navInfo = document.getElementById("nav-info");
  const panelCloseButton = document.getElementById("photo-info-close") as HTMLButtonElement | null;
  const panelCaption = document.getElementById("photo-info-caption");
  const landInfoPanel = document.getElementById("land-info-panel");
  const landInfoContent = document.getElementById("land-info-content");
  const landInfoCloseButton = document.getElementById("land-info-close") as HTMLButtonElement | null;

  const { setMapStatus, showToast } = createFeedback({
    mapStatus: document.getElementById("map-status") as HTMLElement | null,
    mapStatusText: document.getElementById("map-status-text") as HTMLElement | null,
    mapStatusCloseButton: document.getElementById("map-status-close") as HTMLButtonElement | null,
    uiToast: document.getElementById("ui-toast") as HTMLElement | null
  });

  const config = await fetchJson<MapConfig>("/api/config", { timeoutMs: 10_000 });
  const map = new OlMap({
    target: "map",
    layers: [
      new TileLayer({
        source: new XYZ({
          url: `https://api.vworld.kr/req/wmts/1.0.0/${config.vworldKey}/Satellite/{z}/{y}/{x}.jpeg`,
          crossOrigin: "anonymous"
        }),
        visible: true,
        zIndex: 0
      })
    ],
    view: new View({
      center: fromLonLat(config.center),
      zoom: config.zoom,
      maxZoom: 21,
      minZoom: 7,
      constrainResolution: false
    })
  });

  const landSource = new VectorSource<Feature<Geometry>>();
  const selectedLandSource = new VectorSource<Feature<Geometry>>();
  const markerSource = new VectorSource<Feature<Point>>();
  const selectedMarkerSource = new VectorSource<Feature<Point>>();
  map.addLayer(new VectorLayer({ source: landSource, style: landFeatureStyle, zIndex: 9 }));
  map.addLayer(new VectorLayer({ source: selectedLandSource, style: selectedLandFeatureStyle, zIndex: 10 }));
  map.addLayer(new VectorLayer({ source: markerSource, style: markerStyle, zIndex: 11 }));
  map.addLayer(new VectorLayer({ source: selectedMarkerSource, style: selectedMarkerStyle, zIndex: 12 }));

  const lightbox = createPhotoLightbox({ showToast });
  const overlapGuard = createPanelOverlapGuard({ body: document.body, photoPanel: panel });
  const photos = createPhotoModePhotosController({
    map,
    markerSource,
    selectedMarkerSource,
    listContainer,
    listEmpty: listEmpty instanceof HTMLElement ? listEmpty : null,
    navInfo: navInfo instanceof HTMLElement ? navInfo : null,
    prevButton,
    nextButton,
    panel,
    panelImage,
    panelCaption: panelCaption instanceof HTMLElement ? panelCaption : null,
    overlapGuard,
    lightbox,
    showToast,
    setMapStatus
  });
  const lands = createPhotoModeLandController({
    map,
    config,
    setMapStatus,
    landSource,
    selectedLandSource,
    landInfoPanel: landInfoPanel instanceof HTMLElement ? landInfoPanel : null,
    landInfoContent: landInfoContent instanceof HTMLElement ? landInfoContent : null
  });
  const importer = createPhotoModeImport({ setMapStatus });

  map.on("singleclick", (evt) => {
    const feature = map.forEachFeatureAtPixel(evt.pixel, (item) => item as Feature<Geometry> | null);
    if (!(feature instanceof Feature)) {
      lands.clearSelectedLand();
      return;
    }
    const markerIdRaw = feature.get("photo_marker_id");
    const markerId = typeof markerIdRaw === "number" ? markerIdRaw : Number(markerIdRaw);
    if (Number.isFinite(markerId)) {
      const index = photos.findIndexByMarkerId(markerId);
      if (index >= 0) {
        photos.selectPhoto(index, { shouldMoveMap: false, source: "marker" });
      }
      return;
    }
    const landIndexRaw = feature.get("list_index");
    const landIndex = typeof landIndexRaw === "number" ? landIndexRaw : Number(landIndexRaw);
    if (Number.isFinite(landIndex)) {
      lands.selectLandByIndex(landIndex, false);
      return;
    }
    lands.clearSelectedLand();
  });

  prevButton.addEventListener("click", () => photos.navigate(-1));
  nextButton.addEventListener("click", () => photos.navigate(1));
  panelCloseButton?.addEventListener("click", () => photos.hidePanel());
  panel.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element && target.closest("#photo-info-close"))) {
      photos.openSelectedPhotoInLightbox();
    }
  });
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      photos.openSelectedPhotoInLightbox();
    }
  });
  panelImage.addEventListener("load", () => overlapGuard.refresh());
  landInfoCloseButton?.addEventListener("click", () => lands.clearSelectedLand());

  clearButton.addEventListener("click", () => {
    photos.clearMarkers();
    folderInput.value = "";
    if (summaryElement instanceof HTMLElement) {
      summaryElement.textContent = "폴더를 선택한 뒤 마커 생성을 눌러주세요.";
    }
    void clearPersistedPhotoMarkers();
    setMapStatus("사진 마커를 초기화했습니다.", "#1f2937");
  });

  loadButton.addEventListener("click", () => {
    const selected = folderInput.files;
    if (!selected || selected.length === 0) {
      setMapStatus("먼저 사진 폴더를 선택해주세요.", "#b45309");
      return;
    }
    void (async () => {
      const { items, summary } = await importer.buildMarkerItems(selected);
      try {
        await savePersistedPhotoMarkers(items);
      } catch {
        setMapStatus("사진 마커 저장소 기록에 실패했습니다. 현재 세션에서만 표시됩니다.", "#b45309");
      }
      photos.applyPhotoItems(items, {
        shouldFitMap: true,
        statusMessage: `GPS 마커 ${items.length}개를 지도에 표시했습니다.`,
        toastMessage: `GPS 추출 ${items.length}건`
      });
      updateSummary(summaryElement instanceof HTMLElement ? summaryElement : null, summary);
    })();
  });

  window.addEventListener("resize", () => map.updateSize());
  window.addEventListener("beforeunload", () => {
    photos.clearPanelObjectUrl();
    lightbox.destroy();
    overlapGuard.destroy();
  });

  photos.renderList();
  photos.updateNavigation();
  try {
    const persisted = await loadPersistedPhotoMarkers();
    if (persisted && persisted.items.length > 0) {
      photos.applyPhotoItems(persisted.items.map((item, index) => ({ ...item, id: item.id || index + 1 })), {
        shouldFitMap: false,
        statusMessage: `저장된 사진 마커 ${persisted.items.length}개를 복원했습니다.`
      });
      if (summaryElement instanceof HTMLElement) {
        summaryElement.textContent = `저장된 사진 ${persisted.items.length}개를 복원했습니다.`;
      }
    }
  } catch {
    setMapStatus("저장된 사진 마커 복원에 실패했습니다.", "#b45309");
  }

  void lands.loadFile2MapLandHighlights();
}
