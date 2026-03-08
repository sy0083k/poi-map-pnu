from pathlib import Path

import httpx
import pytest


@pytest.mark.anyio
async def test_root_page_starts_with_hidden_info_panel(async_client: httpx.AsyncClient) -> None:
    redirect = await async_client.get("/", follow_redirects=False)
    assert redirect.status_code == 307
    assert redirect.headers.get("location") == "/siyu"

    res = await async_client.get("/", follow_redirects=True)
    assert res.status_code == 200
    assert 'data-initial-theme="city_owned"' in res.text
    assert 'id="land-info-panel" class="is-hidden"' in res.text
    assert 'class="topbar-separator"' in res.text
    assert "시유지" in res.text
    assert "파일→지도" in res.text
    assert "사진→지도" in res.text
    assert 'id="menu-file-map"' in res.text
    assert 'id="menu-photo-map"' in res.text
    assert 'href="/file2map"' in res.text
    assert 'href="/photo2map"' in res.text
    assert "공유지(시+도)" not in res.text
    assert "국·공유지" not in res.text
    assert ">백지도<" in res.text
    assert 'data-basemap="White"' in res.text
    assert "시유재산" not in res.text
    assert "공유재산(시·도)" not in res.text
    assert "시+도유지" not in res.text
    assert ">필터 결과 다운로드<" in res.text
    assert ">전체 목록 다운로드<" not in res.text
    assert res.text.count(">재산관리관 (예: 회계과)<") >= 2
    assert res.text.count(">재산용도<") >= 2
    assert res.text.count(">지목<") >= 2
    assert "재산관리관 검색" not in res.text
    assert 'id="property-manager-search"' in res.text
    assert 'id="mobile-property-manager-search"' in res.text
    assert 'id="property-usage-search"' in res.text
    assert 'id="mobile-property-usage-search"' in res.text
    assert 'id="land-type-search"' in res.text
    assert 'id="mobile-land-type-search"' in res.text
    assert res.text.count('class="filter-control"') >= 12
    assert res.text.count('class="inline-filter-row compact-filter-row"') >= 2
    assert "padding: 10px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;" not in res.text
    assert '<option value="행정재산">행정재산</option>' in res.text
    assert '<option value="일반재산">일반재산</option>' in res.text
    desktop_region_idx = res.text.index('id="region-search"')
    desktop_usage_idx = res.text.index('id="property-usage-search"')
    desktop_land_type_idx = res.text.index('id="land-type-search"')
    desktop_min_area_idx = res.text.index('id="min-area"')
    assert desktop_region_idx < desktop_usage_idx < desktop_land_type_idx < desktop_min_area_idx
    mobile_region_idx = res.text.index('id="mobile-region-search"')
    mobile_usage_idx = res.text.index('id="mobile-property-usage-search"')
    mobile_land_type_idx = res.text.index('id="mobile-land-type-search"')
    mobile_min_area_idx = res.text.index('id="mobile-min-area"')
    assert mobile_region_idx < mobile_usage_idx < mobile_land_type_idx < mobile_min_area_idx
    map_idx = res.text.index('id="map"')
    status_idx = res.text.index('id="map-status"')
    status_text_idx = res.text.index('id="map-status-text"')
    status_close_idx = res.text.index('id="map-status-close"')
    legend_idx = res.text.index('id="map-legend"')
    info_panel_idx = res.text.index('id="land-info-panel"')
    assert map_idx < status_idx < status_text_idx < status_close_idx < legend_idx < info_panel_idx
    assert ">범례<" in res.text
    assert 'id="map-legend-close"' in res.text
    assert 'aria-label="범례 닫기"' in res.text
    assert ">도로과<" in res.text
    assert ">건설과<" in res.text
    assert ">산림공원과<" in res.text
    assert ">회계과<" in res.text
    assert ">기타<" in res.text
    assert 'data-theme="city_owned"' in res.text
    assert 'data-menu-link="/gukgongyu"' not in res.text
    assert 'data-link-theme="national_public"' not in res.text
    assert ">관심 필지<" not in res.text
    assert ">행정 경계<" not in res.text
    assert ">개발 예정<" not in res.text


