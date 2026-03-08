import sqlite3


def init_event_schema(conn: sqlite3.Connection) -> None:
    cursor = conn.cursor()
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS map_event_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT NOT NULL,
            anon_id TEXT,
            land_address TEXT,
            region_name TEXT,
            min_area_value REAL,
            min_area_bucket TEXT,
            region_source TEXT NOT NULL DEFAULT 'derived_address',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS raw_query_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT NOT NULL,
            anon_id TEXT,
            raw_region_query TEXT,
            raw_min_area_input TEXT,
            raw_max_area_input TEXT,
            raw_rent_only_input TEXT,
            raw_land_id_input TEXT,
            raw_land_address_input TEXT,
            raw_click_source_input TEXT,
            raw_payload_json TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    _ensure_map_event_log_columns(conn)
    _ensure_raw_query_log_columns(conn)
    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_map_event_type_created
            ON map_event_log (event_type, created_at)
        """
    )
    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_map_event_region
            ON map_event_log (event_type, region_name)
        """
    )
    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_map_event_min_area_bucket
            ON map_event_log (event_type, min_area_bucket)
        """
    )
    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_map_event_land_address
            ON map_event_log (event_type, land_address)
        """
    )
    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_map_event_land_anon
            ON map_event_log (event_type, land_address, anon_id)
        """
    )
    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_raw_query_event_created
            ON raw_query_log (event_type, created_at)
        """
    )
    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_raw_query_created
            ON raw_query_log (created_at)
        """
    )


def _ensure_map_event_log_columns(conn: sqlite3.Connection) -> None:
    cursor = conn.cursor()
    columns = cursor.execute("PRAGMA table_info(map_event_log)").fetchall()
    column_names = {str(row[1]) for row in columns}
    if "region_source" not in column_names:
        cursor.execute(
            "ALTER TABLE map_event_log ADD COLUMN region_source TEXT NOT NULL DEFAULT 'derived_address'"
        )


def _ensure_raw_query_log_columns(conn: sqlite3.Connection) -> None:
    cursor = conn.cursor()
    columns = cursor.execute("PRAGMA table_info(raw_query_log)").fetchall()
    column_names = {str(row[1]) for row in columns}
    if "raw_click_source_input" not in column_names:
        cursor.execute("ALTER TABLE raw_query_log ADD COLUMN raw_click_source_input TEXT")
