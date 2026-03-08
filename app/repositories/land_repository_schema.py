import sqlite3

TABLE_NAME = "poi_city"
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
            property_usage TEXT,
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


def _ensure_land_columns(conn: sqlite3.Connection, *, table_name: str = TABLE_NAME) -> None:
    cursor = conn.cursor()
    columns = cursor.execute(f"PRAGMA table_info({table_name})").fetchall()
    names = {str(row[1]) for row in columns}
    if "pnu" not in names:
        cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN pnu TEXT NOT NULL DEFAULT ''")
    if "property_manager" not in names:
        cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN property_manager TEXT")
    if "property_usage" not in names:
        cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN property_usage TEXT")
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
