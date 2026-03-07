import Feature from "ol/Feature";
import GeoJSON from "ol/format/GeoJSON";
import type Geometry from "ol/geom/Geometry";
import Point from "ol/geom/Point";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import OlMap from "ol/Map";
import View from "ol/View";
import { getCenter } from "ol/extent";
import { fromLonLat } from "ol/proj";
import VectorSource from "ol/source/Vector";
import XYZ from "ol/source/XYZ";
import CircleStyle from "ol/style/Circle";
import Fill from "ol/style/Fill";
import Stroke from "ol/style/Stroke";
import Style from "ol/style/Style";

import { fetchJson } from "../http";
import { parseJpegExifGps } from "../photo/exif-gps";
import { loadUploadedHighlights } from "./cadastral-fgb-layer";
import { createFeedback } from "./feedback";
import { loadPersistedFile2MapUpload } from "./local-upload";
import { createPanelOverlapGuard } from "./panel-overlap-guard";
import { createPhotoLightbox } from "./photo-lightbox";
import {
  clearPersistedPhotoMarkers,
  loadPersistedPhotoMarkers,
  savePersistedPhotoMarkers
} from "./photo-persistence";

import type { LandFeatureCollection, LandListItem, LandSourceField, MapConfig } from "./types";

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

const landFeatureStyle = new Style({
  stroke: new Stroke({ color: "#ff3333", width: 3 }),
  fill: new Fill({ color: "rgba(255, 51, 51, 0.2)" })
});

