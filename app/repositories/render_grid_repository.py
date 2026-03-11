import sqlite3
from collections.abc import Iterable, Sequence

CELL_TABLE_NAME = "render_grid_cell"
CELL_STAGING_TABLE_NAME = "render_grid_cell_staging"
PARCEL_TABLE_NAME = "render_grid_parcel"
PARCEL_STAGING_TABLE_NAME = "render_grid_parcel_staging"


def init_schema(conn: sqlite3.Connection) -> None:
    cursor = conn.cursor()
    _create_cell_table(cursor, CELL_TABLE_NAME)
    _create_parcel_table(cursor, PARCEL_TABLE_NAME, cell_table_name=CELL_TABLE_NAME)
    _create_indexes(cursor)


def prepare_staging_tables(conn: sqlite3.Connection) -> None:
    cursor = conn.cursor()
    cursor.execute(f"DROP TABLE IF EXISTS {CELL_STAGING_TABLE_NAME}")
    cursor.execute(f"DROP TABLE IF EXISTS {PARCEL_STAGING_TABLE_NAME}")
    _create_cell_table(cursor, CELL_STAGING_TABLE_NAME)
    _create_parcel_table(cursor, PARCEL_STAGING_TABLE_NAME, cell_table_name=CELL_STAGING_TABLE_NAME)


def bulk_insert_staging_cells(conn: sqlite3.Connection, rows: Iterable[dict[str, object]]) -> None:
    cursor = conn.cursor()
    cursor.executemany(
        f"""
        INSERT INTO {CELL_STAGING_TABLE_NAME} (
            cell_id,
            grid_level,
            minx,
            miny,
            maxx,
            maxy
        ) VALUES (
            :cell_id,
            :grid_level,
            :minx,
            :miny,
            :maxx,
            :maxy
        )
        """,
        list(rows),
    )


def bulk_insert_staging_parcels(conn: sqlite3.Connection, rows: Iterable[dict[str, object]]) -> None:
    cursor = conn.cursor()
    cursor.executemany(
        f"""
        INSERT INTO {PARCEL_STAGING_TABLE_NAME} (
            cell_id,
            pnu,
            lod_level
        ) VALUES (
            :cell_id,
            :pnu,
            :lod_level
        )
        """,
        list(rows),
    )


def swap_staging_tables(conn: sqlite3.Connection) -> None:
    cursor = conn.cursor()
    cursor.execute(f"DROP TABLE IF EXISTS {CELL_TABLE_NAME}_backup")
    cursor.execute(f"DROP TABLE IF EXISTS {PARCEL_TABLE_NAME}_backup")
    cursor.execute(f"ALTER TABLE {CELL_TABLE_NAME} RENAME TO {CELL_TABLE_NAME}_backup")
    cursor.execute(f"ALTER TABLE {PARCEL_TABLE_NAME} RENAME TO {PARCEL_TABLE_NAME}_backup")
    cursor.execute(f"ALTER TABLE {CELL_STAGING_TABLE_NAME} RENAME TO {CELL_TABLE_NAME}")
    cursor.execute(f"ALTER TABLE {PARCEL_STAGING_TABLE_NAME} RENAME TO {PARCEL_TABLE_NAME}")
    cursor.execute(f"DROP TABLE IF EXISTS {CELL_TABLE_NAME}_backup")
    cursor.execute(f"DROP TABLE IF EXISTS {PARCEL_TABLE_NAME}_backup")
    _create_indexes(cursor)


def count_cells(conn: sqlite3.Connection) -> int:
    row = conn.execute(f"SELECT COUNT(*) FROM {CELL_TABLE_NAME}").fetchone()
    return int(row[0]) if row is not None else 0


def fetch_intersecting_cell_ids(
    conn: sqlite3.Connection,
    *,
    bbox: tuple[float, float, float, float],
    grid_level: int,
) -> list[str]:
    cursor = conn.execute(
        f"""
        SELECT cell_id
        FROM {CELL_TABLE_NAME}
        WHERE grid_level = ?
          AND minx <= ?
          AND maxx >= ?
          AND miny <= ?
          AND maxy >= ?
        """,
        (grid_level, bbox[2], bbox[0], bbox[3], bbox[1]),
    )
    return [str(row[0]) for row in cursor.fetchall()]


def fetch_candidate_pnus_for_cells(
    conn: sqlite3.Connection,
    *,
    cell_ids: Sequence[str],
    requested_pnus: Sequence[str],
) -> list[str]:
    if not cell_ids or not requested_pnus:
        return []
    cell_placeholders = ",".join("?" for _ in cell_ids)
    pnu_placeholders = ",".join("?" for _ in requested_pnus)
    cursor = conn.execute(
        f"""
        SELECT DISTINCT pnu
        FROM {PARCEL_TABLE_NAME}
        WHERE cell_id IN ({cell_placeholders})
          AND pnu IN ({pnu_placeholders})
        ORDER BY pnu
        """,
        tuple(cell_ids) + tuple(requested_pnus),
    )
    return [str(row[0]) for row in cursor.fetchall()]


def _create_cell_table(cursor: sqlite3.Cursor, table_name: str) -> None:
    cursor.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {table_name} (
            cell_id TEXT PRIMARY KEY,
            grid_level INTEGER NOT NULL,
            minx REAL NOT NULL,
            miny REAL NOT NULL,
            maxx REAL NOT NULL,
            maxy REAL NOT NULL
        )
        """
    )


def _create_parcel_table(cursor: sqlite3.Cursor, table_name: str, *, cell_table_name: str) -> None:
    cursor.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {table_name} (
            cell_id TEXT NOT NULL,
            pnu TEXT NOT NULL,
            lod_level INTEGER DEFAULT 0,
            PRIMARY KEY (cell_id, pnu),
            FOREIGN KEY (cell_id) REFERENCES {cell_table_name}(cell_id)
        )
        """
    )


def _create_indexes(cursor: sqlite3.Cursor) -> None:
    cursor.execute(
        f"CREATE INDEX IF NOT EXISTS idx_{CELL_TABLE_NAME}_grid_x ON {CELL_TABLE_NAME} (grid_level, minx, maxx)"
    )
    cursor.execute(
        f"CREATE INDEX IF NOT EXISTS idx_{CELL_TABLE_NAME}_grid_y ON {CELL_TABLE_NAME} (grid_level, miny, maxy)"
    )
    cursor.execute(
        f"CREATE INDEX IF NOT EXISTS idx_{PARCEL_TABLE_NAME}_cell_id ON {PARCEL_TABLE_NAME} (cell_id)"
    )
    cursor.execute(
        f"CREATE INDEX IF NOT EXISTS idx_{PARCEL_TABLE_NAME}_pnu ON {PARCEL_TABLE_NAME} (pnu)"
    )
