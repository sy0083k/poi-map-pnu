type MapConfig = {
  vworldKey: string;
  center: [number, number];
  zoom: number;
};

type LandFeatureProperties = {
  id?: number;
  address?: string;
  land_type?: string;
  area?: number;
  adm_property?: string;
  gen_property?: string;
  contact?: string;
};

type LandFeature = {
  type: "Feature";
  geometry: unknown;
  properties: LandFeatureProperties;
};

type LandFeatureCollection = {
  type: "FeatureCollection";
  features: LandFeature[];
};

let map: any;
let baseLayer: any;
let satLayer: any;
let hybLayer: any;
let vectorLayer: any;
let originalData: LandFeatureCollection | null = null;
let currentFeaturesData: LandFeature[] = [];
let currentIndex = -1;
let overlay: any;
let content: HTMLElement | null = null;
let regionSearchInput: HTMLInputElement | null = null;

let startY = 0;
let startHeight = 0;
const sidebar = document.getElementById("sidebar");
const handle = document.querySelector(".mobile-handle");
const snapHeights = {
  collapsed: 0.15,
  mid: 0.4,
  expanded: 0.85
};

function initMap(key: string, center: [number, number], zoom: number): void {
  const commonSource = (type: string) =>
    new ol.source.XYZ({
      url: `https://api.vworld.kr/req/wmts/1.0.0/${key}/${type}/{z}/{y}/{x}.${type === "Satellite" ? "jpeg" : "png"}`,
      crossOrigin: "anonymous"
    });

  baseLayer = new ol.layer.Tile({ source: commonSource("Base"), visible: true, zIndex: 0 });
  satLayer = new ol.layer.Tile({ source: commonSource("Satellite"), visible: false, zIndex: 0 });
  hybLayer = new ol.layer.Tile({ source: commonSource("Hybrid"), visible: false, zIndex: 1 });

  map = new ol.Map({
    target: "map",
    layers: [baseLayer, satLayer, hybLayer],
    overlays: [overlay],
    view: new ol.View({
      center: ol.proj.fromLonLat(center),
      zoom,
      maxZoom: 22,
      minZoom: 7,
      constrainResolution: false
    })
  });

  map.on("singleclick", (evt: any) => {
    const feature = map.forEachFeatureAtPixel(evt.pixel, (item: any) => item);
    if (feature) {
      const idx = feature.getId();
      if (idx !== undefined) {
        selectItem(Number(idx), false);
      }
      showPopup(feature, evt.coordinate);
    } else {
      overlay?.setPosition(undefined);
    }
  });
}

function changeLayer(type: "Base" | "Satellite" | "Hybrid"): void {
  if (!map) return;
  if (map.getView().getZoom() >= 20) map.getView().setZoom(19);
  baseLayer.setVisible(type === "Base");
  satLayer.setVisible(type === "Satellite" || type === "Hybrid");
  hybLayer.setVisible(type === "Hybrid");
  document.querySelectorAll(".map-controls button").forEach((btn) => btn.classList.remove("active"));
  document.getElementById(`btn-${type}`)?.classList.add("active");
}

async function loadLandData(): Promise<void> {
  const res = await fetch("/api/lands");
  const data = (await res.json()) as LandFeatureCollection;
  originalData = data;
  applyFilters();
}

