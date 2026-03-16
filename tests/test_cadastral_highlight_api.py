import json
from pathlib import Path

import httpx
import pytest


@pytest.mark.anyio
async def test_cadastral_highlights_served_with_v1_alias(
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.services import cadastral_highlight_service

    payload = {
        "items": [
            {
                "pnu": "1111111111111111111",
                "geometry": {"type": "Point", "coordinates": [1, 2]},
                "lod": "full",
                "bbox": [1, 2, 1, 2],
                "center": [1, 2],
            }
        ],
        "meta": {"requested": 1, "matched": 1, "source": "parcel_render_item"},
    }
    monkeypatch.setattr(cadastral_highlight_service, "get_filtered_highlights", lambda **_kwargs: payload)

    body = {"theme": "city_owned", "pnus": ["1111111111111111111"]}
    v0 = await async_client.post("/api/cadastral/highlights", json=body)
    v1 = await async_client.post("/api/v1/cadastral/highlights", json=body)

    assert v0.status_code == 200
    assert v1.status_code == 200
    assert v0.json() == payload
    assert v1.json() == payload


@pytest.mark.anyio
async def test_cadastral_highlights_reject_invalid_payload(async_client: httpx.AsyncClient) -> None:
    response = await async_client.post("/api/cadastral/highlights", json={"theme": "city_owned", "pnus": ["bad"]})
    assert response.status_code == 400
    assert "19-digit PNU" in response.json()["detail"]


@pytest.mark.anyio
async def test_cadastral_highlights_reject_invalid_theme(async_client: httpx.AsyncClient) -> None:
    response = await async_client.post(
        "/api/cadastral/highlights",
        json={"theme": "invalid", "pnus": ["1111111111111111111"]},
    )
    assert response.status_code == 400
    assert "theme must be city_owned or national_public" == response.json()["detail"]


@pytest.mark.anyio
async def test_cadastral_highlights_reject_invalid_bbox(async_client: httpx.AsyncClient) -> None:
    response = await async_client.post(
        "/api/cadastral/highlights",
        json={"theme": "city_owned", "pnus": ["1111111111111111111"], "bbox": [1, 2, 3]},
    )
    assert response.status_code == 400
    assert "bbox must be" in response.json()["detail"]


def _seed_render_items(db_path: Path) -> None:
    from app.db.connection import db_connection
    from app.repositories import parcel_render_repository

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
                    "geom_geojson_full": json.dumps({"type": "Point", "coordinates": [1.0, 1.0]}),
                    "geom_geojson_mid": json.dumps({"type": "Point", "coordinates": [2.0, 2.0]}),
                    "geom_geojson_low": json.dumps({"type": "Point", "coordinates": [3.0, 3.0]}),
                    "label_x": 5.0,
                    "label_y": 5.0,
                    "source_fgb_etag": 'W/"1-1"',
                    "source_fgb_path": "data/sample.fgb",
                    "source_crs": "EPSG:3857",
                },
                {
                    "pnu": "2222222222222222222",
                    "bbox_minx": 100.0,
                    "bbox_miny": 100.0,
                    "bbox_maxx": 110.0,
                    "bbox_maxy": 110.0,
                    "center_x": 105.0,
                    "center_y": 105.0,
                    "area_m2": 100.0,
                    "vertex_count": 5,
                    "geom_geojson_full": json.dumps({"type": "Point", "coordinates": [100.0, 100.0]}),
                    "geom_geojson_mid": json.dumps({"type": "Point", "coordinates": [101.0, 101.0]}),
                    "geom_geojson_low": json.dumps({"type": "Point", "coordinates": [102.0, 102.0]}),
                    "label_x": 105.0,
                    "label_y": 105.0,
                    "source_fgb_etag": 'W/"1-1"',
                    "source_fgb_path": "data/sample.fgb",
                    "source_crs": "EPSG:3857",
                },
            ],
        )
        parcel_render_repository.swap_staging_table(conn)
        conn.commit()


def test_cadastral_highlight_service_build_filtered_response(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, db_path: Path
) -> None:
    from app.services import cadastral_highlight_service

    fgb_file = tmp_path / "sample.fgb"
    fgb_file.write_bytes(b"fgb")
    _seed_render_items(db_path)

    response = cadastral_highlight_service.build_filtered_geojson_response(
        requested_pnus=["1111111111111111111"],
        fgb_etag='W/"1-1"',
        cadastral_crs="EPSG:3857",
    )
    assert len(response["items"]) == 1
    assert response["items"][0]["pnu"] == "1111111111111111111"
    assert response["items"][0]["geometry"]["coordinates"] == [1.0, 1.0]
    assert response["meta"]["matched"] == 1
    assert response["meta"]["responseCrs"] == "EPSG:3857"


def test_cadastral_highlight_service_applies_bbox_filter(db_path: Path) -> None:
    from app.services import cadastral_highlight_service

    _seed_render_items(db_path)

    response = cadastral_highlight_service.build_filtered_geojson_response(
        requested_pnus=["1111111111111111111", "2222222222222222222"],
        fgb_etag='W/"1-1"',
        cadastral_crs="EPSG:3857",
        bbox=(-1.0, -1.0, 20.0, 20.0),
        bbox_crs="EPSG:3857",
    )
    assert len(response["items"]) == 1
    assert response["meta"]["bboxApplied"] is True
    # SQL bbox filter excludes the out-of-range row before Python sees it;
    # bboxFiltered reflects only the Python-level safety-net count (0 here).
    assert response["meta"]["bboxFiltered"] == 0


