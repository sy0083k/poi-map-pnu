import sqlite3
from typing import Iterable, Sequence

TABLE_NAME = "poi_city"
CITY_TABLE_NAME = "poi_city"
CACHE_TABLE_NAME = "cadastral_polygon_cache"


def init_land_schema(conn: sqlite3.Connection, *, table_name: str = TABLE_NAME) -> None:
    cursor = conn.cursor()
    cursor.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {table_name} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pnu TEXT NOT NULL DEFAULT '',
            address TEXT,
            land_type TEXT,
            area REAL,
            property_manager TEXT,
            source_fields_json TEXT,
            adm_property TEXT,
            gen_property TEXT,
            contact TEXT,
            geom TEXT,
            geom_status TEXT NOT NULL DEFAULT 'pending',
            geom_error TEXT
        )
        """
    )
    _ensure_land_columns(conn, table_name=table_name)
    cursor.execute(f"CREATE INDEX IF NOT EXISTS idx_{table_name}_pnu ON {table_name} (pnu)")
    cursor.execute(f"CREATE INDEX IF NOT EXISTS idx_{table_name}_geom_status ON {table_name} (geom_status)")
    cursor.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {CACHE_TABLE_NAME} (
            pnu TEXT PRIMARY KEY,
            geom TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            error TEXT,
            fetched_at TEXT,
            validation_version INTEGER NOT NULL DEFAULT 0
        )
        """
    )
    _ensure_cache_columns(conn)
    cursor.execute(f"CREATE INDEX IF NOT EXISTS idx_{CACHE_TABLE_NAME}_status ON {CACHE_TABLE_NAME} (status)")


def fetch_lands_with_geom(conn: sqlite3.Connection, *, table_name: str = TABLE_NAME) -> Sequence[sqlite3.Row]:
    init_land_schema(conn, table_name=table_name)
    cursor = conn.cursor()
    cursor.execute(f"SELECT * FROM {table_name} WHERE geom IS NOT NULL")
    return cursor.fetchall()


def fetch_lands_with_geom_page(
    conn: sqlite3.Connection,
    *,
    after_id: int | None,
    limit: int,
    table_name: str = TABLE_NAME,
) -> Sequence[sqlite3.Row]:
    init_land_schema(conn, table_name=table_name)
    cursor = conn.cursor()
    if after_id is None:
        cursor.execute(f"SELECT * FROM {table_name} WHERE geom IS NOT NULL ORDER BY id LIMIT ?", (limit,))
    else:
        cursor.execute(
            f"SELECT * FROM {table_name} WHERE geom IS NOT NULL AND id > ? ORDER BY id LIMIT ?",
            (after_id, limit),
        )
    return cursor.fetchall()


def fetch_lands_page_without_geom(
    conn: sqlite3.Connection,
    *,
    after_id: int | None,
    limit: int,
    table_name: str = TABLE_NAME,
) -> Sequence[sqlite3.Row]:
    init_land_schema(conn, table_name=table_name)
    cursor = conn.cursor()
    if after_id is None:
        cursor.execute(
            f"""
            SELECT id, pnu, address, land_type, area, property_manager, source_fields_json
              FROM {table_name}
             ORDER BY id
             LIMIT ?
            """,
            (limit,),
        )
    else:
        cursor.execute(
            f"""
            SELECT id, pnu, address, land_type, area, property_manager, source_fields_json
              FROM {table_name}
             WHERE id > ?
             ORDER BY id
             LIMIT ?
            """,
            (after_id, limit),
        )
    return cursor.fetchall()


