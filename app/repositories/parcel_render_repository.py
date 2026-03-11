import sqlite3
from collections.abc import Iterable, Sequence
from typing import Any

TABLE_NAME = "parcel_render_item"
STAGING_TABLE_NAME = "parcel_render_item_staging"


def init_schema(conn: sqlite3.Connection) -> None:
    cursor = conn.cursor()
    _create_table(cursor, TABLE_NAME)
    cursor.execute(
        f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_updated_at ON {TABLE_NAME} (updated_at)"
    )
    cursor.execute(
        f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_bbox_x ON {TABLE_NAME} (bbox_minx, bbox_maxx)"
    )
    cursor.execute(
        f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_bbox_y ON {TABLE_NAME} (bbox_miny, bbox_maxy)"
    )


def prepare_staging_table(conn: sqlite3.Connection) -> None:
    cursor = conn.cursor()
    cursor.execute(f"DROP TABLE IF EXISTS {STAGING_TABLE_NAME}")
    _create_table(cursor, STAGING_TABLE_NAME)


def bulk_insert_staging(conn: sqlite3.Connection, rows: Iterable[dict[str, Any]]) -> None:
    cursor = conn.cursor()
    cursor.executemany(
        f"""
        INSERT INTO {STAGING_TABLE_NAME} (
            pnu,
            bbox_minx,
            bbox_miny,
            bbox_maxx,
            bbox_maxy,
            center_x,
            center_y,
            area_m2,
            vertex_count,
            geom_geojson_full,
            geom_geojson_mid,
            geom_geojson_low,
            label_x,
            label_y,
            source_fgb_etag,
            source_fgb_path,
            source_crs,
            updated_at
        ) VALUES (
            :pnu,
            :bbox_minx,
            :bbox_miny,
            :bbox_maxx,
            :bbox_maxy,
            :center_x,
            :center_y,
            :area_m2,
            :vertex_count,
            :geom_geojson_full,
            :geom_geojson_mid,
            :geom_geojson_low,
            :label_x,
            :label_y,
            :source_fgb_etag,
            :source_fgb_path,
            :source_crs,
            CURRENT_TIMESTAMP
        )
        """,
        list(rows),
    )


def swap_staging_table(conn: sqlite3.Connection) -> None:
    cursor = conn.cursor()
    cursor.execute(f"DROP TABLE IF EXISTS {TABLE_NAME}_backup")
    cursor.execute(f"ALTER TABLE {TABLE_NAME} RENAME TO {TABLE_NAME}_backup")
    cursor.execute(f"ALTER TABLE {STAGING_TABLE_NAME} RENAME TO {TABLE_NAME}")
    cursor.execute(f"DROP TABLE IF EXISTS {TABLE_NAME}_backup")
    cursor.execute(
        f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_updated_at ON {TABLE_NAME} (updated_at)"
    )
    cursor.execute(
        f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_bbox_x ON {TABLE_NAME} (bbox_minx, bbox_maxx)"
    )
    cursor.execute(
        f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_bbox_y ON {TABLE_NAME} (bbox_miny, bbox_maxy)"
    )


def count_rows(conn: sqlite3.Connection) -> int:
    row = conn.execute(f"SELECT COUNT(*) AS count FROM {TABLE_NAME}").fetchone()
    return int(row[0]) if row is not None else 0


def fetch_source_etag(conn: sqlite3.Connection) -> str | None:
    row = conn.execute(
        f"SELECT source_fgb_etag FROM {TABLE_NAME} ORDER BY updated_at DESC LIMIT 1"
    ).fetchone()
    if row is None:
        return None
    return str(row[0] or "").strip() or None


def fetch_render_items_by_pnus(conn: sqlite3.Connection, *, pnus: Sequence[str]) -> list[sqlite3.Row]:
    if not pnus:
        return []
    placeholders = ",".join("?" for _ in pnus)
    cursor = conn.execute(
        f"""
        SELECT
            pnu,
            bbox_minx,
            bbox_miny,
            bbox_maxx,
            bbox_maxy,
            center_x,
            center_y,
            geom_geojson_full,
            geom_geojson_mid,
            geom_geojson_low,
            source_fgb_etag,
            source_crs
        FROM {TABLE_NAME}
        WHERE pnu IN ({placeholders})
        """,
        tuple(pnus),
    )
    return list(cursor.fetchall())


def _create_table(cursor: sqlite3.Cursor, table_name: str) -> None:
    cursor.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {table_name} (
            pnu TEXT PRIMARY KEY,
            bbox_minx REAL NOT NULL,
            bbox_miny REAL NOT NULL,
            bbox_maxx REAL NOT NULL,
            bbox_maxy REAL NOT NULL,
            center_x REAL NOT NULL,
            center_y REAL NOT NULL,
            area_m2 REAL,
            vertex_count INTEGER,
            geom_geojson_full TEXT NOT NULL,
            geom_geojson_mid TEXT,
            geom_geojson_low TEXT,
            label_x REAL,
            label_y REAL,
            source_fgb_etag TEXT NOT NULL,
            source_fgb_path TEXT NOT NULL,
            source_crs TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
