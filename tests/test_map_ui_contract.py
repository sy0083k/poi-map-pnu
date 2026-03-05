from pathlib import Path

import httpx
import pytest


@pytest.mark.anyio
async def test_root_page_starts_with_hidden_info_panel(async_client: httpx.AsyncClient) -> None:
    res = await async_client.get("/")
    assert res.status_code == 200
    assert 'id="land-info-panel" class="is-hidden"' in res.text
    assert 'class="topbar-separator"' in res.text


def test_topbar_menu_uses_sidebar_anchor_offset_css() -> None:
    css_path = Path("static/css/style.css")
    css_text = css_path.read_text(encoding="utf-8")
    assert "--topbar-menu-anchor-x: var(--sidebar-width);" in css_text
    assert "left: var(--topbar-menu-anchor-x);" in css_text
    assert 'content: "<";' in css_text
    assert 'content: ">";' in css_text
    assert "#sidebar-handle[aria-expanded=\"false\"]::after" in css_text


def test_map_navigation_does_not_reload_cadastral_layers_on_moveend() -> None:
    map_ts = Path("frontend/src/map.ts").read_text(encoding="utf-8")
    assert "mapView.setMoveEndHandler(() => {" in map_ts
    assert "void reloadCadastralLayers();" not in map_ts


def test_select_highlight_is_flushed_before_fit_animation() -> None:
    map_view_ts = Path("frontend/src/map/map-view.ts").read_text(encoding="utf-8")
    assert "renderFeatureLayers();" in map_view_ts
    assert "map.renderSync();" in map_view_ts
    assert "window.requestAnimationFrame(() => {" in map_view_ts