def test_cadastral_highlight_service_selects_mid_lod_for_wide_bbox(db_path: Path) -> None:
    from app.services import cadastral_highlight_service

    _seed_render_items(db_path)
    response = cadastral_highlight_service.build_filtered_geojson_response(
        requested_pnus=["1111111111111111111"],
        fgb_etag='W/"1-1"',
        cadastral_crs="EPSG:3857",
        bbox=(0.0, 0.0, 10_000.0, 10_000.0),
        bbox_crs="EPSG:3857",
    )

    assert response["items"][0]["lod"] == "mid"
    assert response["items"][0]["geometry"]["coordinates"] == [2.0, 2.0]


def test_iter_features_from_fgb_uses_reader_with_bbox(tmp_path: Path) -> None:
    from app.services import cadastral_highlight_service

    fgb_file = tmp_path / "sample.fgb"
    fgb_file.write_bytes(b"fgb")
    called: dict[str, object] = {"bbox": None}

    class FakeFlatGeobuf:
        @staticmethod
        def Reader(_handle: object, *, bbox: tuple[float, float, float, float] | None = None):
            called["bbox"] = bbox
            return iter(
                [
                    {
                        "type": "Feature",
                        "geometry": {"type": "Point", "coordinates": [0.0, 0.0]},
                        "properties": {"PNU": "1111111111111111111"},
                    }
                ]
            )

    features = list(
        cadastral_highlight_service._iter_features_from_fgb(
            file_path=fgb_file,
            fgb_module=FakeFlatGeobuf,
            bbox=(-1.0, -1.0, 1.0, 1.0),
        )
    )
    assert called["bbox"] == (-1.0, -1.0, 1.0, 1.0)
    assert len(features) == 1


def test_build_filtered_response_includes_query_ms(db_path: Path) -> None:
    from app.services import cadastral_highlight_service

    _seed_render_items(db_path)
    response = cadastral_highlight_service.build_filtered_geojson_response(
        requested_pnus=["1111111111111111111"],
        fgb_etag='W/"1-1"',
        cadastral_crs="EPSG:3857",
    )
    assert "query_ms" in response["meta"]
    assert isinstance(response["meta"]["query_ms"], float)


def test_build_filtered_response_bbox_calls_bbox_sql(
    monkeypatch: pytest.MonkeyPatch, db_path: Path
) -> None:
    from app.repositories import parcel_render_repository
    from app.services import cadastral_highlight_service

    _seed_render_items(db_path)
    calls: list[dict[str, object]] = []
    original_fn = parcel_render_repository.fetch_render_items_by_pnus_and_bbox

    def _spy(conn, *, pnus, bbox_minx, bbox_miny, bbox_maxx, bbox_maxy):  # type: ignore[misc]
        calls.append({"pnus": pnus, "bbox_minx": bbox_minx, "bbox_maxy": bbox_maxy})
        return original_fn(
            conn,
            pnus=pnus,
            bbox_minx=bbox_minx,
            bbox_miny=bbox_miny,
            bbox_maxx=bbox_maxx,
            bbox_maxy=bbox_maxy,
        )

    monkeypatch.setattr(parcel_render_repository, "fetch_render_items_by_pnus_and_bbox", _spy)

    cadastral_highlight_service.build_filtered_geojson_response(
        requested_pnus=["1111111111111111111", "2222222222222222222"],
        fgb_etag='W/"1-1"',
        cadastral_crs="EPSG:3857",
        bbox=(-1.0, -1.0, 20.0, 20.0),
        bbox_crs="EPSG:3857",
    )
    assert len(calls) == 1
    assert calls[0]["bbox_minx"] == -1.0


def test_iter_features_from_fgb_falls_back_to_load(tmp_path: Path) -> None:
    from app.services import cadastral_highlight_service

    fgb_file = tmp_path / "sample.fgb"
    fgb_file.write_bytes(b"fgb")
    called: dict[str, object] = {"bbox": None}

    class FakeFlatGeobuf:
        @staticmethod
        def Reader(_handle: object, *, bbox: tuple[float, float, float, float] | None = None):
            raise RuntimeError("reader unavailable")

        @staticmethod
        def load(_handle: object, *, bbox: tuple[float, float, float, float] | None = None):
            called["bbox"] = bbox
            return {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "geometry": {"type": "Point", "coordinates": [0.0, 0.0]},
                        "properties": {"PNU": "1111111111111111111"},
                    }
                ],
            }

    features = list(
        cadastral_highlight_service._iter_features_from_fgb(
            file_path=fgb_file,
            fgb_module=FakeFlatGeobuf,
            bbox=(-2.0, -2.0, 2.0, 2.0),
        )
    )
    assert called["bbox"] == (-2.0, -2.0, 2.0, 2.0)
    assert len(features) == 1