const selectedLandFeatureStyle = new Style({
  stroke: new Stroke({ color: "#ffd400", width: 4 }),
  fill: new Fill({ color: "rgba(255, 212, 0, 0.18)" })
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

function normalizeInline(value: string): string {
  return value.replace(/[\r\n\t]+/g, " ").trim();
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

function buildLandFallbackRows(item: LandListItem): LandSourceField[] {
  return [
    { key: "pnu", label: "PNU", value: stringifyValue(item.pnu) },
    { key: "address", label: "주소", value: stringifyValue(item.address) },
    { key: "area", label: "면적", value: `${item.area}㎡` },
    { key: "land_type", label: "지목", value: stringifyValue(item.land_type) },
    { key: "property_manager", label: "재산관리관", value: stringifyValue(item.property_manager) }
  ].filter((row) => row.value !== "");
}

export async function bootstrapPhotoMode(): Promise<void> {
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
  const landInfoPanel = document.getElementById("land-info-panel");
  const landInfoContent = document.getElementById("land-info-content");
  const landInfoCloseButton = document.getElementById("land-info-close") as HTMLButtonElement | null;

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

  const landSource = new VectorSource<Feature<Geometry>>();
  const landLayer = new VectorLayer({
    source: landSource,
    style: landFeatureStyle,
    zIndex: 9
  });
  const selectedLandSource = new VectorSource<Feature<Geometry>>();
  const selectedLandLayer = new VectorLayer({
    source: selectedLandSource,
    style: selectedLandFeatureStyle,
    zIndex: 10
  });

  const markerSource = new VectorSource<Feature<Point>>();
  const markerLayer = new VectorLayer({
    source: markerSource,
    style: markerStyle,
    zIndex: 11
  });
  const selectedMarkerSource = new VectorSource<Feature<Point>>();
  const selectedMarkerLayer = new VectorLayer({
    source: selectedMarkerSource,
    style: selectedMarkerStyle,
    zIndex: 12
  });

  const map = new OlMap({
    target: "map",
    layers: [baseLayer, landLayer, selectedLandLayer, markerLayer, selectedMarkerLayer],
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
  const lightbox = createPhotoLightbox({ showToast });
  const overlapGuard = createPanelOverlapGuard({
    body: document.body,
    photoPanel: panel
  });
  const markerItemsById = new globalThis.Map<number, PhotoMarkerItem>();
  const featureByMarkerId = new globalThis.Map<number, Feature<Point>>();
  const landItemsByIndex = new globalThis.Map<number, LandListItem>();
  const landFeatureByIndex = new globalThis.Map<number, Feature<Geometry>>();

  const clearPanelObjectUrl = (): void => {
    if (!currentObjectUrl) {
      return;
    }
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  };

  const renderLandInfoRows = (rows: LandSourceField[]): void => {
    if (!(landInfoContent instanceof HTMLElement)) {
      return;
    }
    landInfoContent.replaceChildren();
    landInfoContent.scrollTop = 0;
    if (rows.length === 0) {
      const empty = document.createElement("div");
      empty.className = "land-info-empty";
      empty.textContent = "표시할 상세 정보가 없습니다.";
      landInfoContent.appendChild(empty);
      return;
    }
    rows.forEach((row) => {
      const keyCell = document.createElement("div");
      keyCell.className = "land-info-key";
      keyCell.textContent = normalizeInline(row.label);

      const valueCell = document.createElement("div");
      valueCell.className = "land-info-val";
      valueCell.textContent = normalizeInline(row.value);

      landInfoContent.append(keyCell, valueCell);
    });
  };

  const hideLandInfoPanel = (): void => {
    if (!(landInfoPanel instanceof HTMLElement)) {
      return;
    }
    landInfoPanel.classList.add("is-hidden");
    landInfoPanel.classList.remove("has-selection");
  };

  const showLandInfoPanel = (): void => {
    if (!(landInfoPanel instanceof HTMLElement)) {
      return;
    }
    landInfoPanel.classList.remove("is-hidden");
    landInfoPanel.classList.add("has-selection");
  };

  const clearSelectedLand = (): void => {
    selectedLandSource.clear();
    hideLandInfoPanel();
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
      button.className = "photo-list-btn list-item";
      if (index === currentIndex) {
        button.classList.add("is-active");
        button.classList.add("selected");
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
    overlapGuard.open();
  };

  const hidePanel = (): void => {
    overlapGuard.close();
    panel.classList.add("is-hidden");
    panel.setAttribute("aria-expanded", "false");
  };

  const openSelectedPhotoInLightbox = (): void => {
    if (currentIndex < 0 || currentIndex >= photoItems.length) {
      return;
    }
    lightbox.open(
      photoItems.map((item) => ({
        file: item.file,
        fileName: item.fileName,
        relativePath: item.relativePath
      })),
      currentIndex
    );
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

  const selectLandByIndex = (index: number, shouldMoveMap: boolean): void => {
    const landItem = landItemsByIndex.get(index);
    const landFeature = landFeatureByIndex.get(index);
    if (!landItem || !landFeature) {
      return;
    }

    selectedLandSource.clear();
    selectedLandSource.addFeature(landFeature.clone());

    const rows = landItem.sourceFields.length > 0 ? landItem.sourceFields : buildLandFallbackRows(landItem);
    renderLandInfoRows(rows);
    showLandInfoPanel();

    if (shouldMoveMap) {
      const geometry = landFeature.getGeometry();
      if (geometry) {
        map.getView().animate({
          center: getCenter(geometry.getExtent()),
          duration: 250
        });
      }
    }
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

  const loadFile2MapLandHighlights = async (): Promise<void> => {
    try {
      const persisted = await loadPersistedFile2MapUpload();
      if (!persisted || persisted.items.length === 0) {
        return;
      }

      const items = persisted.items;
      const uploadedPnus = Array.from(new Set(items.map((item) => item.pnu)));
      setMapStatus(`업로드 토지 하이라이트를 준비하는 중입니다... (${uploadedPnus.length}건)`, "#1d4ed8");

      const loaded = await loadUploadedHighlights({
        fgbUrl: config.cadastralFgbUrl,
        pnuField: config.cadastralPnuField,
        cadastralCrs: config.cadastralCrs,
        uploadedPnus,
        theme: "national_public",
        onProgress: (progress) => {
          if (progress.done) {
            return;
          }
          setMapStatus(
            `업로드 토지 하이라이트 매칭 ${progress.matched}/${progress.total}건 (스캔 ${progress.scanned.toLocaleString()}건)`,
            "#166534"
          );
        }
      });

      const geometryByPnu = new Map<string, unknown>();
      loaded.features.forEach((feature) => {
        const pnu = String(feature.properties.pnu || "").replace(/\D/g, "");
        if (pnu) {
          geometryByPnu.set(pnu, feature.geometry);
        }
      });

      const listLinkedFeatures: LandFeatureCollection = {
        type: "FeatureCollection",
        features: items.flatMap((item, index) => {
          const geometry = geometryByPnu.get(item.pnu);
          if (!geometry) {
            return [];
          }
          return [
            {
              type: "Feature" as const,
              geometry,
              properties: {
                list_index: index,
                id: item.id,
                pnu: item.pnu,
                address: item.address,
                land_type: item.land_type,
                area: item.area,
                property_manager: item.property_manager,
                source_fields: item.sourceFields
              }
            }
          ];
        })
      };

      const features = new GeoJSON().readFeatures(listLinkedFeatures, {
        dataProjection: config.cadastralCrs,
        featureProjection: "EPSG:3857"
      }) as Feature<Geometry>[];

      landSource.clear();
      landItemsByIndex.clear();
      landFeatureByIndex.clear();
      features.forEach((feature, fallbackIndex) => {
        const props = feature.getProperties() as { list_index?: unknown };
        const index = typeof props.list_index === "number" ? props.list_index : fallbackIndex;
        feature.setId(index);
        landFeatureByIndex.set(index, feature);
        const landItem = items[index];
        if (landItem) {
          landItemsByIndex.set(index, landItem);
        }
      });
      landSource.addFeatures(features);

      if (features.length > 0) {
        setMapStatus(`업로드 토지 하이라이트 ${features.length}건을 표시했습니다.`, "#166534");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "업로드 토지 하이라이트를 불러오지 못했습니다.";
      setMapStatus(`업로드 토지 하이라이트 로드 실패: ${message}`, "#b45309");
    }
  };

  map.on("singleclick", (evt) => {
    const feature = map.forEachFeatureAtPixel(evt.pixel, (item) => item as Feature<Geometry> | null);
    if (!(feature instanceof Feature)) {
      clearSelectedLand();
      return;
    }

    const markerIdRaw = feature.get("photo_marker_id");
    const markerId = typeof markerIdRaw === "number" ? markerIdRaw : Number(markerIdRaw);
    if (Number.isFinite(markerId)) {
      const marker = markerItemsById.get(markerId);
      if (!marker) {
        return;
      }
      const targetIndex = photoItems.findIndex((item) => item.id === marker.id);
      if (targetIndex < 0) {
        return;
      }
      selectPhoto(targetIndex, { shouldMoveMap: false, source: "marker" });
      return;
    }

    const landIndexRaw = feature.get("list_index");
    const landIndex = typeof landIndexRaw === "number" ? landIndexRaw : Number(landIndexRaw);
    if (Number.isFinite(landIndex)) {
      selectLandByIndex(landIndex, false);
      return;
    }

    clearSelectedLand();
  });

  const clearMarkers = (): void => {
    markerSource.clear();
    selectedMarkerSource.clear();
    markerItemsById.clear();
    featureByMarkerId.clear();
    photoItems = [];
    clearSelection();
  };

  const applyPhotoItems = (
    nextMarkerItems: PhotoMarkerItem[],
    options: { shouldFitMap: boolean; statusMessage?: string; toastMessage?: string }
  ): void => {
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

    if (options.shouldFitMap && features.length > 0) {
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
    if (options.statusMessage) {
      setMapStatus(options.statusMessage, "#166534");
    }
    if (options.toastMessage) {
      showToast(options.toastMessage);
    }
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
    openSelectedPhotoInLightbox();
  });

  panel.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    openSelectedPhotoInLightbox();
  });

  panelImage.addEventListener("load", () => {
    overlapGuard.refresh();
  });

  landInfoCloseButton?.addEventListener("click", () => {
    clearSelectedLand();
  });

  clearButton.addEventListener("click", () => {
    clearMarkers();
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

      try {
        await savePersistedPhotoMarkers(
          nextMarkerItems.map((item) => ({
            id: item.id,
            file: item.file,
            fileName: item.fileName,
            relativePath: item.relativePath,
            lat: item.lat,
            lon: item.lon
          }))
        );
      } catch {
        setMapStatus("사진 마커 저장소 기록에 실패했습니다. 현재 세션에서만 표시됩니다.", "#b45309");
      }

      applyPhotoItems(nextMarkerItems, {
        shouldFitMap: true,
        statusMessage: `GPS 마커 ${nextMarkerItems.length}개를 지도에 표시했습니다.`,
        toastMessage: `GPS 추출 ${nextMarkerItems.length}건`
      });
      updateSummary(summaryElement instanceof HTMLElement ? summaryElement : null, summary);
    })();
  });

  window.addEventListener("resize", () => {
    map.updateSize();
  });

  window.addEventListener("beforeunload", () => {
    clearPanelObjectUrl();
    lightbox.destroy();
    overlapGuard.destroy();
  });

  renderList();
  updateNavigation();
  try {
    const persisted = await loadPersistedPhotoMarkers();
    if (persisted && persisted.items.length > 0) {
      const restoredItems: PhotoMarkerItem[] = persisted.items.map((item, index) => ({
        id: item.id || index + 1,
        file: item.file,
        fileName: item.fileName,
        relativePath: item.relativePath,
        lat: item.lat,
        lon: item.lon
      }));
      applyPhotoItems(restoredItems, {
        shouldFitMap: false,
        statusMessage: `저장된 사진 마커 ${restoredItems.length}개를 복원했습니다.`
      });
      if (summaryElement instanceof HTMLElement) {
        summaryElement.textContent = `저장된 사진 ${restoredItems.length}개를 복원했습니다.`;
      }
    }
  } catch {
    setMapStatus("저장된 사진 마커 복원에 실패했습니다.", "#b45309");
  }
  void loadFile2MapLandHighlights();
}
