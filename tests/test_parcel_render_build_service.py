import json
from pathlib import Path

from app.db.connection import db_connection
from app.repositories import parcel_render_repository, render_grid_repository
from app.services import parcel_render_build_service


def test_rebuild_render_items_for_path_swaps_rows(
    monkeypatch,
    tmp_path: Path,
    db_path: Path,
) -> None:
    fgb_file = tmp_path / "sample.fgb"
    fgb_file.write_bytes(b"fgb")
    monkeypatch.setattr(
        "app.services.parcel_render_build_service.cadastral_highlight_service.load_features_from_fgb",
        lambda _path: [
            {
                "type": "Feature",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[[0.0, 0.0], [0.0, 4.0], [4.0, 4.0], [4.0, 0.0], [0.0, 0.0]]],
                },
                "properties": {"PNU": "1111111111111111111"},
            }
        ],
    )

    row_count = parcel_render_build_service.rebuild_render_items_for_path(
        file_path=fgb_file,
        source_path="data/sample.fgb",
        pnu_field="PNU",
        cadastral_crs="EPSG:3857",
    )

    assert row_count == 1
    with db_connection(row_factory=True) as conn:
        rows = parcel_render_repository.fetch_render_items_by_pnus(
            conn,
            pnus=["1111111111111111111"],
        )
        cell_ids = render_grid_repository.fetch_intersecting_cell_ids(
            conn,
            bbox=(0.0, 0.0, 4.0, 4.0),
            grid_level=0,
        )
        candidate_pnus = render_grid_repository.fetch_candidate_pnus_for_cells(
            conn,
            cell_ids=cell_ids,
            requested_pnus=["1111111111111111111"],
        )
    assert len(rows) == 1
    assert len(cell_ids) == 1
    assert candidate_pnus == ["1111111111111111111"]
    assert json.loads(str(rows[0]["geom_geojson_full"]))["type"] == "Polygon"
    assert rows[0]["source_crs"] == "EPSG:3857"


def test_ensure_render_items_current_rebuilds_when_etag_changes(
    monkeypatch,
    tmp_path: Path,
    db_path: Path,
) -> None:
    fgb_file = tmp_path / "sample.fgb"
    fgb_file.write_bytes(b"fgb")
    monkeypatch.setattr(
        "app.services.parcel_render_build_service.cadastral_fgb_service.resolve_fgb_path_for_health",
        lambda **_kwargs: fgb_file,
    )
    monkeypatch.setattr(
        "app.services.parcel_render_build_service.build_file_etag",
        lambda _path: 'W/"new"',
    )
    calls: list[dict[str, str]] = []
    monkeypatch.setattr(
        parcel_render_build_service,
        "rebuild_render_items",
        lambda **kwargs: calls.append(kwargs) or 1,
    )

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
                    "bbox_maxx": 1.0,
                    "bbox_maxy": 1.0,
                    "center_x": 0.5,
                    "center_y": 0.5,
                    "area_m2": 1.0,
                    "vertex_count": 5,
                    "geom_geojson_full": '{"type":"Point","coordinates":[0,0]}',
                    "geom_geojson_mid": '{"type":"Point","coordinates":[0,0]}',
                    "geom_geojson_low": '{"type":"Point","coordinates":[0,0]}',
                    "label_x": 0.5,
                    "label_y": 0.5,
                    "source_fgb_etag": 'W/"old"',
                    "source_fgb_path": "data/sample.fgb",
                    "source_crs": "EPSG:3857",
                }
            ],
        )
        parcel_render_repository.swap_staging_table(conn)
        conn.commit()

    rebuilt = parcel_render_build_service.ensure_render_items_current(
        base_dir=str(tmp_path),
        configured_path="data/sample.fgb",
        pnu_field="PNU",
        cadastral_crs="EPSG:3857",
    )
    assert rebuilt is True
    assert calls[0]["configured_path"] == "data/sample.fgb"


def test_ensure_render_items_current_rebuilds_when_grid_index_missing(
    monkeypatch,
    tmp_path: Path,
    db_path: Path,
) -> None:
    fgb_file = tmp_path / "sample.fgb"
    fgb_file.write_bytes(b"fgb")
    monkeypatch.setattr(
        "app.services.parcel_render_build_service.cadastral_fgb_service.resolve_fgb_path_for_health",
        lambda **_kwargs: fgb_file,
    )
    monkeypatch.setattr(
        "app.services.parcel_render_build_service.build_file_etag",
        lambda _path: 'W/"same"',
    )
    calls: list[dict[str, str]] = []
    monkeypatch.setattr(
        parcel_render_build_service,
        "rebuild_render_items",
        lambda **kwargs: calls.append(kwargs) or 1,
    )

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
                    "bbox_maxx": 1.0,
                    "bbox_maxy": 1.0,
                    "center_x": 0.5,
                    "center_y": 0.5,
                    "area_m2": 1.0,
                    "vertex_count": 5,
                    "geom_geojson_full": '{"type":"Point","coordinates":[0,0]}',
                    "geom_geojson_mid": '{"type":"Point","coordinates":[0,0]}',
                    "geom_geojson_low": '{"type":"Point","coordinates":[0,0]}',
                    "label_x": 0.5,
                    "label_y": 0.5,
                    "source_fgb_etag": 'W/"same"',
                    "source_fgb_path": "data/sample.fgb",
                    "source_crs": "EPSG:3857",
                }
            ],
        )
        parcel_render_repository.swap_staging_table(conn)
        conn.commit()

    rebuilt = parcel_render_build_service.ensure_render_items_current(
        base_dir=str(tmp_path),
        configured_path="data/sample.fgb",
        pnu_field="PNU",
        cadastral_crs="EPSG:3857",
    )

    assert rebuilt is True
    assert len(calls) == 1
