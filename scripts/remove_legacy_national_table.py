#!/usr/bin/env python3
"""Drop legacy national-public table (poi) from SQLite database."""

from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path

LEGACY_TABLE_NAME = "poi"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Remove legacy national-public table from database.")
    parser.add_argument(
        "--db-path",
        default="data/database.db",
        help="SQLite database path (default: data/database.db)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only report whether legacy table exists",
    )
    return parser.parse_args()


def table_exists(conn: sqlite3.Connection, name: str) -> bool:
    cursor = conn.cursor()
    cursor.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?", (name,))
    return cursor.fetchone() is not None


def main() -> None:
    args = parse_args()
    db_path = Path(args.db_path)

    with sqlite3.connect(db_path) as conn:
        exists = table_exists(conn, LEGACY_TABLE_NAME)
        print(f"[legacy-table] {LEGACY_TABLE_NAME} exists={exists}")
        if args.dry_run:
            return
        if not exists:
            print("[legacy-table] no action needed")
            return
        conn.execute(f"DROP TABLE {LEGACY_TABLE_NAME}")
        conn.commit()
        print(f"[legacy-table] dropped table {LEGACY_TABLE_NAME}")


if __name__ == "__main__":
    main()
