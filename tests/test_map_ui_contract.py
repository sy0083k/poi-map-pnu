import httpx
import pytest

from tests.helpers import assert_contains_all, assert_not_contains_all


@pytest.mark.anyio
async def test_root_redirects_to_siyu(async_client: httpx.AsyncClient) -> None:
    redirect = await async_client.get("/", follow_redirects=False)
    assert redirect.status_code == 307
    assert redirect.headers.get("location") == "/siyu"


@pytest.mark.anyio
async def test_root_page_navigation_and_filters_contract(async_client: httpx.AsyncClient) -> None:
    res = await async_client.get("/", follow_redirects=True)
    assert res.status_code == 200

    assert_contains_all(
        res.text,
        [
            'data-initial-theme="city_owned"',
            'id="land-info-panel" class="is-hidden"',
            'class="topbar-separator"',
            "시유지",
            "파일→지도",
            "사진→지도",
            'id="menu-file-map"',
            'id="menu-photo-map"',
            'href="/file2map"',
            'href="/photo2map"',
            ">백지도<",
            'data-basemap="White"',
            ">필터 결과 다운로드<",
            'id="property-manager-search"',
            'id="mobile-property-manager-search"',
            'id="property-usage-search"',
            'id="mobile-property-usage-search"',
            'id="land-type-search"',
            'id="mobile-land-type-search"',
            '<option value="행정재산">행정재산</option>',
            '<option value="일반재산">일반재산</option>',
        ],
    )
    assert_not_contains_all(
        res.text,
        [
            "공유지(시+도)",
            "국·공유지",
            "시유재산",
            "공유재산(시·도)",
            "시+도유지",
            ">전체 목록 다운로드<",
            "재산관리관 검색",
            "padding: 10px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;",
            'data-menu-link="/gukgongyu"',
            'data-link-theme="national_public"',
            ">관심 필지<",
            ">행정 경계<",
            ">개발 예정<",
        ],
    )
    assert res.text.count('class="filter-control"') >= 12
    assert res.text.count('class="inline-filter-row compact-filter-row"') >= 2
    assert res.text.count(">재산관리관 (예: 회계과)<") >= 2
    assert res.text.count(">재산용도<") >= 2
    assert res.text.count(">지목<") >= 2


@pytest.mark.anyio
async def test_root_page_layout_order_contract(async_client: httpx.AsyncClient) -> None:
    res = await async_client.get("/", follow_redirects=True)
    assert res.status_code == 200

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


@pytest.mark.anyio
async def test_root_page_legend_contract(async_client: httpx.AsyncClient) -> None:
    res = await async_client.get("/", follow_redirects=True)
    assert res.status_code == 200

    assert_contains_all(
        res.text,
        [
            ">범례<",
            'id="map-legend-close"',
            'aria-label="범례 닫기"',
            ">도로과<",
            ">건설과<",
            ">산림공원과<",
            ">회계과<",
            ">기타<",
            'data-theme="city_owned"',
        ],
    )


@pytest.mark.anyio
async def test_file2map_theme_page_contract(async_client: httpx.AsyncClient) -> None:
    national = await async_client.get("/file2map")
    assert national.status_code == 200
    assert_contains_all(
        national.text,
        [
            'data-initial-theme="national_public"',
            'class="file2map-mode"',
            'id="map-legend" class="is-hidden"',
            'id="file2map-upload-panel"',
            'id="file2map-upload-input"',
            'id="file2map-upload-btn"',
            'id="file2map-upload-clear-btn"',
            'id="photo-info-panel"',
        ],
    )
    assert_not_contains_all(national.text, ['id="photo-lightbox"', 'id="file2map-upload-summary"', 'id="file2map-upload-status"'])


@pytest.mark.anyio
async def test_photo2map_theme_page_contract(async_client: httpx.AsyncClient) -> None:
    photo = await async_client.get("/photo2map")
    assert photo.status_code == 200
    assert_contains_all(
        photo.text,
        [
            'data-map-mode="photo"',
            'id="photo-folder-input"',
            'id="photo-load-btn"',
            'id="photo-clear-btn"',
            'id="photo-list"',
            'id="photo-prev-btn"',
            'id="photo-next-btn"',
            'id="photo-info-panel"',
            'id="photo-info-image"',
            'class="sidebar-filter-section"',
            'class="sidebar-list-container"',
            'class="sidebar-nav-footer"',
            'class="sidebar-empty-message"',
            'id="land-info-panel"',
            'id="land-info-content"',
            "EXIF 사진 폴더 선택",
        ],
    )
    assert 'id="map-legend"' not in photo.text


@pytest.mark.anyio
async def test_city_owned_theme_page_contract(async_client: httpx.AsyncClient) -> None:
    city = await async_client.get("/siyu")
    assert city.status_code == 200
    assert_contains_all(city.text, ['data-initial-theme="city_owned"', 'id="map-legend"', 'id="photo-info-panel"'])
    assert 'id="map-legend" class="is-hidden"' not in city.text
    assert 'class="file2map-mode"' not in city.text


@pytest.mark.anyio
async def test_legacy_gukgongyu_path_is_not_supported(async_client: httpx.AsyncClient) -> None:
    legacy = await async_client.get("/gukgongyu", follow_redirects=False)
    assert legacy.status_code == 404
