export type CadastralCrs = "EPSG:3857" | "EPSG:4326";

export type MapConfig = {
  vworldKey: string;
  center: [number, number];
  zoom: number;
  cadastralFgbUrl: string;
  cadastralPmtilesUrl: string;
  cadastralPnuField: string;
  cadastralCrs: CadastralCrs;
  cadastralMinRenderZoom: number;
};

export type LandFeatureProperties = {
  list_index?: number;
  id?: number;
  pnu?: string;
  address?: string;
  land_type?: string;
  area?: number;
  property_manager?: string;
  source_fields?: LandSourceField[];
  geom_status?: string;
};

export type LandFeature = {
  type: "Feature";
  geometry: unknown;
  properties: LandFeatureProperties;
};

export type LandListItem = {
  id: number;
  pnu: string;
  address: string;
  land_type: string;
  area: number;
  property_manager: string;
  sourceFields: LandSourceField[];
};

export type LandSourceField = {
  key: string;
  label: string;
  value: string;
};

export type LandListPageResponse = {
  items: LandListItem[];
  nextCursor: string | null;
};

export type LandFeatureCollection = {
  type: "FeatureCollection";
  features: LandFeature[];
};

export type LandsPageResponse = LandFeatureCollection & {
  nextCursor: string | null;
};

export type BaseType = "Base" | "White" | "Satellite" | "Hybrid";
export type ThemeType = "national_public" | "city_owned";
export type LandClickSource = "map_click" | "list_click" | "nav_prev" | "nav_next";

export type MapEventPayload =
  | {
      eventType: "search";
      anonId: string;
      minArea: number;
      searchTerm: string;
      rawSearchTerm: string;
      rawMinAreaInput: string;
      rawMaxAreaInput: string;
      rawRentOnly: string;
    }
  | {
      eventType: "land_click";
      anonId: string;
      landAddress: string;
      landId?: string;
      clickSource?: LandClickSource;
    };

export type WebVisitEventType = "visit_start" | "heartbeat" | "visit_end";

export type WebVisitEventPayload = {
  eventType: WebVisitEventType;
  anonId: string;
  sessionId: string;
  pagePath: string;
  pageQuery?: string;
  clientTs: number;
  clientTz: string;
  referrerUrl?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  clientLang?: string;
  platform?: string;
  screenWidth?: number;
  screenHeight?: number;
  viewportWidth?: number;
  viewportHeight?: number;
};