def fetch_lands_by_ids(
    conn: sqlite3.Connection,
    *,
    ids: Sequence[int],
    table_name: str = TABLE_NAME,
) -> Sequence[sqlite3.Row]:
    init_land_schema(conn, table_name=table_name)
    if not ids:
        return []

    # Keep room under SQLite variable limit.
    chunk_size = 900
    rows: list[sqlite3.Row] = []
    for start in range(0, len(ids), chunk_size):
        chunk = ids[start : start + chunk_size]
        placeholders = ",".join("?" for _ in chunk)
        cursor = conn.cursor()
        cursor.execute(
            f"""
            SELECT id, pnu, address, land_type, area, property_manager, source_fields_json
              FROM {table_name}
             WHERE id IN ({placeholders})
            """,
            tuple(chunk),
        )
        rows.extend(cursor.fetchall())

    return rows


def delete_all(conn: sqlite3.Connection, *, table_name: str = TABLE_NAME) -> None:
    init_land_schema(conn, table_name=table_name)
    cursor = conn.cursor()
    cursor.execute(f"DELETE FROM {table_name}")


def insert_land(
    conn: sqlite3.Connection,
    *,
    pnu: str = "",
    address: str,
    land_type: str,
    area: float,
    property_manager: str = "",
    source_fields_json: str = "[]",
    adm_property: str = "",
    gen_property: str = "",
    contact: str = "",
    table_name: str = TABLE_NAME,
) -> None:
    init_land_schema(conn, table_name=table_name)
    cursor = conn.cursor()
    cursor.execute(
        f"""
        INSERT INTO {table_name} (pnu, address, land_type, area, property_manager, source_fields_json, adm_property, gen_property, contact, geom, geom_status, geom_error)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
        """,
        (
            pnu,
            address,
            land_type,
            area,
            property_manager,
            source_fields_json,
            adm_property,
            gen_property,
            contact,
            None,
            "pending",
            None,
        ),
    )


def fetch_missing_geom(conn: sqlite3.Connection, *, limit: int | None = None) -> Iterable[tuple[int, str]]:
    init_land_schema(conn)
    cursor = conn.cursor()
    if limit is None:
        cursor.execute(
            f"""
            SELECT id, pnu
              FROM {TABLE_NAME}
             WHERE geom_status IN ('pending', 'failed')
             ORDER BY id
            """
        )
    else:
        cursor.execute(
            f"""
            SELECT id, pnu
              FROM {TABLE_NAME}
             WHERE geom_status IN ('pending', 'failed')
             ORDER BY id
             LIMIT ?
            """,
            (limit,),
        )
    return cursor.fetchall()


def update_geom(conn: sqlite3.Connection, item_id: int, geom: str) -> None:
    init_land_schema(conn)
    cursor = conn.cursor()
    cursor.execute(
        f"UPDATE {TABLE_NAME} SET geom = ?, geom_status = 'done', geom_error = NULL WHERE id = ?",
        (geom, item_id),
    )


def update_geom_by_pnu(conn: sqlite3.Connection, pnu: str, geom: str) -> None:
    init_land_schema(conn)
    cursor = conn.cursor()
    cursor.execute(
        f"UPDATE {TABLE_NAME} SET geom = ?, geom_status = 'done', geom_error = NULL WHERE pnu = ?",
        (geom, pnu),
    )


def mark_geom_failed_by_pnu(conn: sqlite3.Connection, pnu: str, error_message: str) -> None:
    init_land_schema(conn)
    cursor = conn.cursor()
    cursor.execute(
        f"UPDATE {TABLE_NAME} SET geom_status = 'failed', geom_error = ? WHERE pnu = ?",
        (error_message[:500], pnu),
    )


def count_missing_geom(conn: sqlite3.Connection) -> int:
    init_land_schema(conn)
    cursor = conn.cursor()
    cursor.execute(f"SELECT COUNT(*) FROM {TABLE_NAME} WHERE geom_status IN ('pending', 'failed')")
    row = cursor.fetchone()
    return int(row[0]) if row else 0


def count_all_lands(conn: sqlite3.Connection, *, table_name: str = TABLE_NAME) -> int:
    init_land_schema(conn, table_name=table_name)
    cursor = conn.cursor()
    cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
    row = cursor.fetchone()
    return int(row[0]) if row else 0


