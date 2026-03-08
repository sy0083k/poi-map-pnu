import CircleStyle from "ol/style/Circle";
import Fill from "ol/style/Fill";
import Stroke from "ol/style/Stroke";
import Style from "ol/style/Style";

export const markerStyle = new Style({
  image: new CircleStyle({
    radius: 6,
    fill: new Fill({ color: "rgba(239, 68, 68, 0.9)" }),
    stroke: new Stroke({ color: "#fff", width: 2 })
  })
});

export const selectedMarkerStyle = new Style({
  image: new CircleStyle({
    radius: 8,
    fill: new Fill({ color: "rgba(250, 204, 21, 0.95)" }),
    stroke: new Stroke({ color: "#b45309", width: 2.5 })
  })
});

export const landFeatureStyle = new Style({
  stroke: new Stroke({ color: "#ff3333", width: 3 }),
  fill: new Fill({ color: "rgba(255, 51, 51, 0.2)" })
});

export const selectedLandFeatureStyle = new Style({
  stroke: new Stroke({ color: "#ffd400", width: 4 }),
  fill: new Fill({ color: "rgba(255, 212, 0, 0.18)" })
});
