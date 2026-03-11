from pathlib import Path

from tests.helpers import assert_contains_all, assert_not_contains_all


def test_topbar_and_filter_css_contract() -> None:
    css_text = Path("static/css/style.css").read_text(encoding="utf-8")
    assert_contains_all(
        css_text,
        [
            "--topbar-menu-anchor-x: var(--sidebar-width);",
            "left: var(--topbar-menu-anchor-x);",
            'content: "<";',
            'content: ">";',
            '#sidebar-handle[aria-expanded="false"]::after',
            ".compact-filter-row {",
            "display: grid;",
            "grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);",
            "--filter-input-height: 33px;",
            "--filter-control-height: var(--filter-input-height);",
            "--filter-col-gap: 8px;",
            "--filter-row-gap: 10px;",
            ".filter-control {",
            "height: var(--filter-control-height);",
            ".filter-control:focus-visible {",
            ".area-input-container {",
            "grid-template-columns: minmax(0, 1fr) 14px minmax(0, 1fr);",
            "body.file2map-mode #file2map-upload-panel",
            "body.file2map-mode #desktop-property-usage-group",
        ],
    )
    assert_contains_all(css_text, ["--map-overlay-right-offset: 20px;", "--map-overlay-right-offset: 12px;"])


def test_overlay_css_contract() -> None:
    css_text = Path("static/css/style.css").read_text(encoding="utf-8")
    assert_contains_all(
        css_text,
        [
            "#map-legend {",
            "right: var(--map-overlay-right-offset);",
            ".map-legend-swatch-road {",
            ".map-legend-swatch-accounting {",
            "#land-info-panel {",
            "body.photo-panel-open #map-legend {",
            ".map-legend-close {",
            ".map-legend-close:focus-visible {",
            "bottom: calc(50vh + 12px);",
            "#photo-load-btn {",
            "#photo-clear-btn { background: linear-gradient(180deg, #6f879c 0%, #596f82 100%); }",
            ".sidebar-empty-message {",
        ],
    )


def test_map_navigation_contract_by_module_boundaries() -> None:
    map_ts = Path("frontend/src/map.ts").read_text(encoding="utf-8")
    events_ts = Path("frontend/src/map/land-map-events.ts").read_text(encoding="utf-8")
    init_ts = Path("frontend/src/map/land-map-init.ts").read_text(encoding="utf-8")
    ui_ts = Path("frontend/src/map/land-map-ui.ts").read_text(encoding="utf-8")
    workflow_ts = Path("frontend/src/map/land-workflow.ts").read_text(encoding="utf-8")
    workflow_download_ts = Path("frontend/src/map/land-workflow-download.ts").read_text(encoding="utf-8")
    theme_routing_ts = Path("frontend/src/map/theme-routing.ts").read_text(encoding="utf-8")
    topbar_menu_ts = Path("frontend/src/map/topbar-menu.ts").read_text(encoding="utf-8")

    moveend_anchor = "mapView.setMoveEndHandler(() => {"
    assert moveend_anchor in events_ts
    moveend_block = events_ts.split(moveend_anchor, maxsplit=1)[1].split("});", maxsplit=1)[0]
    assert "void reloadCadastralLayers();" not in moveend_block

    viewport_anchor = "const loadViewportContext = async (options?: {"
    assert viewport_anchor in workflow_ts
    viewport_block = workflow_ts.split(viewport_anchor, maxsplit=1)[1].split("const loadMoreCurrentQuery", maxsplit=1)[0]
    assert "deps.mapView.clearInfoPanel();" not in viewport_block

    assert_contains_all(
        map_ts,
        [
            'state.setCurrentTheme(theme);',
            "applyThemeUiState(theme);",
            "applyLegendUiState(theme);",
            'if (state.getCurrentTheme() !== "city_owned" && theme === "city_owned") {',
            'dom.mapLegendCloseButton?.addEventListener("click", () => {',
            "legendController.dismissLegend();",
            "pushThemeHistory(theme);",
            'layerType === "White"',
        ],
    )
    assert "clearPropertyManagerInputs();" not in map_ts

    assert_contains_all(
        ui_ts,
        [
            "let isLegendDismissedByUser = false;",
            "isLegendDismissedByUser = false;",
            "isLegendDismissedByUser = true;",
        ],
    )
    assert_contains_all(events_ts, ["void deps.workflow.loadThemeData(nextTheme);", "applyLegendUiState(nextTheme);"])
    assert_contains_all(
        init_ts,
        [
            "await deps.mapView.loadDebugProbe(config, deps.setMapStatus);",
            "await deps.workflow.loadThemeData(deps.state.getCurrentTheme());",
            "applyLegendUiState(initialTheme);",
        ],
    )

    workflow_contract_text = "\n".join([workflow_ts, workflow_download_ts])
    assert_contains_all(
        workflow_contract_text,
        [
            "재산관리관 다중 검출:",
            "정확한 재산관리관을 입력하세요.",
            "deps.mapView.clearRenderedFeatures();",
            "downloadClient.downloadSearchResultFile({",
            'currentListMode === "search"',
            "handleMoveEnd",
        ],
    )

    assert_contains_all(theme_routing_ts, ['const THEME_PATHS: Record<ThemeType, string> = {', 'national_public: "/file2map"', 'city_owned: "/siyu"'])
    assert_not_contains_all(
        topbar_menu_ts,
        [
            'fileMapLink.classList.toggle("is-active", theme === "national_public")',
            "item.dataset.linkTheme === theme",
            'document.querySelectorAll<HTMLButtonElement>(".menu-item[data-menu-link]")',
            "window.location.assign(target);",
        ],
    )
    assert 'rawBasemap !== "Base"' in topbar_menu_ts