@pytest.mark.anyio
async def test_theme_path_pages_set_initial_theme(async_client: httpx.AsyncClient) -> None:
    national = await async_client.get("/file2map")
    photo = await async_client.get("/photo2map")
    city = await async_client.get("/siyu")
    assert national.status_code == 200
    assert photo.status_code == 200
    assert city.status_code == 200
    assert 'data-initial-theme="national_public"' in national.text
    assert 'data-map-mode="photo"' in photo.text
    assert 'id="photo-folder-input"' in photo.text
    assert 'id="photo-load-btn"' in photo.text
    assert 'id="photo-clear-btn"' in photo.text
    assert 'id="photo-list"' in photo.text
    assert 'id="photo-prev-btn"' in photo.text
    assert 'id="photo-next-btn"' in photo.text
    assert 'id="photo-info-panel"' in photo.text
    assert 'id="photo-info-image"' in photo.text
    assert 'class="sidebar-filter-section"' in photo.text
    assert 'class="sidebar-list-container"' in photo.text
    assert 'class="sidebar-nav-footer"' in photo.text
    assert 'class="sidebar-empty-message"' in photo.text
    assert 'id="land-info-panel"' in photo.text
    assert 'id="land-info-content"' in photo.text
    assert "EXIF 사진 폴더 선택" in photo.text
    assert 'data-initial-theme="city_owned"' in city.text
    assert 'id="map-legend"' in city.text
    assert 'id="map-legend" class="is-hidden"' not in city.text
    assert 'id="photo-info-panel"' in city.text
    assert 'class="file2map-mode"' in national.text
    assert 'id="map-legend" class="is-hidden"' in national.text
    assert 'id="file2map-upload-panel"' in national.text
    assert 'id="file2map-upload-input"' in national.text
    assert 'id="file2map-upload-btn"' in national.text
    assert 'id="file2map-upload-clear-btn"' in national.text
    assert 'id="photo-info-panel"' in national.text
    assert 'id="map-legend"' not in photo.text
    assert 'id="photo-lightbox"' not in national.text
    assert 'id="file2map-upload-summary"' not in national.text
    assert 'id="file2map-upload-status"' not in national.text
    assert 'class="file2map-mode"' not in city.text


@pytest.mark.anyio
async def test_legacy_gukgongyu_path_is_not_supported(async_client: httpx.AsyncClient) -> None:
    legacy = await async_client.get("/gukgongyu", follow_redirects=False)
    assert legacy.status_code == 404


def test_topbar_menu_uses_sidebar_anchor_offset_css() -> None:
    css_path = Path("static/css/style.css")
    css_text = css_path.read_text(encoding="utf-8")
    assert "--topbar-menu-anchor-x: var(--sidebar-width);" in css_text
    assert "left: var(--topbar-menu-anchor-x);" in css_text
    assert 'content: "<";' in css_text
    assert 'content: ">";' in css_text
    assert "#sidebar-handle[aria-expanded=\"false\"]::after" in css_text
    assert ".compact-filter-row {" in css_text
    assert "display: grid;" in css_text
    assert "grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);" in css_text
    assert "--filter-input-height: 33px;" in css_text
    assert "--filter-control-height: var(--filter-input-height);" in css_text
    assert "--filter-col-gap: 8px;" in css_text
    assert "--filter-row-gap: 10px;" in css_text
    assert "--map-overlay-right-offset: 20px;" in css_text
    assert "--map-overlay-right-offset: 12px;" in css_text
    assert ".filter-control {" in css_text
    assert "height: var(--filter-control-height);" in css_text
    assert ".filter-control:focus-visible {" in css_text
    assert ".area-input-container {" in css_text
    assert "grid-template-columns: minmax(0, 1fr) 14px minmax(0, 1fr);" in css_text
    assert "body.file2map-mode #file2map-upload-panel" in css_text
    assert "body.file2map-mode #desktop-property-usage-group" in css_text
    assert "#map-legend {" in css_text
    assert "right: var(--map-overlay-right-offset);" in css_text
    assert ".map-legend-swatch-road {" in css_text
    assert ".map-legend-swatch-accounting {" in css_text
    assert "#land-info-panel {" in css_text
    assert "body.photo-panel-open #map-legend {" in css_text
    assert ".map-legend-close {" in css_text
    assert ".map-legend-close:focus-visible {" in css_text
    assert "bottom: calc(50vh + 12px);" in css_text
    assert "#photo-load-btn {" in css_text
    assert "#photo-clear-btn { background: linear-gradient(180deg, #6f879c 0%, #596f82 100%); }" in css_text
    assert ".sidebar-empty-message {" in css_text


