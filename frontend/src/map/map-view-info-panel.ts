import Feature from "ol/Feature";
import type Geometry from "ol/geom/Geometry";

import type { LandFeatureProperties, LandSourceField } from "./types";

type InfoPanelElements = {
  infoPanelElement: HTMLElement;
  infoPanelContent: HTMLElement;
};

function normalizeInline(value: string): string {
  return value.replace(/[\r\n\t]+/g, " ").trim();
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

function isLandSourceField(value: unknown): value is LandSourceField {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as { key?: unknown; label?: unknown; value?: unknown };
  return typeof candidate.key === "string" && typeof candidate.label === "string" && typeof candidate.value === "string";
}

export function createMapViewInfoPanel(elements: InfoPanelElements) {
  let isDismissedByUser = true;

  const show = (): void => {
    elements.infoPanelElement.classList.remove("is-hidden");
  };

  const resetScroll = (): void => {
    elements.infoPanelContent.scrollTop = 0;
  };

  const renderRows = (rows: LandSourceField[]): void => {
    elements.infoPanelContent.replaceChildren();

    if (rows.length === 0) {
      const empty = document.createElement("div");
      empty.className = "land-info-empty";
      empty.textContent = "표시할 상세 정보가 없습니다.";
      elements.infoPanelContent.appendChild(empty);
      return;
    }

    rows.forEach((row) => {
      const keyCell = document.createElement("div");
      keyCell.className = "land-info-key";
      keyCell.textContent = normalizeInline(row.label);

      const valueCell = document.createElement("div");
      valueCell.className = "land-info-val";
      valueCell.textContent = normalizeInline(row.value);

      elements.infoPanelContent.append(keyCell, valueCell);
    });
  };

  const dismiss = (): void => {
    isDismissedByUser = true;
    elements.infoPanelElement.classList.add("is-hidden");
  };

  const clear = (): void => {
    elements.infoPanelContent.replaceChildren();
    const empty = document.createElement("div");
    empty.className = "land-info-empty";
    empty.textContent = "토지를 선택하면 상세 정보가 표시됩니다.";
    elements.infoPanelContent.appendChild(empty);
    resetScroll();
    elements.infoPanelElement.classList.remove("has-selection");
    if (!isDismissedByUser) {
      show();
    }
  };

  const renderProperties = (props: LandFeatureProperties): void => {
    const fields = Array.isArray(props.source_fields)
      ? props.source_fields.filter((item) => isLandSourceField(item))
      : [];

    const fallback: LandSourceField[] = [
      { key: "pnu", label: "PNU", value: stringifyValue(props.pnu) },
      { key: "address", label: "주소", value: stringifyValue(props.address) },
      { key: "area", label: "면적", value: props.area ? `${props.area}㎡` : "" },
      { key: "land_type", label: "지목", value: stringifyValue(props.land_type) },
      { key: "property_manager", label: "재산관리관", value: stringifyValue(props.property_manager) }
    ].filter((item) => item.value !== "");

    renderRows(fields.length > 0 ? fields : fallback);
    resetScroll();
    isDismissedByUser = false;
    show();
    elements.infoPanelElement.classList.add("has-selection");
  };

  const renderFeatureInfo = (feature: Feature<Geometry>): void => {
    renderProperties(feature.getProperties() as LandFeatureProperties);
  };

  return {
    clear,
    dismiss,
    renderFeatureInfo,
    renderProperties
  };
}
