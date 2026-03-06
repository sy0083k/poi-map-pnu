import Feature from "ol/Feature";
import type Geometry from "ol/geom/Geometry";
import Point from "ol/geom/Point";
import VectorLayer from "ol/layer/Vector";
import { fromLonLat } from "ol/proj";
import VectorSource from "ol/source/Vector";
import CircleStyle from "ol/style/Circle";
import Fill from "ol/style/Fill";
import Stroke from "ol/style/Stroke";
import Style from "ol/style/Style";

import { loadPersistedPhotoMarkers } from "./photo-persistence";
import { createPanelOverlapGuard } from "./panel-overlap-guard";
import type { MapView } from "./map-view";

type PersistedPhotoOverlayDeps = {
  mapView: MapView;
  setMapStatus: (message: string, color?: string) => void;
  showToast: (message: string) => void;
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

function createPhotoPanel(showToast: (message: string) => void) {
  const panel = document.getElementById("photo-info-panel");
  const panelCloseButton = document.getElementById("photo-info-close") as HTMLButtonElement | null;
  const panelImage = document.getElementById("photo-info-image") as HTMLImageElement | null;
  const panelCaption = document.getElementById("photo-info-caption");

  if (!(panel instanceof HTMLElement) || !(panelImage instanceof HTMLImageElement)) {
    return null;
  }

  let objectUrl: string | null = null;
  const overlapGuard = createPanelOverlapGuard({
    body: document.body,
    photoPanel: panel
  });

  const clearObjectUrl = (): void => {
    if (!objectUrl) {
      return;
    }
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  };

  const hidePanel = (): void => {
    overlapGuard.close();
    panel.classList.add("is-hidden");
    panel.setAttribute("aria-expanded", "false");
  };

  const openSelectedPhotoInNewWindow = (): void => {
    if (!objectUrl) {
      return;
    }
    const opened = window.open(objectUrl, "_blank", "noopener,noreferrer");
    if (!opened) {
      showToast("팝업이 차단되었습니다. 브라우저 팝업 허용 후 다시 시도해주세요.");
      return;
    }
    panel.setAttribute("aria-expanded", "true");
  };

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

  panelImage.addEventListener("load", () => {
    overlapGuard.refresh();
  });

  window.addEventListener("beforeunload", () => {
    clearObjectUrl();
    overlapGuard.destroy();
  });

  return {
    show(item: { file: File; fileName: string; relativePath: string }): void {
      clearObjectUrl();
      objectUrl = URL.createObjectURL(item.file);
      panelImage.src = objectUrl;
      panelImage.alt = item.fileName;
      if (panelCaption instanceof HTMLElement) {
        panelCaption.textContent = `${item.fileName} (${item.relativePath})`;
      }
      panel.classList.remove("is-hidden");
      overlapGuard.open();
    },
    clear(): void {
      clearObjectUrl();
      panelImage.removeAttribute("src");
      if (panelCaption instanceof HTMLElement) {
        panelCaption.textContent = "마커 또는 목록에서 사진을 선택하세요.";
      }
      hidePanel();
    }
  };
}

export async function bootstrapPersistedPhotoOverlay(deps: PersistedPhotoOverlayDeps): Promise<void> {
  const map = deps.mapView.getMap();
  if (!map) {
    return;
  }
  const panel = createPhotoPanel(deps.showToast);
  if (!panel) {
    return;
  }

  const persisted = await loadPersistedPhotoMarkers();
  if (!persisted || persisted.items.length === 0) {
    panel.clear();
    return;
  }

  const markerSource = new VectorSource<Feature<Point>>();
  const markerLayer = new VectorLayer({
    source: markerSource,
    style: markerStyle,
    zIndex: 12
  });
  const selectedMarkerSource = new VectorSource<Feature<Point>>();
  const selectedMarkerLayer = new VectorLayer({
    source: selectedMarkerSource,
    style: selectedMarkerStyle,
    zIndex: 13
  });

  map.addLayer(markerLayer);
  map.addLayer(selectedMarkerLayer);

  const featureByMarkerId = new globalThis.Map<number, Feature<Point>>();
  const itemByMarkerId = new globalThis.Map<number, (typeof persisted.items)[number]>();
  const features = persisted.items.map((item) => {
    const feature = new Feature({
      geometry: new Point(fromLonLat([item.lon, item.lat]))
    }) as Feature<Point>;
    feature.set("photo_marker_id", item.id);
    feature.set("photo_file_name", item.fileName);
    feature.set("photo_relative_path", item.relativePath);
    featureByMarkerId.set(item.id, feature);
    itemByMarkerId.set(item.id, item);
    return feature;
  });
  markerSource.addFeatures(features);

  const selectMarker = (markerId: number): void => {
    const item = itemByMarkerId.get(markerId);
    const feature = featureByMarkerId.get(markerId);
    if (!item || !feature) {
      return;
    }
    selectedMarkerSource.clear();
    selectedMarkerSource.addFeature(feature.clone());
    panel.show(item);
    deps.showToast(`${item.fileName} 선택`);
  };

  map.on("singleclick", (evt) => {
    const clicked = map.forEachFeatureAtPixel(evt.pixel, (item) => item as Feature<Geometry> | null);
    if (!(clicked instanceof Feature)) {
      return;
    }
    const markerIdRaw = clicked.get("photo_marker_id");
    const markerId = typeof markerIdRaw === "number" ? markerIdRaw : Number(markerIdRaw);
    if (Number.isFinite(markerId)) {
      selectMarker(markerId);
    }
  });

  deps.setMapStatus(`사진 마커 ${features.length}개를 복원했습니다.`, "#166534");
}
