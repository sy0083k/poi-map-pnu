import { loadUploadedHighlights } from "./cadastral-fgb-layer";

import type { LandFeatureCollection, LandListItem, MapConfig, ThemeType } from "./types";

type HighlightDeps = {
  getConfig: () => MapConfig | null;
  getCurrentTheme: () => ThemeType;
  getCurrentItems: () => LandListItem[];
  getUploadedHighlightFeatures: () => LandFeatureCollection;
  setUploadedHighlightFeatures: (value: LandFeatureCollection) => void;
  getUploadedHighlightsRequestSeq: () => number;
  setUploadedHighlightsRequestSeq: (value: number) => void;
  getHighlightLoadAbortController: () => AbortController | null;
  setHighlightLoadAbortController: (value: AbortController | null) => void;
  mapView: {
    renderFeatures: (data: LandFeatureCollection, options: { dataProjection: MapConfig["cadastralCrs"] }) => number;
    getCurrentExtent: () => number[] | null;
  };
  setMapStatus: (message: string, color?: string) => void;
  getThemeLabel: (theme: ThemeType) => string;
  updateNavigation: () => void;
};

export async function reloadCadastralLayers(deps: HighlightDeps): Promise<void> {
  const config = deps.getConfig();
  if (!config) {
    return;
  }

  const currentItems = deps.getCurrentItems();
  const featuresByPnu = new Map<string, unknown>();
  deps.getUploadedHighlightFeatures().features.forEach((feature) => {
    const pnu = String(feature.properties.pnu || "");
    if (pnu) {
      featuresByPnu.set(pnu, feature.geometry);
    }
  });

  const withProperties: LandFeatureCollection = {
    type: "FeatureCollection",
    features: currentItems.flatMap((item, idx) => {
      const geometry = featuresByPnu.get(item.pnu);
      if (!geometry) {
        return [];
      }
      return [{ type: "Feature" as const, geometry, properties: { list_index: idx, id: item.id, pnu: item.pnu, address: item.address, land_type: item.land_type, area: item.area, property_manager: item.property_manager, source_fields: item.sourceFields ?? [] } }];
    })
  };

  deps.mapView.renderFeatures(withProperties, { dataProjection: config.cadastralCrs });
  if (currentItems.length === 0) {
    deps.setMapStatus(`업로드 하이라이트 ${deps.getUploadedHighlightFeatures().features.length}건 준비됨`, "#166534");
  } else {
    deps.setMapStatus(`업로드 하이라이트 ${deps.getUploadedHighlightFeatures().features.length}건, ${deps.getThemeLabel(deps.getCurrentTheme())} 강조 ${withProperties.features.length}건`, "#166534");
  }
  deps.updateNavigation();
}

export async function prepareUploadedHighlights(deps: HighlightDeps, items: LandListItem[]): Promise<void> {
  const config = deps.getConfig();
  if (!config) {
    return;
  }

  deps.getHighlightLoadAbortController()?.abort();
  const uploadedPnus = Array.from(new Set(items.map((item) => item.pnu)));
  if (uploadedPnus.length === 0) {
    deps.setUploadedHighlightFeatures({ type: "FeatureCollection", features: [] });
    return;
  }

  const seq = deps.getUploadedHighlightsRequestSeq() + 1;
  deps.setUploadedHighlightsRequestSeq(seq);
  const controller = new AbortController();
  deps.setHighlightLoadAbortController(controller);
  let firstVisibleApplied = false;

  try {
    deps.setMapStatus("업로드 하이라이트를 준비하는 중입니다...");
    const loaded = await loadUploadedHighlights({
      fgbUrl: config.cadastralFgbUrl,
      pnuField: config.cadastralPnuField,
      cadastralCrs: config.cadastralCrs,
      uploadedPnus,
      theme: deps.getCurrentTheme(),
      signal: controller.signal,
      onFeatures: (features, progress) => {
        if (seq !== deps.getUploadedHighlightsRequestSeq() || features.length === 0) {
          return;
        }
        deps.setUploadedHighlightFeatures({
          type: "FeatureCollection",
          features: [...deps.getUploadedHighlightFeatures().features, ...features]
        });
        if (!firstVisibleApplied) {
          firstVisibleApplied = true;
          void reloadCadastralLayers(deps);
        }
        deps.setMapStatus(progress.fromCache ? `하이라이트 캐시 ${progress.matched}건 적용` : `하이라이트 매칭 ${progress.matched}/${progress.total}건 (스캔 ${progress.scanned.toLocaleString()}건)`, "#166534");
      },
      onProgress: (progress) => {
        if (seq === deps.getUploadedHighlightsRequestSeq() && !progress.done) {
          deps.setMapStatus(`하이라이트 매칭 ${progress.matched}/${progress.total}건 (스캔 ${progress.scanned.toLocaleString()}건)`, "#166534");
        }
      }
    });

    if (seq !== deps.getUploadedHighlightsRequestSeq()) {
      return;
    }
    deps.setUploadedHighlightFeatures(loaded);
    await reloadCadastralLayers(deps);
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError")) {
      const message = error instanceof Error ? `업로드 하이라이트 준비 실패: ${error.message}` : "업로드 하이라이트 준비에 실패했습니다.";
      console.warn("[cadastral]", message);
      deps.setMapStatus(message, "#b45309");
    }
  } finally {
    if (deps.getHighlightLoadAbortController() === controller) {
      deps.setHighlightLoadAbortController(null);
    }
  }
}

export function hasMultipleManagers(items: LandListItem[]): string[] {
  return Array.from(new Set(items.map((item) => (item.property_manager || "").trim()).filter((value) => value !== "")));
}
