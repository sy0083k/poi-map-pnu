import TileLayer from "ol/layer/Tile";
import type View from "ol/View";
import XYZ from "ol/source/XYZ";

import type { BaseType } from "./types";

const WMTS_LAYER_BY_BASE_TYPE: Record<BaseType, "Base" | "white" | "Satellite" | "Hybrid"> = {
  Base: "Base",
  White: "white",
  Satellite: "Satellite",
  Hybrid: "Hybrid"
};

const BASEMAP_MAX_ZOOM: Record<BaseType, number> = {
  Base: 19,
  White: 18,
  Satellite: 19,
  Hybrid: 19
};

type BasemapLayers = {
  baseLayer: TileLayer<XYZ>;
  whiteLayer: TileLayer<XYZ>;
  satLayer: TileLayer<XYZ>;
  hybLayer: TileLayer<XYZ>;
};

export function createBasemapLayers(vworldKey: string): BasemapLayers {
  const commonSource = (type: BaseType) => {
    const wmtsLayer = WMTS_LAYER_BY_BASE_TYPE[type];
    return new XYZ({
      url: `https://api.vworld.kr/req/wmts/1.0.0/${vworldKey}/${wmtsLayer}/{z}/{y}/{x}.${wmtsLayer === "Satellite" ? "jpeg" : "png"}`,
      crossOrigin: "anonymous"
    });
  };

  return {
    baseLayer: new TileLayer({ source: commonSource("Base"), visible: false, zIndex: 0 }),
    whiteLayer: new TileLayer({ source: commonSource("White"), visible: false, zIndex: 0 }),
    satLayer: new TileLayer({ source: commonSource("Satellite"), visible: true, zIndex: 0 }),
    hybLayer: new TileLayer({ source: commonSource("Hybrid"), visible: false, zIndex: 1 })
  };
}

export function applyBasemapType(layers: BasemapLayers, view: View, type: BaseType): void {
  const zoomLevel = view.getZoom();
  const maxZoomForType = BASEMAP_MAX_ZOOM[type];
  if (typeof zoomLevel === "number" && zoomLevel > maxZoomForType) {
    view.setZoom(maxZoomForType);
  }
  layers.baseLayer.setVisible(type === "Base");
  layers.whiteLayer.setVisible(type === "White");
  layers.satLayer.setVisible(type === "Satellite" || type === "Hybrid");
  layers.hybLayer.setVisible(type === "Hybrid");
}
