import sqlite3
from typing import Sequence

from app.repositories.land_repository_schema import CACHE_TABLE_NAME, init_land_schema


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
