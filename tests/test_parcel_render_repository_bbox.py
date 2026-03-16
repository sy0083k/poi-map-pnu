import json
from pathlib import Path

from app.db.connection import db_connection
from app.repositories import parcel_render_repository


def _seed(db_path: Path) -> None:
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
                    "geom_geojson_full": json.dumps({"type": "Point", "coordinates": [105.0, 105.0]}),
                    "geom_geojson_mid": None,
                    "geom_geojson_low": None,
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


def test_bbox_returns_only_intersecting_row(db_path: Path) -> None:
    _seed(db_path)
    with db_connection(row_factory=True) as conn:
        rows = parcel_render_repository.fetch_render_items_by_pnus_and_bbox(
            conn,
            pnus=["1111111111111111111", "2222222222222222222"],
            bbox_minx=-1.0,
            bbox_miny=-1.0,
            bbox_maxx=20.0,
            bbox_maxy=20.0,
        )
    assert len(rows) == 1
    assert str(rows[0]["pnu"]) == "1111111111111111111"


def test_bbox_includes_boundary_touch(db_path: Path) -> None:
    _seed(db_path)
    # Query bbox right edge exactly touches parcel left edge (bbox_minx=10.0 == query maxx)
    with db_connection(row_factory=True) as conn:
        rows = parcel_render_repository.fetch_render_items_by_pnus_and_bbox(
            conn,
            pnus=["1111111111111111111"],
            bbox_minx=10.0,
            bbox_miny=0.0,
            bbox_maxx=20.0,
            bbox_maxy=20.0,
        )
    assert len(rows) == 1
    assert str(rows[0]["pnu"]) == "1111111111111111111"


def test_bbox_empty_pnus_returns_empty(db_path: Path) -> None:
    _seed(db_path)
    with db_connection(row_factory=True) as conn:
        rows = parcel_render_repository.fetch_render_items_by_pnus_and_bbox(
            conn,
            pnus=[],
            bbox_minx=0.0,
            bbox_miny=0.0,
            bbox_maxx=200.0,
            bbox_maxy=200.0,
        )
    assert rows == []


def test_bbox_pnu_absent_from_db_not_returned(db_path: Path) -> None:
    _seed(db_path)
    with db_connection(row_factory=True) as conn:
        rows = parcel_render_repository.fetch_render_items_by_pnus_and_bbox(
            conn,
            pnus=["9999999999999999999"],
            bbox_minx=0.0,
            bbox_miny=0.0,
            bbox_maxx=200.0,
            bbox_maxy=200.0,
        )
    assert rows == []