def test_lands_list_client_sends_theme_query() -> None:
    client_ts = Path("frontend/src/map/lands-list-client.ts").read_text(encoding="utf-8")
    workflow_ts = Path("frontend/src/map/land-workflow.ts").read_text(encoding="utf-8")
    types_ts = Path("frontend/src/map/types.ts").read_text(encoding="utf-8")
    panel_ts = Path("frontend/src/map/list-panel.ts").read_text(encoding="utf-8")
    assert "export async function loadAllLandListItems(theme: ThemeType, filters?: FilterValues)" in client_ts
    assert "export async function loadFirstLandListPage(" in client_ts
    assert "export async function loadNextLandListPage(" in client_ts
    assert 'const query = new URLSearchParams({ limit: "500", theme: params.theme });' in client_ts
    assert 'query.set("propertyUsage", filters.propertyUsageTerm);' in client_ts
    assert 'query.set("bbox", params.bbox.join(","));' in client_ts
    assert "totalCount: number;" in types_ts
    assert "let currentListTotalCount = 0;" in workflow_ts
    assert "currentListTotalCount = page.totalCount;" in workflow_ts
    assert "deps.listPanel.updateNavigation(" in workflow_ts
    assert "elements.navInfo.innerText = totalCount > 0 && currentIndex >= 0 ? `${currentIndex + 1} / ${totalCount}` : `0 / ${totalCount}`;" in panel_ts
    assert 'const getViewportBboxCrs = (): "EPSG:3857" | "EPSG:4326" =>' in workflow_ts
    assert 'deps.mapView.getEngine() === "maplibre" ? "EPSG:4326" : (config?.cadastralCrs ?? "EPSG:4326");' in workflow_ts


