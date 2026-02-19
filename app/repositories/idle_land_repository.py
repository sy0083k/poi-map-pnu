import sqlite3
from typing import Iterable, Sequence


def init_db(conn: sqlite3.Connection) -> None:
    cursor = conn.cursor()
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS idle_land (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            address TEXT,
            land_type TEXT,
            area REAL,
            adm_property TEXT,
            gen_property TEXT,
            contact TEXT,
            geom TEXT
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS geom_update_jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            status TEXT NOT NULL DEFAULT 'pending',
            attempts INTEGER NOT NULL DEFAULT 0,
            updated_count INTEGER NOT NULL DEFAULT 0,
            failed_count INTEGER NOT NULL DEFAULT 0,
            error_message TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.commit()


def fetch_lands_with_geom(conn: sqlite3.Connection) -> Sequence[sqlite3.Row]:
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM idle_land WHERE geom IS NOT NULL")
    return cursor.fetchall()


def fetch_lands_with_geom_page(
    conn: sqlite3.Connection,
    *,
    after_id: int | None,
    limit: int,
) -> Sequence[sqlite3.Row]:
    cursor = conn.cursor()
    if after_id is None:
        cursor.execute("SELECT * FROM idle_land WHERE geom IS NOT NULL ORDER BY id LIMIT ?", (limit,))
    else:
        cursor.execute(
            "SELECT * FROM idle_land WHERE geom IS NOT NULL AND id > ? ORDER BY id LIMIT ?",
            (after_id, limit),
        )
    return cursor.fetchall()


def delete_all(conn: sqlite3.Connection) -> None:
    cursor = conn.cursor()
    cursor.execute("DELETE FROM idle_land")


def insert_land(
    conn: sqlite3.Connection,
    *,
    address: str,
    land_type: str,
    area: float,
    adm_property: str,
    gen_property: str,
    contact: str,
) -> None:
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO idle_land (address, land_type, area, adm_property, gen_property, contact, geom)
        VALUES (?,?,?,?,?,?,NULL)
        """,
        (
            address,
            land_type,
            area,
            adm_property,
            gen_property,
            contact,
        ),
    )


def fetch_missing_geom(conn: sqlite3.Connection, *, limit: int | None = None) -> Iterable[tuple[int, str]]:
    cursor = conn.cursor()
    if limit is None:
        cursor.execute("SELECT id, address FROM idle_land WHERE geom IS NULL ORDER BY id")
    else:
        cursor.execute("SELECT id, address FROM idle_land WHERE geom IS NULL ORDER BY id LIMIT ?", (limit,))
    return cursor.fetchall()


def update_geom(conn: sqlite3.Connection, item_id: int, geom: str) -> None:
    cursor = conn.cursor()
    cursor.execute("UPDATE idle_land SET geom = ? WHERE id = ?", (geom, item_id))


def count_missing_geom(conn: sqlite3.Connection) -> int:
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM idle_land WHERE geom IS NULL")
    row = cursor.fetchone()
    return int(row[0]) if row else 0


def create_geom_update_job(conn: sqlite3.Connection) -> int:
    cursor = conn.cursor()
    cursor.execute("INSERT INTO geom_update_jobs (status) VALUES ('pending')")
    return int(cursor.lastrowid)


def mark_geom_job_running(conn: sqlite3.Connection, job_id: int) -> None:
    cursor = conn.cursor()
    cursor.execute(
        """
        UPDATE geom_update_jobs
           SET status = 'running',
               attempts = attempts + 1,
               updated_at = CURRENT_TIMESTAMP
         WHERE id = ?
        """,
        (job_id,),
    )


def mark_geom_job_done(conn: sqlite3.Connection, job_id: int, *, updated_count: int, failed_count: int) -> None:
    cursor = conn.cursor()
    cursor.execute(
        """
        UPDATE geom_update_jobs
           SET status = 'done',
               updated_count = ?,
               failed_count = ?,
               error_message = NULL,
               updated_at = CURRENT_TIMESTAMP
         WHERE id = ?
        """,
        (updated_count, failed_count, job_id),
    )


def mark_geom_job_failed(
    conn: sqlite3.Connection,
    job_id: int,
    *,
    updated_count: int,
    failed_count: int,
    error_message: str,
) -> None:
    cursor = conn.cursor()
    cursor.execute(
        """
        UPDATE geom_update_jobs
           SET status = 'failed',
               updated_count = ?,
               failed_count = ?,
               error_message = ?,
               updated_at = CURRENT_TIMESTAMP
         WHERE id = ?
        """,
        (updated_count, failed_count, error_message, job_id),
    )
