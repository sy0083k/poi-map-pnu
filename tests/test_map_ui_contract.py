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
    assert ">검색 결과 다운로드<" in res.text
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
    info_panel_idx = res.text.index('id="land-info-panel"')
    assert map_idx < status_idx < status_text_idx < status_close_idx < info_panel_idx
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
    assert 'class="file2map-mode"' in national.text
    assert 'id="file2map-upload-panel"' in national.text
    assert 'id="file2map-upload-input"' in national.text
    assert 'id="file2map-upload-btn"' in national.text
    assert 'id="file2map-upload-clear-btn"' in national.text
    assert 'id="photo-info-panel"' in national.text
    assert 'id="photo-lightbox"' in national.text
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
    assert ".filter-control {" in css_text
    assert "height: var(--filter-control-height);" in css_text
    assert ".filter-control:focus-visible {" in css_text
    assert ".area-input-container {" in css_text
    assert "grid-template-columns: minmax(0, 1fr) 14px minmax(0, 1fr);" in css_text
    assert "body.file2map-mode #file2map-upload-panel" in css_text
    assert "body.file2map-mode #desktop-property-usage-group" in css_text
    assert "#photo-load-btn {" in css_text
    assert "#photo-clear-btn { background: linear-gradient(180deg, #6f879c 0%, #596f82 100%); }" in css_text
    assert ".sidebar-empty-message {" in css_text


def test_map_navigation_does_not_reload_cadastral_layers_on_moveend() -> None:
    map_ts = Path("frontend/src/map.ts").read_text(encoding="utf-8")
    workflow_ts = Path("frontend/src/map/land-workflow.ts").read_text(encoding="utf-8")
    theme_routing_ts = Path("frontend/src/map/theme-routing.ts").read_text(encoding="utf-8")
    topbar_menu_ts = Path("frontend/src/map/topbar-menu.ts").read_text(encoding="utf-8")

    moveend_anchor = "mapView.setMoveEndHandler(() => {"
    assert moveend_anchor in map_ts
    moveend_block = map_ts.split(moveend_anchor, maxsplit=1)[1].split("});", maxsplit=1)[0]
    assert "void reloadCadastralLayers();" not in moveend_block
    assert 'state.setCurrentTheme(theme);' in map_ts
    assert "clearPropertyManagerInputs();" not in map_ts
    assert "applyThemeUiState(theme);" in map_ts
    assert "await workflow.loadThemeData(state.getCurrentTheme());" in map_ts
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


def test_lands_list_client_sends_theme_query() -> None:
    client_ts = Path("frontend/src/map/lands-list-client.ts").read_text(encoding="utf-8")
    assert "export async function loadAllLandListItems(theme: ThemeType)" in client_ts
    assert 'const query = new URLSearchParams({ limit: "500", theme });' in client_ts


def test_select_highlight_is_flushed_before_fit_animation() -> None:
    map_view_ts = Path("frontend/src/map/map-view.ts").read_text(encoding="utf-8")
    assert "renderFeatureLayers();" in map_view_ts
    assert "map.renderSync();" in map_view_ts
    assert "window.requestAnimationFrame(() => {" in map_view_ts
    assert 'White: "white"' in map_view_ts
    assert "White: 18" in map_view_ts


