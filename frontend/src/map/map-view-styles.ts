import Feature from "ol/Feature";
import type Geometry from "ol/geom/Geometry";
import Fill from "ol/style/Fill";
import Stroke from "ol/style/Stroke";
import Style from "ol/style/Style";

import type { LandFeatureProperties, ThemeType } from "./types";

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

export function createMapViewStyles(getTheme: () => ThemeType) {
  const defaultFeatureStyle = new Style({
    stroke: new Stroke({ color: "#ff3333", width: 3 }),
    fill: new Fill({ color: "rgba(255, 51, 51, 0.2)" })
  });
  const roadDeptFeatureStyle = new Style({
    stroke: new Stroke({ color: "#ff7f00", width: 3 }),
    fill: new Fill({ color: "rgba(255, 127, 0, 0.2)" })
  });
  const constructionDeptFeatureStyle = new Style({
    stroke: new Stroke({ color: "#377eb8", width: 3 }),
    fill: new Fill({ color: "rgba(55, 126, 184, 0.2)" })
  });
  const forestParkDeptFeatureStyle = new Style({
    stroke: new Stroke({ color: "#4daf4a", width: 3 }),
    fill: new Fill({ color: "rgba(77, 175, 74, 0.2)" })
  });
  const accountingDeptFeatureStyle = new Style({
    stroke: new Stroke({ color: "#e41a1c", width: 3 }),
    fill: new Fill({ color: "rgba(228, 26, 28, 0.2)" })
  });
  const fallbackFeatureStyle = new Style({
    stroke: new Stroke({ color: "#984ea3", width: 3 }),
    fill: new Fill({ color: "rgba(152, 78, 163, 0.2)" })
  });
  const selectedFeatureStyle = new Style({
    stroke: new Stroke({ color: "#ffd400", width: 4 }),
    fill: new Fill({ color: "rgba(255, 212, 0, 0.18)" })
  });

  const defaultStyleSelector = (feature: Feature<Geometry>): Style => {
    if (getTheme() !== "city_owned") {
      return defaultFeatureStyle;
    }
    const properties = feature.getProperties() as LandFeatureProperties;
    const manager = stringifyValue(properties.property_manager);
    if (manager === "도로과") {
      return roadDeptFeatureStyle;
    }
    if (manager === "건설과") {
      return constructionDeptFeatureStyle;
    }
    if (manager === "산림공원과") {
      return forestParkDeptFeatureStyle;
    }
    if (manager === "회계과") {
      return accountingDeptFeatureStyle;
    }
    return fallbackFeatureStyle;
  };

  return {
    defaultStyleSelector,
    selectedFeatureStyle
  };
}
