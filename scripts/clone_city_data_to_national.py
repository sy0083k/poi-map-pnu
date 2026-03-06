#!/usr/bin/env python3
"""One-time copy from poi_city (/siyu) to poi (/gukgongyu)."""

from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path

CITY_TABLE_NAME = "poi_city"
NATIONAL_TABLE_NAME = "poi"

COLUMNS = (
    "pnu",
    "address",
    "land_type",
    "area",
    "property_manager",
    "source_fields_json",
    "adm_property",
    "gen_property",
    "contact",
    "geom",
    "geom_status",
    "geom_error",
)


def count_rows(conn: sqlite3.Connection, table_name: str) -> int:
    cursor = conn.cursor()
    cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
    row = cursor.fetchone()
    return int(row[0]) if row else 0


def clone_city_to_national(db_path: Path, dry_run: bool) -> None:
    with sqlite3.connect(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {CITY_TABLE_NAME} (
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
        cursor.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {NATIONAL_TABLE_NAME} (
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
        conn.commit()

        city_count = count_rows(conn, CITY_TABLE_NAME)
        national_before = count_rows(conn, NATIONAL_TABLE_NAME)
        print(
            f"[clone] source={CITY_TABLE_NAME}:{city_count} "
            f"target_before={NATIONAL_TABLE_NAME}:{national_before}"
        )

        if dry_run:
            print("[clone] dry-run mode: no data changed")
            return

        column_csv = ", ".join(COLUMNS)
        cursor = conn.cursor()
        cursor.execute("BEGIN IMMEDIATE")
        cursor.execute(f"DELETE FROM {NATIONAL_TABLE_NAME}")
        cursor.execute(
            f"""
            INSERT INTO {NATIONAL_TABLE_NAME} ({column_csv})
            SELECT {column_csv}
              FROM {CITY_TABLE_NAME}
            """
        )
        conn.commit()

        national_after = count_rows(conn, NATIONAL_TABLE_NAME)
        if national_after != city_count:
            raise RuntimeError(
                f"row-count mismatch after clone: source={city_count}, target={national_after}"
            )
        print(
            f"[clone] completed: source={city_count} "
            f"target_after={national_after}"
        )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Clone poi_city(/siyu) data to poi(/gukgongyu) once."
    )
    parser.add_argument(
        "--db-path",
        default="data/database.db",
        help="SQLite database path (default: data/database.db)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print source/target counts without modifying data",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    clone_city_to_national(Path(args.db_path), dry_run=bool(args.dry_run))


if __name__ == "__main__":
    main()
