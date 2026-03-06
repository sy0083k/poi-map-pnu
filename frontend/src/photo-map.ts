import "ol/ol.css";

import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import OlMap from "ol/Map";
import View from "ol/View";
import { fromLonLat } from "ol/proj";
import VectorSource from "ol/source/Vector";
import XYZ from "ol/source/XYZ";
import CircleStyle from "ol/style/Circle";
import Fill from "ol/style/Fill";
import Stroke from "ol/style/Stroke";
import Style from "ol/style/Style";

import { fetchJson, HttpError } from "./http";
import { createFeedback } from "./map/feedback";
import { parseJpegExifGps } from "./photo/exif-gps";

type MapConfig = {
  vworldKey: string;
  center: [number, number];
  zoom: number;
};

type PhotoMarkerItem = {
  id: number;
  file: File;
  fileName: string;
  relativePath: string;
  lat: number;
  lon: number;
};

type PhotoImportSummary = {
  totalFiles: number;
  jpegCandidates: number;
  gpsFound: number;
  skippedNoGps: number;
  skippedUnsupported: number;
  parseErrors: number;
};

const markerStyle = new Style({
  image: new CircleStyle({
    radius: 6,
    fill: new Fill({ color: "rgba(239, 68, 68, 0.9)" }),
    stroke: new Stroke({ color: "#fff", width: 2 })
  })
});

const selectedMarkerStyle = new Style({
  image: new CircleStyle({
    radius: 8,
    fill: new Fill({ color: "rgba(250, 204, 21, 0.95)" }),
    stroke: new Stroke({ color: "#b45309", width: 2.5 })
  })
});

function isJpeg(file: File): boolean {
  const type = (file.type || "").toLowerCase();
  if (type === "image/jpeg" || type === "image/jpg") {
    return true;
  }
  const lower = file.name.toLowerCase();
  return lower.endsWith(".jpg") || lower.endsWith(".jpeg");
}

function getFileLabel(file: File): { fileName: string; relativePath: string } {
  const withPath = file as File & { webkitRelativePath?: string };
  const relativePath = withPath.webkitRelativePath || file.name;
  return {
    fileName: file.name,
    relativePath
  };
}

function updateSummary(element: HTMLElement | null, summary: PhotoImportSummary): void {
  if (!(element instanceof HTMLElement)) {
    return;
  }
  element.textContent =
    `총 파일 ${summary.totalFiles}개, JPEG 후보 ${summary.jpegCandidates}개, ` +
    `GPS 추출 ${summary.gpsFound}개, GPS 없음 ${summary.skippedNoGps}개, ` +
    `미지원 ${summary.skippedUnsupported}개, 파싱 오류 ${summary.parseErrors}개`;
}

