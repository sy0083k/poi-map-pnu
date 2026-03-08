import time

from app.services import cadastral_highlight_cache


def setup_function() -> None:
    with cadastral_highlight_cache._cache_lock:
        cadastral_highlight_cache._response_cache.clear()


def test_build_cache_key_supports_versions() -> None:
    key_v2 = cadastral_highlight_cache.build_cache_key(
        theme="city_owned",
        pnus=["1111111111111111111"],
        fgb_etag='W/"1-1"',
        bbox=(1.2345, 2.3456, 3.4567, 4.5678),
        bbox_crs="EPSG:3857",
        version=2,
    )
    key_v1 = cadastral_highlight_cache.build_cache_key(
        theme="city_owned",
        pnus=["1111111111111111111"],
        fgb_etag='W/"1-1"',
        bbox=(1.2345, 2.3456, 3.4567, 4.5678),
        bbox_crs="EPSG:3857",
        version=1,
    )
    assert key_v2.startswith("v2:")
    assert key_v1.startswith("v1:")


def test_build_bbox_key_uses_two_decimal_precision() -> None:
    bbox_key = cadastral_highlight_cache.build_bbox_key(
        bbox=(1.2345, 2.3456, 3.4567, 4.5678),
        bbox_crs="EPSG:3857",
    )
    assert bbox_key == "bbox:1.23,2.35,3.46,4.57:EPSG:3857"


def test_get_cached_response_with_fallback(monkeypatch) -> None:
    monkeypatch.setenv("HIGHLIGHT_CACHE_TTL_SECONDS", "300")
    primary_key = "v2:primary"
    legacy_key = "v1:legacy"
    payload = {"meta": {"matched": 1}}
    cadastral_highlight_cache.set_cached_response(legacy_key, payload)

    cached = cadastral_highlight_cache.get_cached_response_with_fallback([primary_key, legacy_key])
    assert cached is not None
    assert cached["meta"]["source"] == "cache"
    assert cached["meta"]["cacheKeyVersion"] == 1


def test_set_cached_response_enforces_max_entries(monkeypatch) -> None:
    monkeypatch.setenv("HIGHLIGHT_CACHE_MAX_ENTRIES", "2")
    monkeypatch.setenv("HIGHLIGHT_CACHE_TTL_SECONDS", "300")
    cadastral_highlight_cache.set_cached_response("v2:1", {"meta": {}})
    cadastral_highlight_cache.set_cached_response("v2:2", {"meta": {}})
    cadastral_highlight_cache.set_cached_response("v2:3", {"meta": {}})
    with cadastral_highlight_cache._cache_lock:
        keys = list(cadastral_highlight_cache._response_cache.keys())
    assert keys == ["v2:2", "v2:3"]


def test_set_cached_response_respects_ttl(monkeypatch) -> None:
    monkeypatch.setenv("HIGHLIGHT_CACHE_TTL_SECONDS", "1")
    key = "v2:ttl"
    cadastral_highlight_cache.set_cached_response(key, {"meta": {}})
    time.sleep(1.1)
    assert cadastral_highlight_cache.get_cached_response(key) is None
