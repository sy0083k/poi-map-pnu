import json
import logging
from pathlib import Path

import pytest

from app.db.connection import db_connection
from app.repositories import parcel_render_repository


def _seed_render_items(db_path: Path, etag: str = 'W/"1-1"') -> None:
    with db_connection() as conn:
        parcel_render_repository.init_schema(conn)
        parcel_render_repository.prepare_staging_table(conn)
        parcel_render_repository.bulk_insert_staging(
            conn,
            [
                {
                    "pnu": "1111111111111111111",
                    "bbox_minx": 0.0,
                    "bbox_miny": 0.0,
                    "bbox_maxx": 10.0,
                    "bbox_maxy": 10.0,
                    "center_x": 5.0,
                    "center_y": 5.0,
                    "area_m2": 100.0,
                    "vertex_count": 5,
                    "geom_geojson_full": json.dumps({"type": "Point", "coordinates": [5.0, 5.0]}),
                    "geom_geojson_mid": None,
                    "geom_geojson_low": None,
                    "label_x": 5.0,
                    "label_y": 5.0,
                    "source_fgb_etag": etag,
                    "source_fgb_path": "data/sample.fgb",
                    "source_crs": "EPSG:3857",
                }
            ],
        )
        parcel_render_repository.swap_staging_table(conn)
        conn.commit()


def _make_fgb_file(tmp_path: Path) -> Path:
    fgb_file = tmp_path / "sample.fgb"
    fgb_file.write_bytes(b"fgb")
    return fgb_file


def test_etag_mismatch_returns_stale_index(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, db_path: Path
) -> None:
    from app.services import cadastral_highlight_cache, cadastral_highlight_service

    _make_fgb_file(tmp_path)
    _seed_render_items(db_path, etag='W/"old"')

    monkeypatch.setattr(
        cadastral_highlight_service,
        "build_file_etag",
        lambda _path: 'W/"new"',
    )
    monkeypatch.setattr(
        cadastral_highlight_service.cadastral_fgb_service,
        "resolve_fgb_path_for_health",
        lambda **_kwargs: tmp_path / "sample.fgb",
    )
    # Clear cache to force fresh lookup
    with cadastral_highlight_cache._cache_lock:
        cadastral_highlight_cache._response_cache.clear()

    response = cadastral_highlight_service.get_filtered_highlights(
        base_dir=str(tmp_path),
        configured_path="data/sample.fgb",
        pnu_field="PNU",
        cadastral_crs="EPSG:3857",
        theme="city_owned",
        requested_pnus=["1111111111111111111"],
    )
    assert response["items"] == []
    assert response["meta"]["source"] == "stale_index"
    assert response["meta"]["staleIndex"] is True
    assert response["meta"]["matched"] == 0
    assert response["meta"]["query_ms"] == 0.0


def test_etag_mismatch_logs_warning(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, db_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    from app.services import cadastral_highlight_cache, cadastral_highlight_service

    _make_fgb_file(tmp_path)
    _seed_render_items(db_path, etag='W/"old"')

    monkeypatch.setattr(
        cadastral_highlight_service,
        "build_file_etag",
        lambda _path: 'W/"new"',
    )
    monkeypatch.setattr(
        cadastral_highlight_service.cadastral_fgb_service,
        "resolve_fgb_path_for_health",
        lambda **_kwargs: tmp_path / "sample.fgb",
    )
    with cadastral_highlight_cache._cache_lock:
        cadastral_highlight_cache._response_cache.clear()

    with caplog.at_level(logging.WARNING, logger="app.services.cadastral_highlight_service"):
        cadastral_highlight_service.get_filtered_highlights(
            base_dir=str(tmp_path),
            configured_path="data/sample.fgb",
            pnu_field="PNU",
            cadastral_crs="EPSG:3857",
            theme="city_owned",
            requested_pnus=["1111111111111111111"],
        )
    assert any("ETag mismatch" in record.message for record in caplog.records)


def test_etag_match_returns_normal_response(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, db_path: Path
) -> None:
    from app.services import cadastral_highlight_cache, cadastral_highlight_service

    _make_fgb_file(tmp_path)
    _seed_render_items(db_path, etag='W/"1-1"')

    monkeypatch.setattr(
        cadastral_highlight_service,
        "build_file_etag",
        lambda _path: 'W/"1-1"',
    )
    monkeypatch.setattr(
        cadastral_highlight_service.cadastral_fgb_service,
        "resolve_fgb_path_for_health",
        lambda **_kwargs: tmp_path / "sample.fgb",
    )
    with cadastral_highlight_cache._cache_lock:
        cadastral_highlight_cache._response_cache.clear()

    response = cadastral_highlight_service.get_filtered_highlights(
        base_dir=str(tmp_path),
        configured_path="data/sample.fgb",
        pnu_field="PNU",
        cadastral_crs="EPSG:3857",
        theme="city_owned",
        requested_pnus=["1111111111111111111"],
    )
    assert response["meta"]["source"] == "parcel_render_item"
    assert response["meta"].get("staleIndex") is not True


def test_empty_db_stored_etag_none_proceeds_normally(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, db_path: Path
) -> None:
    from app.services import cadastral_highlight_cache, cadastral_highlight_service

    _make_fgb_file(tmp_path)
    # Initialize empty schema (no rows → stored_etag returns None)
    with db_connection() as conn:
        parcel_render_repository.init_schema(conn)
        conn.commit()

    monkeypatch.setattr(
        cadastral_highlight_service,
        "build_file_etag",
        lambda _path: 'W/"new"',
    )
    monkeypatch.setattr(
        cadastral_highlight_service.cadastral_fgb_service,
        "resolve_fgb_path_for_health",
        lambda **_kwargs: tmp_path / "sample.fgb",
    )
    with cadastral_highlight_cache._cache_lock:
        cadastral_highlight_cache._response_cache.clear()

    # Should not raise and should NOT return stale_index
    response = cadastral_highlight_service.get_filtered_highlights(
        base_dir=str(tmp_path),
        configured_path="data/sample.fgb",
        pnu_field="PNU",
        cadastral_crs="EPSG:3857",
        theme="city_owned",
        requested_pnus=["1111111111111111111"],
    )
    assert response["meta"]["source"] != "stale_index"