def test_select_highlight_render_contract() -> None:
    map_view_ts = Path("frontend/src/map/map-view.ts").read_text(encoding="utf-8")
    map_view_styles_ts = Path("frontend/src/map/map-view-styles.ts").read_text(encoding="utf-8")
    map_view_info_panel_ts = Path("frontend/src/map/map-view-info-panel.ts").read_text(encoding="utf-8")
    map_view_feature_layers_ts = Path("frontend/src/map/map-view-feature-layers.ts").read_text(encoding="utf-8")
    map_view_basemap_ts = Path("frontend/src/map/map-view-basemap.ts").read_text(encoding="utf-8")
    map_view_contract_text = "\n".join(
        [
            map_view_ts,
            map_view_styles_ts,
            map_view_info_panel_ts,
            map_view_feature_layers_ts,
            map_view_basemap_ts,
        ]
    )
    assert_contains_all(
        map_view_contract_text,
        [
            "applyFeatureDiff",
            "selectFeatureId(selectedPnu);",
            "map.renderSync();",
            "window.requestAnimationFrame(() => {",
            'White: "white"',
            "White: 18",
            'stroke: new Stroke({ color: "#ff7f00", width: 3 })',
            'fill: new Fill({ color: "rgba(255, 127, 0, 0.2)" })',
            'stroke: new Stroke({ color: "#377eb8", width: 3 })',
            'fill: new Fill({ color: "rgba(55, 126, 184, 0.2)" })',
            'stroke: new Stroke({ color: "#4daf4a", width: 3 })',
            'fill: new Fill({ color: "rgba(77, 175, 74, 0.2)" })',
            'stroke: new Stroke({ color: "#e41a1c", width: 3 })',
            'fill: new Fill({ color: "rgba(228, 26, 28, 0.2)" })',
            'stroke: new Stroke({ color: "#984ea3", width: 3 })',
            'fill: new Fill({ color: "rgba(152, 78, 163, 0.2)" })',
            'if (manager === "도로과") {',
            'if (manager === "건설과") {',
            'if (manager === "산림공원과") {',
            'if (manager === "회계과") {',
            "return fallbackFeatureStyle;",
            "const resetScroll = (): void => {",
            "elements.infoPanelContent.scrollTop = 0;",
            "resetScroll();",
        ],
    )


def test_select_highlight_theme_sync_contract() -> None:
    map_ts = Path("frontend/src/map.ts").read_text(encoding="utf-8")
    events_ts = Path("frontend/src/map/land-map-events.ts").read_text(encoding="utf-8")
    init_ts = Path("frontend/src/map/land-map-init.ts").read_text(encoding="utf-8")
    assert "activeMapView.setTheme(theme);" in map_ts
    assert "deps.mapView.setTheme(nextTheme);" in events_ts
    assert "deps.mapView.setTheme(initialTheme);" in init_ts


def test_visible_first_highlight_preserves_original_list_indexes_contract() -> None:
    rendered_records_ts = Path("frontend/src/map/rendered-land-records.ts").read_text(encoding="utf-8")
    highlight_ts = Path("frontend/src/map/land-workflow-highlight.ts").read_text(encoding="utf-8")

    assert_contains_all(
        rendered_records_ts,
        [
            "listIndexByPnu?: Map<string, number>",
            "const listIndex = listIndexByPnu?.get(normalizedPnu) ?? index;",
            "list_index: listIndex,",
        ],
    )
    assert_contains_all(
        highlight_ts,
        [
            "function buildListIndexByPnu(items: LandListItem[]): Map<string, number> {",
            "const listIndexByPnu = buildListIndexByPnu(currentItems);",
            "createRenderedLandRecordMap(priorityItems, featuresByPnu, listIndexByPnu)",
            "createRenderedLandRecordMap(remainderChunk, featuresByPnu, listIndexByPnu)",
        ],
    )