function applyFilters(): void {
  if (!originalData || !regionSearchInput) {
    return;
  }

  const rentOnlyFilter = document.getElementById("rent-only-filter") as HTMLInputElement | null;
  const minAreaInput = document.getElementById("min-area") as HTMLInputElement | null;
  const maxAreaInput = document.getElementById("max-area") as HTMLInputElement | null;

  const isRentOnly = Boolean(rentOnlyFilter?.checked);
  const searchTerm = regionSearchInput.value.trim();
  const minArea = Number.parseFloat(minAreaInput?.value || "") || 0;
  const maxArea = Number.parseFloat(maxAreaInput?.value || "") || Number.POSITIVE_INFINITY;

  const filteredFeatures = originalData.features.filter((feature) => {
    const p = feature.properties;
    const address = p.address || "";
    const area = p.area || 0;

    const matchRegion = searchTerm === "" || address.includes(searchTerm);
    const matchArea = area >= minArea && area <= maxArea;

    let matchRent = true;
    if (isRentOnly) {
      const isAdmRentable = (p.adm_property || "").toLowerCase() === "o";
      const isGenRentable = (p.gen_property || "").startsWith("대부");
      matchRent = isAdmRentable || isGenRentable;
    }

    return matchRegion && matchArea && matchRent;
  });

  updateMapAndList({ type: "FeatureCollection", features: filteredFeatures });
}

function updateMapAndList(data: LandFeatureCollection): void {
  if (!map) return;

  currentFeaturesData = data.features;
  currentIndex = -1;

  if (vectorLayer) map.removeLayer(vectorLayer);

  const vectorSource = new ol.source.Vector();
  const features = new ol.format.GeoJSON().readFeatures(data, { featureProjection: "EPSG:3857" });

  features.forEach((feature: any, idx: number) => {
    feature.setId(idx);
    vectorSource.addFeature(feature);
  });

  vectorLayer = new ol.layer.Vector({
    source: vectorSource,
    zIndex: 10,
    style: new ol.style.Style({
      stroke: new ol.style.Stroke({ color: "#ff3333", width: 3 }),
      fill: new ol.style.Fill({ color: "rgba(255, 51, 51, 0.2)" })
    })
  });
  map.addLayer(vectorLayer);

  const listArea = document.getElementById("list-container");
  if (!listArea) return;
  listArea.replaceChildren();

  if (!data.features.length) {
    const empty = document.createElement("p");
    empty.style.padding = "20px";
    empty.style.color = "red";
    empty.textContent = "결과 없음";
    listArea.appendChild(empty);
  }

  data.features.forEach((feature, idx) => {
    const item = document.createElement("div");
    item.className = "list-item";
    item.id = `item-${idx}`;

    const title = document.createElement("strong");
    title.textContent = feature.properties.address || "";

    const lineBreak = document.createElement("br");

    const desc = document.createElement("small");
    desc.textContent = `${feature.properties.land_type || ""} | ${feature.properties.area || ""}㎡`;

    item.appendChild(title);
    item.appendChild(lineBreak);
    item.appendChild(desc);
    item.addEventListener("click", () => selectItem(idx));
    listArea.appendChild(item);
  });

  if (data.features.length > 0) {
    map.getView().fit(vectorSource.getExtent(), { padding: [50, 50, 50, 50], duration: 1000 });
  }

  updateNavigationUI();
}