def test_map_navigation_does_not_reload_cadastral_layers_on_moveend() -> None:
    map_ts = Path("frontend/src/map.ts").read_text(encoding="utf-8")
    events_ts = Path("frontend/src/map/land-map-events.ts").read_text(encoding="utf-8")
    init_ts = Path("frontend/src/map/land-map-init.ts").read_text(encoding="utf-8")
    ui_ts = Path("frontend/src/map/land-map-ui.ts").read_text(encoding="utf-8")
    workflow_ts = Path("frontend/src/map/land-workflow.ts").read_text(encoding="utf-8")
    theme_routing_ts = Path("frontend/src/map/theme-routing.ts").read_text(encoding="utf-8")
    topbar_menu_ts = Path("frontend/src/map/topbar-menu.ts").read_text(encoding="utf-8")

    moveend_anchor = "mapView.setMoveEndHandler(() => {"
    assert moveend_anchor in events_ts
    moveend_block = events_ts.split(moveend_anchor, maxsplit=1)[1].split("});", maxsplit=1)[0]
    assert "void reloadCadastralLayers();" not in moveend_block
    assert 'state.setCurrentTheme(theme);' in map_ts
    assert "clearPropertyManagerInputs();" not in map_ts
    assert "applyThemeUiState(theme);" in map_ts
    assert "applyLegendUiState(theme);" in map_ts
    assert "let isLegendDismissedByUser = false;" in ui_ts
    assert "isLegendDismissedByUser = false;" in ui_ts
    assert "isLegendDismissedByUser = true;" in ui_ts
    assert "if (state.getCurrentTheme() !== \"city_owned\" && theme === \"city_owned\") {" in map_ts
    assert "dom.mapLegendCloseButton?.addEventListener(\"click\", () => {" in map_ts
    assert "legendController.dismissLegend();" in map_ts
    assert "void deps.workflow.loadThemeData(nextTheme);" in events_ts
    assert "await deps.workflow.loadThemeData(deps.state.getCurrentTheme());" in init_ts
    assert "재산관리관 다중 검출:" in workflow_ts
    assert "정확한 재산관리관을 입력하세요." in workflow_ts
    assert 'currentTheme === "city_owned"' not in workflow_ts
    assert 'deps.mapView.renderFeatures({ type: "FeatureCollection", features: [] }' in workflow_ts
    assert 'downloadClient.downloadSearchResultFile({' in workflow_ts
    assert 'const THEME_PATHS: Record<ThemeType, string> = {' in theme_routing_ts
    assert 'national_public: "/file2map"' in theme_routing_ts
    assert 'city_owned: "/siyu"' in theme_routing_ts
    assert "pushThemeHistory(theme);" in map_ts
    assert 'fileMapLink.classList.toggle("is-active", theme === "national_public")' not in topbar_menu_ts
    assert 'item.dataset.linkTheme === theme' not in topbar_menu_ts
    assert 'document.querySelectorAll<HTMLButtonElement>(".menu-item[data-menu-link]")' not in topbar_menu_ts
    assert "window.location.assign(target);" not in topbar_menu_ts
    assert 'rawBasemap !== "Base"' in topbar_menu_ts
    assert 'layerType === "White"' in map_ts
    assert "applyLegendUiState(nextTheme);" in events_ts
    assert "applyLegendUiState(initialTheme);" in init_ts


def test_lands_list_client_sends_theme_query() -> None:
    client_ts = Path("frontend/src/map/lands-list-client.ts").read_text(encoding="utf-8")
    assert "export async function loadAllLandListItems(theme: ThemeType)" in client_ts
    assert 'const query = new URLSearchParams({ limit: "500", theme });' in client_ts


def test_select_highlight_is_flushed_before_fit_animation() -> None:
    map_view_ts = Path("frontend/src/map/map-view.ts").read_text(encoding="utf-8")
    map_ts = Path("frontend/src/map.ts").read_text(encoding="utf-8")
    events_ts = Path("frontend/src/map/land-map-events.ts").read_text(encoding="utf-8")
    init_ts = Path("frontend/src/map/land-map-init.ts").read_text(encoding="utf-8")
    assert "renderFeatureLayers();" in map_view_ts
    assert "map.renderSync();" in map_view_ts
    assert "window.requestAnimationFrame(() => {" in map_view_ts
    assert 'White: "white"' in map_view_ts
    assert "White: 18" in map_view_ts
    assert 'stroke: new Stroke({ color: "#ff7f00", width: 3 })' in map_view_ts
    assert 'fill: new Fill({ color: "rgba(255, 127, 0, 0.2)" })' in map_view_ts
    assert 'stroke: new Stroke({ color: "#377eb8", width: 3 })' in map_view_ts
    assert 'fill: new Fill({ color: "rgba(55, 126, 184, 0.2)" })' in map_view_ts
    assert 'stroke: new Stroke({ color: "#4daf4a", width: 3 })' in map_view_ts
    assert 'fill: new Fill({ color: "rgba(77, 175, 74, 0.2)" })' in map_view_ts
    assert 'stroke: new Stroke({ color: "#e41a1c", width: 3 })' in map_view_ts
    assert 'fill: new Fill({ color: "rgba(228, 26, 28, 0.2)" })' in map_view_ts
    assert 'stroke: new Stroke({ color: "#984ea3", width: 3 })' in map_view_ts
    assert 'fill: new Fill({ color: "rgba(152, 78, 163, 0.2)" })' in map_view_ts
    assert 'if (manager === "도로과") {' in map_view_ts
    assert 'if (manager === "건설과") {' in map_view_ts
    assert 'if (manager === "산림공원과") {' in map_view_ts
    assert 'if (manager === "회계과") {' in map_view_ts
    assert "return fallbackFeatureStyle;" in map_view_ts
    assert "const resetInfoPanelScroll = (): void => {" in map_view_ts
    assert "elements.infoPanelContent.scrollTop = 0;" in map_view_ts
    assert "resetInfoPanelScroll();" in map_view_ts
    assert "mapView.setTheme(theme);" in map_ts
    assert "deps.mapView.setTheme(nextTheme);" in events_ts
    assert "deps.mapView.setTheme(initialTheme);" in init_ts