def test_photo2map_contract_for_local_exif_markers() -> None:
    map_ts = Path("frontend/src/map.ts").read_text(encoding="utf-8")
    photo_mode_ts = Path("frontend/src/map/photo-mode.ts").read_text(encoding="utf-8")
    photo_overlay_ts = Path("frontend/src/map/persisted-photo-overlay.ts").read_text(encoding="utf-8")
    photo_persistence_ts = Path("frontend/src/map/photo-persistence.ts").read_text(encoding="utf-8")
    panel_overlap_guard_ts = Path("frontend/src/map/panel-overlap-guard.ts").read_text(encoding="utf-8")
    exif_parser_ts = Path("frontend/src/photo/exif-gps.ts").read_text(encoding="utf-8")
    local_upload_ts = Path("frontend/src/map/local-upload.ts").read_text(encoding="utf-8")
    cadastral_layer_ts = Path("frontend/src/map/cadastral-fgb-layer.ts").read_text(encoding="utf-8")
    main_py = Path("app/main.py").read_text(encoding="utf-8")
    css_text = Path("static/css/style.css").read_text(encoding="utf-8")
    index_template = Path("templates/index.html").read_text(encoding="utf-8")
    assert "bootstrapPhotoMode" in map_ts
    assert "bootstrapPersistedPhotoOverlay" in map_ts
    assert "data-map-mode" in index_template
    assert "parseJpegExifGps" in photo_mode_ts
    assert "selectPhoto" in photo_mode_ts
    assert "savePersistedPhotoMarkers" in photo_mode_ts
    assert "loadPersistedPhotoMarkers" in photo_mode_ts
    assert "clearPersistedPhotoMarkers" in photo_mode_ts
    assert "window.open(" not in photo_mode_ts
    assert 'id="photo-folder-input"' not in photo_mode_ts
    assert "webkitdirectory" in index_template
    assert "URL.createObjectURL(selected.file)" in photo_mode_ts
    assert "currentIndex < 0" in photo_mode_ts
    assert "selectPhoto(0, { shouldMoveMap: true, source: \"nav\" });" in photo_mode_ts
    assert 'button.className = "photo-list-btn list-item";' in photo_mode_ts
    assert 'button.classList.add("selected");' in photo_mode_ts
    assert "showLightbox" in photo_mode_ts
    assert "createPanelOverlapGuard" in photo_mode_ts
    assert "overlapGuard.open()" in photo_mode_ts
    assert "overlapGuard.close()" in photo_mode_ts
    assert "loadPersistedPhotoMarkers" in photo_overlay_ts
    assert "photo_marker_id" in photo_overlay_ts
    assert "createPanelOverlapGuard" in photo_overlay_ts
    assert "overlapGuard.open()" in photo_overlay_ts
    assert "overlapGuard.close()" in photo_overlay_ts
    assert "ResizeObserver" in panel_overlap_guard_ts
    assert "--photo-panel-runtime-height" in panel_overlap_guard_ts
    assert "--photo-panel-runtime-bottom-offset" in panel_overlap_guard_ts
    assert 'const STORE_NAME = "photo_markers";' in photo_persistence_ts
    assert "event.key === \"Escape\"" in photo_mode_ts
    assert "event.target === lightbox" in photo_mode_ts
    assert "photo_marker_id" in photo_mode_ts
    assert "loadPersistedFile2MapUpload" in photo_mode_ts
    assert "loadUploadedHighlights" in photo_mode_ts
    assert "land-info-panel" in photo_mode_ts
    assert "photo-prev-btn" in index_template
    assert "photo-next-btn" in index_template
    assert "sidebar-filter-section" in index_template
    assert "sidebar-list-container" in index_template
    assert "sidebar-nav-footer" in index_template
    assert "photo-info-panel" in index_template
    assert "photo-lightbox" in index_template
    assert "photo-lightbox-image" in index_template
    assert "land-info-panel" in index_template
    assert "land-info-content" in index_template
    assert "aria-modal=\"true\"" in index_template
    assert "bottom: 20px;" in css_text
    assert "--land-panel-max-safe: calc(" in css_text
    assert "--photo-panel-runtime-height: var(--photo-panel-safe-height);" in css_text
    assert "--photo-panel-runtime-bottom-offset: var(--photo-panel-bottom-offset);" in css_text
    assert "body.photo2map-mode #land-info-panel" in css_text
    assert "body.file2map-mode.photo-panel-open #land-info-panel" in css_text
    assert "var(--photo-panel-runtime-height)" in css_text
    assert "var(--photo-panel-runtime-bottom-offset)" in css_text
    assert "max-height: clamp(220px, var(--land-panel-max-safe), 560px);" in css_text
    assert "--photo-panel-bottom-offset: calc(50vh + 12px);" in css_text
    assert ".photo-list-item {" in css_text
    assert "border-bottom: 1px solid #eee;" in css_text
    assert ".photo-lightbox {" in css_text
    assert "img-src 'self' data: blob:" in main_py
    assert "loadPersistedFile2MapUpload" in local_upload_ts
    assert "loadUploadedHighlights" in cadastral_layer_ts
    assert "TAG_GPS_LAT" in exif_parser_ts
    assert "TAG_GPS_LON" in exif_parser_ts
