from pathlib import Path

import httpx
import pytest


@pytest.mark.anyio
async def test_root_page_starts_with_hidden_info_panel(async_client: httpx.AsyncClient) -> None:
    res = await async_client.get("/")
    assert res.status_code == 200
    assert 'id="land-info-panel" class="is-hidden"' in res.text
    assert 'class="topbar-separator"' in res.text
    assert "시유재산" in res.text
    assert "공유재산(시·도)" in res.text
    assert "국·공유지" in res.text
    assert ">검색 결과 다운로드<" in res.text
    assert ">전체 목록 다운로드<" not in res.text
    assert res.text.count(">재산관리관 (예: 회계과)<") >= 2
    assert "재산관리관 검색" not in res.text
    assert 'id="property-manager-search"' in res.text
    assert 'id="mobile-property-manager-search"' in res.text
    assert res.text.index('id="filter-section"') < res.text.index('id="map-status"') < res.text.index('id="list-container"')
    assert 'data-theme="city_owned"' in res.text
    assert 'data-theme="national_public"' in res.text
    assert 'class="menu-item is-active" type="button" role="menuitem" data-theme="national_public"' in res.text
    assert ">관심 필지<" not in res.text
    assert ">행정 경계<" not in res.text
    assert ">개발 예정<" not in res.text


def test_topbar_menu_uses_sidebar_anchor_offset_css() -> None:
    css_path = Path("static/css/style.css")
    css_text = css_path.read_text(encoding="utf-8")
    assert "--topbar-menu-anchor-x: var(--sidebar-width);" in css_text
    assert "left: var(--topbar-menu-anchor-x);" in css_text
    assert 'content: "<";' in css_text
    assert 'content: ">";' in css_text
    assert "#sidebar-handle[aria-expanded=\"false\"]::after" in css_text
    assert ".theme-city-only { display: none; }" in css_text
    assert "body.theme-city-owned .theme-city-only { display: block; }" in css_text


def test_map_navigation_does_not_reload_cadastral_layers_on_moveend() -> None:
    map_ts = Path("frontend/src/map.ts").read_text(encoding="utf-8")
    moveend_anchor = "mapView.setMoveEndHandler(() => {"
    assert moveend_anchor in map_ts
    moveend_block = map_ts.split(moveend_anchor, maxsplit=1)[1].split("});", maxsplit=1)[0]
    assert "void reloadCadastralLayers();" not in moveend_block
    assert 'state.setCurrentTheme(theme);' in map_ts
    assert "clearPropertyManagerInputs();" in map_ts
    assert "applyThemeUiState(theme);" in map_ts
    assert 'const getThemeLabel = (theme: ThemeType): string => {' in map_ts
    assert "await loadThemeData(state.getCurrentTheme());" in map_ts
    assert "재산관리관 다중 검출:" in map_ts
    assert "정확한 재산관리관을 입력하세요." in map_ts
    assert 'mapView.renderFeatures({ type: "FeatureCollection", features: [] }' in map_ts
    assert 'downloadClient.downloadSearchResultFile({' in map_ts


def test_lands_list_client_sends_theme_query() -> None:
    client_ts = Path("frontend/src/map/lands-list-client.ts").read_text(encoding="utf-8")
    assert "export async function loadAllLandListItems(theme: ThemeType)" in client_ts
    assert 'const query = new URLSearchParams({ limit: "500", theme });' in client_ts


def test_select_highlight_is_flushed_before_fit_animation() -> None:
    map_view_ts = Path("frontend/src/map/map-view.ts").read_text(encoding="utf-8")
    assert "renderFeatureLayers();" in map_view_ts
    assert "map.renderSync();" in map_view_ts
    assert "window.requestAnimationFrame(() => {" in map_view_ts