def fetch_distinct_pnu(conn: sqlite3.Connection) -> Sequence[str]:
    init_land_schema(conn)
    cursor = conn.cursor()
    cursor.execute(
        f"""
        SELECT DISTINCT pnu
          FROM {TABLE_NAME}
         WHERE pnu IS NOT NULL
           AND pnu != ''
         ORDER BY pnu
        """
    )
    return [str(row[0]) for row in cursor.fetchall()]


def fetch_failed_pnu(conn: sqlite3.Connection, *, limit: int = 1000) -> Sequence[str]:
    init_land_schema(conn)
    cursor = conn.cursor()
    cursor.execute(
        f"""
        SELECT DISTINCT pnu
          FROM {TABLE_NAME}
         WHERE geom_status = 'failed'
           AND pnu IS NOT NULL
           AND pnu != ''
         ORDER BY pnu
         LIMIT ?
        """,
        (limit,),
    )
    return [str(row[0]) for row in cursor.fetchall()]


def fetch_cached_cadastral_by_pnus(conn: sqlite3.Connection, pnus: Sequence[str]) -> dict[str, sqlite3.Row]:
    init_land_schema(conn)
    if not pnus:
        return {}
    cursor = conn.cursor()
    placeholders = ",".join("?" for _ in pnus)
    cursor.execute(
        f"""
        SELECT pnu, geom, status, error, fetched_at, validation_version
          FROM {CACHE_TABLE_NAME}
         WHERE pnu IN ({placeholders})
        """,
        tuple(pnus),
    )
    return {str(row["pnu"]): row for row in cursor.fetchall()}


def upsert_cadastral_cache(
    conn: sqlite3.Connection,
    *,
    pnu: str,
    geom: str | None,
    status: str,
    error: str | None,
    fetched_at: str,
    validation_version: int = 0,
) -> None:
    init_land_schema(conn)
    cursor = conn.cursor()
    cursor.execute(
        f"""
        INSERT INTO {CACHE_TABLE_NAME} (pnu, geom, status, error, fetched_at, validation_version)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(pnu) DO UPDATE SET
            geom=excluded.geom,
            status=excluded.status,
            error=excluded.error,
            fetched_at=excluded.fetched_at,
            validation_version=excluded.validation_version
        """,
        (pnu, geom, status, (error or "")[:500] if error else None, fetched_at, int(validation_version)),
    )


def count_failed_geom(conn: sqlite3.Connection) -> int:
    init_land_schema(conn)
    cursor = conn.cursor()
    cursor.execute(f"SELECT COUNT(*) FROM {TABLE_NAME} WHERE geom_status = 'failed'")
    row = cursor.fetchone()
    return int(row[0]) if row else 0


def _ensure_land_columns(conn: sqlite3.Connection, *, table_name: str = TABLE_NAME) -> None:
    cursor = conn.cursor()
    columns = cursor.execute(f"PRAGMA table_info({table_name})").fetchall()
    names = {str(row[1]) for row in columns}
    if "pnu" not in names:
        cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN pnu TEXT NOT NULL DEFAULT ''")
    if "property_manager" not in names:
        cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN property_manager TEXT")
    if "source_fields_json" not in names:
        cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN source_fields_json TEXT")
    if "geom_status" not in names:
        cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN geom_status TEXT NOT NULL DEFAULT 'pending'")
    if "geom_error" not in names:
        cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN geom_error TEXT")


def _ensure_cache_columns(conn: sqlite3.Connection) -> None:
    cursor = conn.cursor()
    columns = cursor.execute(f"PRAGMA table_info({CACHE_TABLE_NAME})").fetchall()
    names = {str(row[1]) for row in columns}
    if "validation_version" not in names:
        cursor.execute(
            f"ALTER TABLE {CACHE_TABLE_NAME} ADD COLUMN validation_version INTEGER NOT NULL DEFAULT 0"
        )
