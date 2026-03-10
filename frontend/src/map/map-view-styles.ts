import Feature from "ol/Feature";
import type Geometry from "ol/geom/Geometry";
import Fill from "ol/style/Fill";
import Stroke from "ol/style/Stroke";
import Style from "ol/style/Style";
import type { FlatStyleLike } from "ol/style/flat";

import type { LandFeatureProperties, ThemeType } from "./types";

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

export function createMapViewStyles(getTheme: () => ThemeType) {
  const selectionPulsePeriodMs = 1400;
  const selectionPulseMinWidth = 4;
  const selectionPulseMaxWidth = 8;
  const selectionPulseMinAlpha = 0.2;
  const selectionPulseMaxAlpha = 0.7;

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
  const selectedHaloStyle = new Style({
    stroke: new Stroke({ color: "rgba(255, 255, 255, 0.95)", width: 8 }),
    fill: new Fill({ color: "rgba(0, 0, 0, 0)" })
  });
  const selectedRoadBaseStyle = new Style({
    stroke: new Stroke({ color: "#ff7f00", width: 4 }),
    fill: new Fill({ color: "rgba(255, 127, 0, 0.2)" })
  });
  const selectedConstructionBaseStyle = new Style({
    stroke: new Stroke({ color: "#377eb8", width: 4 }),
    fill: new Fill({ color: "rgba(55, 126, 184, 0.2)" })
  });
  const selectedForestParkBaseStyle = new Style({
    stroke: new Stroke({ color: "#4daf4a", width: 4 }),
    fill: new Fill({ color: "rgba(77, 175, 74, 0.2)" })
  });
  const selectedAccountingBaseStyle = new Style({
    stroke: new Stroke({ color: "#e41a1c", width: 4 }),
    fill: new Fill({ color: "rgba(228, 26, 28, 0.2)" })
  });
  const selectedFallbackBaseStyle = new Style({
    stroke: new Stroke({ color: "#984ea3", width: 4 }),
    fill: new Fill({ color: "rgba(152, 78, 163, 0.2)" })
  });
  const selectedRoadPulseStroke = new Stroke({ color: "rgba(255, 127, 0, 0.4)", width: selectionPulseMinWidth });
  const selectedConstructionPulseStroke = new Stroke({ color: "rgba(55, 126, 184, 0.4)", width: selectionPulseMinWidth });
  const selectedForestParkPulseStroke = new Stroke({ color: "rgba(77, 175, 74, 0.4)", width: selectionPulseMinWidth });
  const selectedAccountingPulseStroke = new Stroke({ color: "rgba(228, 26, 28, 0.4)", width: selectionPulseMinWidth });
  const selectedFallbackPulseStroke = new Stroke({ color: "rgba(152, 78, 163, 0.4)", width: selectionPulseMinWidth });
  const selectedRoadPulseStyle = new Style({
    stroke: selectedRoadPulseStroke,
    fill: new Fill({ color: "rgba(0, 0, 0, 0)" })
  });
  const selectedConstructionPulseStyle = new Style({
    stroke: selectedConstructionPulseStroke,
    fill: new Fill({ color: "rgba(0, 0, 0, 0)" })
  });
  const selectedForestParkPulseStyle = new Style({
    stroke: selectedForestParkPulseStroke,
    fill: new Fill({ color: "rgba(0, 0, 0, 0)" })
  });
  const selectedAccountingPulseStyle = new Style({
    stroke: selectedAccountingPulseStroke,
    fill: new Fill({ color: "rgba(0, 0, 0, 0)" })
  });
  const selectedFallbackPulseStyle = new Style({
    stroke: selectedFallbackPulseStroke,
    fill: new Fill({ color: "rgba(0, 0, 0, 0)" })
  });

  const cityOwnedSelectedStyleSetByManager: {
    road: Style[];
    construction: Style[];
    forestPark: Style[];
    accounting: Style[];
    fallback: Style[];
  } = {
    road: [selectedHaloStyle, selectedRoadBaseStyle, selectedRoadPulseStyle],
    construction: [selectedHaloStyle, selectedConstructionBaseStyle, selectedConstructionPulseStyle],
    forestPark: [selectedHaloStyle, selectedForestParkBaseStyle, selectedForestParkPulseStyle],
    accounting: [selectedHaloStyle, selectedAccountingBaseStyle, selectedAccountingPulseStyle],
    fallback: [selectedHaloStyle, selectedFallbackBaseStyle, selectedFallbackPulseStyle]
  };

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

  const selectedStyleSelector = (feature: Feature<Geometry>): Style | Style[] => {
    if (getTheme() !== "city_owned") {
      return selectedFeatureStyle;
    }

    const progress = ((Date.now() % selectionPulsePeriodMs) / selectionPulsePeriodMs) * Math.PI * 2;
    const eased = (Math.sin(progress) + 1) / 2;
    const pulseAlpha = selectionPulseMinAlpha + (selectionPulseMaxAlpha - selectionPulseMinAlpha) * eased;
    const pulseWidth = selectionPulseMinWidth + (selectionPulseMaxWidth - selectionPulseMinWidth) * eased;

    selectedRoadPulseStroke.setColor(`rgba(255, 127, 0, ${pulseAlpha})`);
    selectedRoadPulseStroke.setWidth(pulseWidth);
    selectedConstructionPulseStroke.setColor(`rgba(55, 126, 184, ${pulseAlpha})`);
    selectedConstructionPulseStroke.setWidth(pulseWidth);
    selectedForestParkPulseStroke.setColor(`rgba(77, 175, 74, ${pulseAlpha})`);
    selectedForestParkPulseStroke.setWidth(pulseWidth);
    selectedAccountingPulseStroke.setColor(`rgba(228, 26, 28, ${pulseAlpha})`);
    selectedAccountingPulseStroke.setWidth(pulseWidth);
    selectedFallbackPulseStroke.setColor(`rgba(152, 78, 163, ${pulseAlpha})`);
    selectedFallbackPulseStroke.setWidth(pulseWidth);

    const properties = feature.getProperties() as LandFeatureProperties;
    const manager = stringifyValue(properties.property_manager);
    if (manager === "도로과") {
      return cityOwnedSelectedStyleSetByManager.road;
    }
    if (manager === "건설과") {
      return cityOwnedSelectedStyleSetByManager.construction;
    }
    if (manager === "산림공원과") {
      return cityOwnedSelectedStyleSetByManager.forestPark;
    }
    if (manager === "회계과") {
      return cityOwnedSelectedStyleSetByManager.accounting;
    }
    return cityOwnedSelectedStyleSetByManager.fallback;
  };

  return {
    defaultStyleSelector,
    selectedStyleSelector,
    webglBaseStyle
  };
}
  const webglBaseStyle: FlatStyleLike = [
    {
      filter: ["==", ["get", "property_manager"], "도로과"],
      style: {
        "stroke-color": "#ff7f00",
        "stroke-width": 3,
        "fill-color": "rgba(255, 127, 0, 0.2)"
      }
    },
    {
      filter: ["==", ["get", "property_manager"], "건설과"],
      style: {
        "stroke-color": "#377eb8",
        "stroke-width": 3,
        "fill-color": "rgba(55, 126, 184, 0.2)"
      }
    },
    {
      filter: ["==", ["get", "property_manager"], "산림공원과"],
      style: {
        "stroke-color": "#4daf4a",
        "stroke-width": 3,
        "fill-color": "rgba(77, 175, 74, 0.2)"
      }
    },
    {
      filter: ["==", ["get", "property_manager"], "회계과"],
      style: {
        "stroke-color": "#e41a1c",
        "stroke-width": 3,
        "fill-color": "rgba(228, 26, 28, 0.2)"
      }
    },
    {
      filter: ["!=", ["get", "property_manager"], ""],
      style: {
        "stroke-color": "#984ea3",
        "stroke-width": 3,
        "fill-color": "rgba(152, 78, 163, 0.2)"
      }
    },
    {
      else: true,
      style: {
        "stroke-color": "#ff3333",
        "stroke-width": 3,
        "fill-color": "rgba(255, 51, 51, 0.2)"
      }
    }
  ];
