import Feature from "ol/Feature";
import GeoJSON from "ol/format/GeoJSON";
import type Geometry from "ol/geom/Geometry";
import { getCenter } from "ol/extent";
import type OlMap from "ol/Map";
import type VectorSource from "ol/source/Vector";

import { loadUploadedHighlights } from "./cadastral-fgb-layer";
import { loadPersistedFile2MapUpload } from "./local-upload";
import { buildLandFallbackRows, normalizeInline } from "./photo-mode-helpers";

import type { LandFeatureCollection, LandListItem, LandSourceField, MapConfig } from "./types";

type Deps = {
  map: OlMap;
  config: MapConfig;
  setMapStatus: (message: string, color?: string) => void;
  landSource: VectorSource<Feature<Geometry>>;
  selectedLandSource: VectorSource<Feature<Geometry>>;
  landInfoPanel: HTMLElement | null;
  landInfoContent: HTMLElement | null;
};

export function createPhotoModeLandController(deps: Deps) {
  const landItemsByIndex = new globalThis.Map<number, LandListItem>();
  const landFeatureByIndex = new globalThis.Map<number, Feature<Geometry>>();

  const hideLandInfoPanel = (): void => {
    if (!(deps.landInfoPanel instanceof HTMLElement)) {
      return;
    }
    deps.landInfoPanel.classList.add("is-hidden");
    deps.landInfoPanel.classList.remove("has-selection");
  };

  const showLandInfoPanel = (): void => {
    if (!(deps.landInfoPanel instanceof HTMLElement)) {
      return;
    }
    deps.landInfoPanel.classList.remove("is-hidden");
    deps.landInfoPanel.classList.add("has-selection");
  };

  const renderLandInfoRows = (rows: LandSourceField[]): void => {
    const content = deps.landInfoContent;
    if (!(content instanceof HTMLElement)) {
      return;
    }
    content.replaceChildren();
    content.scrollTop = 0;
    if (rows.length === 0) {
      const empty = document.createElement("div");
      empty.className = "land-info-empty";
      empty.textContent = "표시할 상세 정보가 없습니다.";
      content.appendChild(empty);
      return;
    }
    rows.forEach((row) => {
      const keyCell = document.createElement("div");
      keyCell.className = "land-info-key";
      keyCell.textContent = normalizeInline(row.label);
      const valueCell = document.createElement("div");
      valueCell.className = "land-info-val";
      valueCell.textContent = normalizeInline(row.value);
      content.append(keyCell, valueCell);
    });
  };

  const clearSelectedLand = (): void => {
    deps.selectedLandSource.clear();
    hideLandInfoPanel();
  };

  const selectLandByIndex = (index: number, shouldMoveMap: boolean): void => {
    const landItem = landItemsByIndex.get(index);
    const landFeature = landFeatureByIndex.get(index);
    if (!landItem || !landFeature) {
      return;
    }
    deps.selectedLandSource.clear();
    deps.selectedLandSource.addFeature(landFeature.clone());
    const rows = landItem.sourceFields.length > 0 ? landItem.sourceFields : buildLandFallbackRows(landItem);
    renderLandInfoRows(rows);
    showLandInfoPanel();

    if (shouldMoveMap) {
      const geometry = landFeature.getGeometry();
      if (geometry) {
        deps.map.getView().animate({ center: getCenter(geometry.getExtent()), duration: 250 });
      }
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
      deps.setMapStatus(`업로드 토지 하이라이트를 준비하는 중입니다... (${uploadedPnus.length}건)`, "#1d4ed8");
      const loaded = await loadUploadedHighlights({
        fgbUrl: deps.config.cadastralFgbUrl,
        pnuField: deps.config.cadastralPnuField,
        cadastralCrs: deps.config.cadastralCrs,
        uploadedPnus,
        theme: "national_public",
        onProgress: (progress) => {
          if (!progress.done) {
            deps.setMapStatus(
              `업로드 토지 하이라이트 매칭 ${progress.matched}/${progress.total}건 (스캔 ${progress.scanned.toLocaleString()}건)`,
              "#166534"
            );
          }
        }
      });

      const geometryByPnu = new Map<string, unknown>();
      loaded.collection.features.forEach((feature) => {
        const pnu = String(feature.properties.pnu || "").replace(/\D/g, "");
        if (pnu) {
          geometryByPnu.set(pnu, feature.geometry);
        }
      });

      const listLinkedFeatures: LandFeatureCollection = {
        type: "FeatureCollection",
        features: items.flatMap((item, index) => {
          const geometry = geometryByPnu.get(item.pnu);
          return geometry
            ? [{
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
              }]
            : [];
        })
      };

      const features = new GeoJSON().readFeatures(listLinkedFeatures, {
        dataProjection: deps.config.cadastralCrs,
        featureProjection: "EPSG:3857"
      }) as Feature<Geometry>[];

      deps.landSource.clear();
      landItemsByIndex.clear();
      landFeatureByIndex.clear();
      features.forEach((feature, fallbackIndex) => {
        const props = feature.getProperties() as { list_index?: unknown };
        const index = typeof props.list_index === "number" ? props.list_index : fallbackIndex;
        feature.setId(index);
        landFeatureByIndex.set(index, feature);
        const item = items[index];
        if (item) {
          landItemsByIndex.set(index, item);
        }
      });
      deps.landSource.addFeatures(features);
      if (features.length > 0) {
        deps.setMapStatus(`업로드 토지 하이라이트 ${features.length}건을 표시했습니다.`, "#166534");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "업로드 토지 하이라이트를 불러오지 못했습니다.";
      deps.setMapStatus(`업로드 토지 하이라이트 로드 실패: ${message}`, "#b45309");
    }
  };

  return {
    clearSelectedLand,
    loadFile2MapLandHighlights,
    selectLandByIndex
  };
}