function selectItem(idx: number, shouldFit = true): void {
  if (!vectorLayer || idx < 0 || idx >= currentFeaturesData.length) return;

  currentIndex = idx;
  const feature = vectorLayer.getSource().getFeatureById(idx);

  if (feature) {
    const geometry = feature.getGeometry();
    const extent = geometry.getExtent();
    const center = ol.extent.getCenter(extent);

    if (shouldFit) {
      map.getView().fit(extent, {
        padding: [100, 100, 100, 100],
        duration: 800,
        maxZoom: 19
      });
    }

    showPopup(feature, center);
  }

  updateNavigationUI();

  const selectedEl = document.getElementById(`item-${idx}`);
  if (selectedEl) {
    selectedEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

function showPopup(feature: any, coordinate: any): void {
  if (!content || !overlay) return;
  const p = feature.getProperties();
  content.replaceChildren();

  const rows = [
    ["📍 주소", p.address],
    ["📏 면적", `${p.area}㎡`],
    ["📂 지목", p.land_type],
    ["📞 문의", p.contact]
  ];

  rows.forEach(([label, value]) => {
    const line = document.createElement("div");
    line.textContent = `${label}: ${value || ""}`;
    content?.appendChild(line);
  });

  overlay.setPosition(coordinate);
}

function navigateItem(direction: number): void {
  const nextIdx = currentIndex + direction;
  if (nextIdx >= 0 && nextIdx < currentFeaturesData.length) {
    selectItem(nextIdx);
  }
}

function updateNavigationUI(): void {
  const total = currentFeaturesData.length;
  const navInfo = document.getElementById("nav-info");
  const prevBtn = document.getElementById("prev-btn") as HTMLButtonElement | null;
  const nextBtn = document.getElementById("next-btn") as HTMLButtonElement | null;

  if (navInfo) {
    navInfo.innerText = total > 0 ? `${currentIndex + 1} / ${total}` : "0 / 0";
  }

  if (prevBtn) prevBtn.disabled = currentIndex <= 0;
  if (nextBtn) nextBtn.disabled = currentIndex >= total - 1 || total === 0;

  document.querySelectorAll(".list-item").forEach((item, idx) => {
    item.classList.toggle("selected", idx === currentIndex);
  });
}

function initBottomSheet(): void {
  if (!handle || !sidebar) return;

  handle.addEventListener("touchstart", (event: TouchEvent) => {
    startY = event.touches[0].clientY;
    startHeight = sidebar.offsetHeight;
    sidebar.style.transition = "none";
  });

  handle.addEventListener("touchmove", (event: TouchEvent) => {
    const touchY = event.touches[0].clientY;
    const deltaY = startY - touchY;
    const newHeight = startHeight + deltaY;

    if (newHeight > window.innerHeight * 0.12 && newHeight < window.innerHeight * 0.9) {
      sidebar.style.height = `${newHeight}px`;
    }
  });

  handle.addEventListener("touchend", () => {
    sidebar.style.transition = "height 0.3s ease-out";
    const currentRatio = sidebar.offsetHeight / window.innerHeight;
    if (currentRatio >= 0.6) {
      sidebar.style.height = `${snapHeights.expanded * 100}vh`;
    } else if (currentRatio <= 0.25) {
      sidebar.style.height = `${snapHeights.collapsed * 100}vh`;
    } else {
      sidebar.style.height = `${snapHeights.mid * 100}vh`;
    }
  });
}

async function bootstrap(): Promise<void> {
  regionSearchInput = document.getElementById("region-search") as HTMLInputElement | null;
  const popupElement = document.getElementById("popup");
  content = document.getElementById("popup-content");
  const closer = document.getElementById("popup-closer");

  if (!popupElement || !content) {
    return;
  }

  overlay = new ol.Overlay({ element: popupElement, autoPan: true, autoPanAnimation: { duration: 250 } });

  if (closer) {
    closer.addEventListener("click", (event) => {
      event.preventDefault();
      overlay.setPosition(undefined);
    });
  }

  document.getElementById("btn-search")?.addEventListener("click", applyFilters);
  const rentOnlyFilter = document.getElementById("rent-only-filter");
  rentOnlyFilter?.addEventListener("change", applyFilters);
  rentOnlyFilter?.addEventListener("click", applyFilters);
  document.getElementById("btn-Base")?.addEventListener("click", () => changeLayer("Base"));
  document.getElementById("btn-Satellite")?.addEventListener("click", () => changeLayer("Satellite"));
  document.getElementById("btn-Hybrid")?.addEventListener("click", () => changeLayer("Hybrid"));
  document.getElementById("prev-btn")?.addEventListener("click", () => navigateItem(-1));
  document.getElementById("next-btn")?.addEventListener("click", () => navigateItem(1));

  if (regionSearchInput) {
    regionSearchInput.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        applyFilters();
      }
    });
  }

  initBottomSheet();

  const configResponse = await fetch("/api/config");
  const config = (await configResponse.json()) as MapConfig;
  if (!config.center) {
    return;
  }

  initMap(config.vworldKey, config.center, config.zoom);
  await loadLandData();
}

document.addEventListener("DOMContentLoaded", () => {
  void bootstrap();
});