def test_siyu_maplibre_route_split_contract() -> None:
    map_ts = Path("frontend/src/map.ts").read_text(encoding="utf-8")
    cache_ts = Path("frontend/src/map/cadastral-fgb-cache.ts").read_text(encoding="utf-8")
    coordinate_transform_ts = Path("frontend/src/map/coordinate-transform.ts").read_text(encoding="utf-8")
    layer_ts = Path("frontend/src/map/cadastral-fgb-layer.ts").read_text(encoding="utf-8")
    workflow_ts = Path("frontend/src/map/land-workflow.ts").read_text(encoding="utf-8")
    highlight_ts = Path("frontend/src/map/land-workflow-highlight.ts").read_text(encoding="utf-8")
    maplibre_view_ts = Path("frontend/src/map/map-view-maplibre.ts").read_text(encoding="utf-8")

    assert_contains_all(
        map_ts,
        [
            'import "maplibre-gl/dist/maplibre-gl.css";',
            'import { createMapLibreMapView } from "./map/map-view-maplibre";',
            'const activeMapView = window.location.pathname === "/siyu"',
            "window.location.assign(targetPath);",
        ],
    )
    assert_contains_all(
        maplibre_view_ts,
        [
            'import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from "maplibre-gl";',
            "attributionControl: false",
            "LAND_SOURCE_ID = \"lands-source\"",
            'const LAND_SELECTED_HALO_LAYER_ID = "parcels-selected-halo";',
            'const LAND_SELECTED_PULSE_LAYER_ID = "parcels-selected-pulse";',
            'const DEBUG_PROBE_SOURCE_ID = "debug-fgb-probe-source";',
            'const DEBUG_PROBE_FILL_LAYER_ID = "debug-fgb-probe-fill";',
            'const DEBUG_PROBE_LINE_LAYER_ID = "debug-fgb-probe-line";',
            'const reducedMotionMedia = window.matchMedia("(prefers-reduced-motion: reduce)");',
            "selectionPulseAnimationFrameId = window.requestAnimationFrame(animateSelectionPulse);",
            "getEngine: (): \"maplibre\" => \"maplibre\"",
            "map.queryRenderedFeatures(event.point",
            'new URLSearchParams(window.location.search).get("debugMap") === "1"',
            'new URLSearchParams(window.location.search).get("debugFgb") === "1"',
            'new URLSearchParams(window.location.search).get("debugRecenter") === "1"',
            "target.__map = map;",
            "target.__mapDebug = {",
            "getLandsSourceData: () => getSourceData(map, LAND_SOURCE_ID),",
            "getDebugProbeSourceData: () => getSourceData(map, DEBUG_PROBE_SOURCE_ID),",
            "getDebugMarkerData: () => getSourceData(map, DEBUG_REFERENCE_MARKER_SOURCE_ID),",
            "getDebugProbeMeta: () => deps.getDebugProbeMeta(),",
            "getDebugMarkerCoordinate: () => [...DEBUG_REFERENCE_LNG_LAT],",
            "getDebugMarkerScreenPoint: () => {",
            "getMapCenterZoom: () => {",
            "isDebugMarkerInViewport: () => {",
            "listDebugLayers: () =>",
            "getGeometryStats: () => deps.getGeometryStats(),",
            "getInvalidGeometrySamples: (limit?: number) => deps.getInvalidGeometrySamples(limit)",
            "getLastHighlightLoad: () => deps.getLastHighlightLoad()",
            "function normalizeGeometryToWgs84(",
            'expected EPSG:4326 GeoJSON',
            "geometryValidationStats.dropReasons",
            "invalidGeometrySamples.push({",
            'const DEBUG_REFERENCE_MARKER_SOURCE_ID = "debug-reference-marker-source";',
            'const DEBUG_REFERENCE_MARKER_LAYER_ID = "debug-reference-marker-layer";',
            "const DEBUG_REFERENCE_LNG_LAT: [number, number] = [126.45208, 36.783454];",
            "function ensureDebugProbeLayers(map: MapLibreMap): void {",
            "function ensureDebugReferenceMarker(map: MapLibreMap): void {",
            'const existingDomMarker = document.getElementById("debug-reference-dom-marker");',
            'new maplibregl.Marker({ element: markerElement }).setLngLat(DEBUG_REFERENCE_LNG_LAT).addTo(map);',
            "if (!map.getSource(DEBUG_REFERENCE_MARKER_SOURCE_ID)) {",
            'id: DEBUG_REFERENCE_MARKER_LAYER_ID,',
            '"circle-color": "#22c55e"',
            "map.jumpTo({ center: DEBUG_REFERENCE_LNG_LAT, zoom: 16 });",
            'debug marker ready: lng=${DEBUG_REFERENCE_LNG_LAT[0].toFixed(6)} lat=${DEBUG_REFERENCE_LNG_LAT[1].toFixed(6)}',
            'await fetchJson<DebugProbeApiResponse>(',
            'bboxCrs=EPSG:4326&limit=1000',
            'import { toWgs84CoordinatePair } from "./coordinate-transform";',
        ],
    )
    assert '"fill-opacity": 0' in maplibre_view_ts
    assert '"line-color": "rgba(255, 255, 255, 0.95)"' in maplibre_view_ts
    assert '"line-width": SELECTION_HALO_LINE_WIDTH' in maplibre_view_ts
    assert '"line-width": SELECTION_PULSE_MIN_WIDTH' in maplibre_view_ts
    assert '"line-opacity": SELECTION_PULSE_MIN_ALPHA' in maplibre_view_ts
    assert '"line-color": "#ffd400"' not in maplibre_view_ts
    assert 'const INDEXED_DB_VERSION = 4;' in cache_ts
    assert 'const CACHE_KEY_VERSION = 4;' in cache_ts
    assert "db.deleteObjectStore(INDEXED_DB_STORE);" in cache_ts
    assert "const MAX_API_REQUEST_PNUS = 10000;" in layer_ts
    assert "const apiLoaded = await loadUploadedHighlightsFromApi({" in layer_ts
    assert "for (let start = 0; start < normalizedPnus.length; start += MAX_API_REQUEST_PNUS)" in layer_ts
    assert "outputCrs," in layer_ts
    assert "function closeRingIfNeeded(" in maplibre_view_ts
    assert "const closedRing = closeRingIfNeeded(ring);" in maplibre_view_ts
    assert "ArrayBuffer.isView(value)" in maplibre_view_ts
    assert "Symbol.iterator in value" in maplibre_view_ts
    assert "function toCoordinateArray(value: unknown): unknown[] | null {" in maplibre_view_ts
    assert "coordinateSample?: unknown;" in maplibre_view_ts
    assert "let lastHighlightLoad: HighlightLoadDebugInfo | null = null;" in maplibre_view_ts
    assert "const setHighlightDebugInfo = (info: HighlightLoadDebugInfo | null): void => {" in maplibre_view_ts
    assert 'const getViewportBboxCrs = (): "EPSG:3857" | "EPSG:4326" =>' in workflow_ts
    assert 'deps.mapView.getEngine() === "maplibre" ? "EPSG:4326" : (config?.cadastralCrs ?? "EPSG:4326");' in workflow_ts
    assert 'const getRenderProjection = (_deps: HighlightDeps, config: MapConfig): MapConfig["cadastralCrs"] => config.cadastralCrs;' in highlight_ts
    assert "deps.mapView.setHighlightDebugInfo?.(loaded.debugInfo);" in highlight_ts
    worker_ts = Path("frontend/src/map/cadastral-fgb-worker.ts").read_text(encoding="utf-8")
    assert 'import { transformCoordinatesToOutputCrs } from "./coordinate-transform";' in worker_ts
    assert "ArrayBuffer.isView(value)" in worker_ts
    assert "function toPlainCoordinateArray(value: unknown): unknown[] | null {" in worker_ts
    assert "const coordinates = transformCoordinatesToOutputCrs(candidate.coordinates, sourceCrs, outputCrs);" in worker_ts
    assert "export function toWgs84CoordinatePair(" in coordinate_transform_ts
    assert 'if (sourceCrs === "EPSG:3857") {' in coordinate_transform_ts
    assert "export function transformCoordinatesToOutputCrs(" in coordinate_transform_ts
