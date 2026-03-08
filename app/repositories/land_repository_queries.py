import sqlite3
from typing import Iterable, Sequence

from app.repositories.land_repository_schema import TABLE_NAME, init_land_schema


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


def count_failed_geom(conn: sqlite3.Connection) -> int:
    init_land_schema(conn)
    cursor = conn.cursor()
    cursor.execute(f"SELECT COUNT(*) FROM {TABLE_NAME} WHERE geom_status = 'failed'")
    row = cursor.fetchone()
    return int(row[0]) if row else 0