async function bootstrap(): Promise<void> {
  const folderInput = document.getElementById("photo-folder-input") as HTMLInputElement | null;
  const loadButton = document.getElementById("photo-load-btn") as HTMLButtonElement | null;
  const clearButton = document.getElementById("photo-clear-btn") as HTMLButtonElement | null;
  const summaryElement = document.getElementById("photo-summary");
  const listContainer = document.getElementById("photo-list");
  const listEmpty = document.getElementById("photo-list-empty");
  const prevButton = document.getElementById("photo-prev-btn") as HTMLButtonElement | null;
  const nextButton = document.getElementById("photo-next-btn") as HTMLButtonElement | null;
  const navInfo = document.getElementById("nav-info");
  const mapStatus = document.getElementById("map-status");
  const mapStatusText = document.getElementById("map-status-text");
  const mapStatusCloseButton = document.getElementById("map-status-close");
  const uiToast = document.getElementById("ui-toast");
  const panel = document.getElementById("photo-info-panel");
  const panelCloseButton = document.getElementById("photo-info-close") as HTMLButtonElement | null;
  const panelImage = document.getElementById("photo-info-image") as HTMLImageElement | null;
  const panelCaption = document.getElementById("photo-info-caption");

  if (
    !(folderInput instanceof HTMLInputElement) ||
    !(loadButton instanceof HTMLButtonElement) ||
    !(clearButton instanceof HTMLButtonElement) ||
    !(listContainer instanceof HTMLElement) ||
    !(prevButton instanceof HTMLButtonElement) ||
    !(nextButton instanceof HTMLButtonElement) ||
    !(panel instanceof HTMLElement) ||
    !(panelImage instanceof HTMLImageElement)
  ) {
    return;
  }

  const { setMapStatus, showToast } = createFeedback({
    mapStatus: mapStatus instanceof HTMLElement ? mapStatus : null,
    mapStatusText: mapStatusText instanceof HTMLElement ? mapStatusText : null,
    mapStatusCloseButton: mapStatusCloseButton instanceof HTMLButtonElement ? mapStatusCloseButton : null,
    uiToast: uiToast instanceof HTMLElement ? uiToast : null
  });

  const config = await fetchJson<MapConfig>("/api/config", { timeoutMs: 10_000 });
  const baseLayer = new TileLayer({
    source: new XYZ({
      url: `https://api.vworld.kr/req/wmts/1.0.0/${config.vworldKey}/Satellite/{z}/{y}/{x}.jpeg`,
      crossOrigin: "anonymous"
    }),
    visible: true,
    zIndex: 0
  });

  const markerSource = new VectorSource();
  const markerLayer = new VectorLayer({
    source: markerSource,
    style: markerStyle,
    zIndex: 11
  });
  const selectedMarkerSource = new VectorSource();
  const selectedMarkerLayer = new VectorLayer({
    source: selectedMarkerSource,
    style: selectedMarkerStyle,
    zIndex: 12
  });

  const map = new OlMap({
    target: "map",
    layers: [baseLayer, markerLayer, selectedMarkerLayer],
    view: new View({
      center: fromLonLat(config.center),
      zoom: config.zoom,
      maxZoom: 21,
      minZoom: 7,
      constrainResolution: false
    })
  });

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
    if (navInfo instanceof HTMLElement) {
      navInfo.textContent = total === 0 || currentIndex < 0 ? `0 / ${total}` : `${currentIndex + 1} / ${total}`;
    }
    prevButton.disabled = currentIndex <= 0;
    nextButton.disabled = total === 0 || currentIndex >= total - 1;
  };

  const renderList = (): void => {
    listContainer.replaceChildren();
    if (listEmpty instanceof HTMLElement) {
      listEmpty.style.display = photoItems.length === 0 ? "block" : "none";
    }

    photoItems.forEach((item, index) => {
      const li = document.createElement("li");
      li.className = "photo-list-item";

      const button = document.createElement("button");
      button.type = "button";
      button.className = "photo-list-btn";
      if (index === currentIndex) {
        button.classList.add("is-active");
      }
      button.innerHTML = `<span class="photo-list-name">${item.fileName}</span><span class="photo-list-path">${item.relativePath}</span>`;
      button.addEventListener("click", () => {
        selectPhoto(index, { shouldMoveMap: true, source: "list" });
      });

      li.appendChild(button);
      listContainer.appendChild(li);
    });
  };

  const updateSelectedMarker = (markerId: number | null): void => {
    selectedMarkerSource.clear();
    if (markerId === null) {
      return;
    }
    const feature = featureByMarkerId.get(markerId);
    if (!feature) {
      return;
    }
    selectedMarkerSource.addFeature(feature.clone());
  };

  const showPanel = (): void => {
    panel.classList.remove("is-hidden");
  };

  const hidePanel = (): void => {
    panel.classList.add("is-hidden");
    panel.setAttribute("aria-expanded", "false");
  };

  const openSelectedPhotoInNewWindow = (): void => {
    if (currentIndex < 0 || currentIndex >= photoItems.length || !currentObjectUrl) {
      return;
    }
    const opened = window.open(currentObjectUrl, "_blank", "noopener,noreferrer");
    if (!opened) {
      showToast("팝업이 차단되었습니다. 브라우저 팝업 허용 후 다시 시도해주세요.");
      return;
    }
    panel.setAttribute("aria-expanded", "true");
  };

  const clearSelection = (): void => {
    currentIndex = -1;
    updateSelectedMarker(null);
    clearPanelObjectUrl();
    panelImage.removeAttribute("src");
    if (panelCaption instanceof HTMLElement) {
      panelCaption.textContent = "마커 또는 목록에서 사진을 선택하세요.";
    }
    hidePanel();
    renderList();
    updateNavigation();
  };

  const selectPhoto = (
    index: number,
    options: { shouldMoveMap: boolean; source: "marker" | "list" | "nav" }
  ): void => {
    if (index < 0 || index >= photoItems.length) {
      return;
    }

    currentIndex = index;
    const selected = photoItems[index];
    updateSelectedMarker(selected.id);

    clearPanelObjectUrl();
    const objectUrl = URL.createObjectURL(selected.file);
    currentObjectUrl = objectUrl;
    panelImage.src = objectUrl;
    panelImage.alt = selected.fileName;
    if (panelCaption instanceof HTMLElement) {
      panelCaption.textContent = `${selected.fileName} (${selected.relativePath})`;
    }

    showPanel();

    renderList();
    updateNavigation();

    if (options.shouldMoveMap) {
      map.getView().animate({
        center: fromLonLat([selected.lon, selected.lat]),
        duration: 250
      });
    }

    if (options.source === "marker") {
      showToast(`${selected.fileName} 선택`);
    }
  };

  map.on("singleclick", (evt) => {
    const feature = map.forEachFeatureAtPixel(evt.pixel, (item) => item as Feature<Point> | null);
    if (!(feature instanceof Feature)) {
      return;
    }
    const markerIdRaw = feature.get("photo_marker_id");
    const markerId = typeof markerIdRaw === "number" ? markerIdRaw : Number(markerIdRaw);
    if (!Number.isFinite(markerId)) {
      return;
    }
    const marker = markerItemsById.get(markerId);
    if (!marker) {
      return;
    }
    const targetIndex = photoItems.findIndex((item) => item.id === marker.id);
    if (targetIndex < 0) {
      return;
    }
    selectPhoto(targetIndex, { shouldMoveMap: false, source: "marker" });
  });

  const clearMarkers = (): void => {
    markerSource.clear();
    selectedMarkerSource.clear();
    markerItemsById.clear();
    featureByMarkerId.clear();
    photoItems = [];
    clearSelection();
  };

  prevButton.addEventListener("click", () => {
    if (currentIndex <= 0) {
      return;
    }
    selectPhoto(currentIndex - 1, { shouldMoveMap: true, source: "nav" });
  });

  nextButton.addEventListener("click", () => {
    if (photoItems.length === 0) {
      return;
    }
    if (currentIndex < 0) {
      selectPhoto(0, { shouldMoveMap: true, source: "nav" });
      return;
    }
    if (currentIndex >= photoItems.length - 1) {
      return;
    }
    selectPhoto(currentIndex + 1, { shouldMoveMap: true, source: "nav" });
  });

  panelCloseButton?.addEventListener("click", () => {
    hidePanel();
  });

  panel.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest("#photo-info-close")) {
      return;
    }
    openSelectedPhotoInNewWindow();
  });

  panel.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    openSelectedPhotoInNewWindow();
  });

  clearButton.addEventListener("click", () => {
    clearMarkers();
    folderInput.value = "";
    if (summaryElement instanceof HTMLElement) {
      summaryElement.textContent = "폴더를 선택한 뒤 마커 생성을 눌러주세요.";
    }
    setMapStatus("사진 마커를 초기화했습니다.", "#1f2937");
  });

  loadButton.addEventListener("click", () => {
    const selected = folderInput.files;
    if (!selected || selected.length === 0) {
      setMapStatus("먼저 사진 폴더를 선택해주세요.", "#b45309");
      return;
    }

    void (async () => {
      const allFiles = Array.from(selected);
      const jpegFiles = allFiles.filter((file) => isJpeg(file));
      const summary: PhotoImportSummary = {
        totalFiles: allFiles.length,
        jpegCandidates: jpegFiles.length,
        gpsFound: 0,
        skippedNoGps: 0,
        skippedUnsupported: allFiles.length - jpegFiles.length,
        parseErrors: 0
      };

      const nextMarkerItems: PhotoMarkerItem[] = [];
      setMapStatus(`사진 EXIF를 분석 중입니다... (0/${jpegFiles.length})`, "#1d4ed8");

      for (let index = 0; index < jpegFiles.length; index += 1) {
        const file = jpegFiles[index];
        try {
          const buffer = await file.arrayBuffer();
          const gps = parseJpegExifGps(buffer);
          if (!gps) {
            summary.skippedNoGps += 1;
          } else {
            const labels = getFileLabel(file);
            nextMarkerItems.push({
              id: summary.gpsFound + 1,
              file,
              fileName: labels.fileName,
              relativePath: labels.relativePath,
              lat: gps.lat,
              lon: gps.lon
            });
            summary.gpsFound += 1;
          }
        } catch {
          summary.parseErrors += 1;
        }

        if ((index + 1) % 20 === 0 || index + 1 === jpegFiles.length) {
          setMapStatus(`사진 EXIF를 분석 중입니다... (${index + 1}/${jpegFiles.length})`, "#1d4ed8");
        }
      }

      clearMarkers();

      const features: Feature<Point>[] = nextMarkerItems.map((item) => {
        const feature = new Feature({
          geometry: new Point(fromLonLat([item.lon, item.lat]))
        }) as Feature<Point>;
        feature.set("photo_marker_id", item.id);
        feature.set("photo_file_name", item.fileName);
        feature.set("photo_relative_path", item.relativePath);
        return feature;
      });

      markerSource.addFeatures(features);
      nextMarkerItems.forEach((item, index) => {
        markerItemsById.set(item.id, item);
        const feature = features[index];
        if (feature) {
          featureByMarkerId.set(item.id, feature);
        }
      });
      photoItems = nextMarkerItems;

      if (features.length > 0) {
        map.getView().fit(markerSource.getExtent(), {
          padding: [80, 80, 80, 80],
          duration: 350,
          maxZoom: 18
        });
      }

      renderList();
      updateNavigation();
      clearPanelObjectUrl();
      panelImage.removeAttribute("src");
      if (panelCaption instanceof HTMLElement) {
        panelCaption.textContent = "마커 또는 목록에서 사진을 선택하세요.";
      }
      hidePanel();
      updateSummary(summaryElement instanceof HTMLElement ? summaryElement : null, summary);
      setMapStatus(`GPS 마커 ${features.length}개를 지도에 표시했습니다.`, "#166534");
      showToast(`GPS 추출 ${features.length}건`);
    })();
  });

  window.addEventListener("resize", () => {
    map.updateSize();
  });

  window.addEventListener("beforeunload", () => {
    clearPanelObjectUrl();
  });

  renderList();
  updateNavigation();
}

document.addEventListener("DOMContentLoaded", () => {
  void bootstrap().catch((error) => {
    const message = error instanceof HttpError ? error.message : "사진 지도를 초기화하지 못했습니다.";
    const mapStatus = document.getElementById("map-status");
    const mapStatusText = document.getElementById("map-status-text");
    if (mapStatus instanceof HTMLElement) {
      mapStatus.classList.remove("is-hidden");
    }
    if (mapStatusText instanceof HTMLElement) {
      mapStatusText.textContent = message;
      mapStatusText.style.color = "#b91c1c";
    }
  });
});
