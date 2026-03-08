import sqlite3

WEB_VISIT_EXT_COLUMNS: tuple[tuple[str, str], ...] = (
    ("referrer_domain", "TEXT"),
    ("referrer_path", "TEXT"),
    ("utm_source", "TEXT"),
    ("utm_medium", "TEXT"),
    ("utm_campaign", "TEXT"),
    ("utm_term", "TEXT"),
    ("utm_content", "TEXT"),
    ("page_query", "TEXT"),
    ("client_lang", "TEXT"),
    ("platform", "TEXT"),
    ("screen_width", "INTEGER"),
    ("screen_height", "INTEGER"),
    ("viewport_width", "INTEGER"),
    ("viewport_height", "INTEGER"),
    ("browser_family", "TEXT"),
    ("device_type", "TEXT"),
    ("os_family", "TEXT"),
    ("traffic_channel", "TEXT"),
)

WEB_VISIT_INSERT_COLUMNS: tuple[str, ...] = (
    "anon_id",
    "session_id",
    "event_type",
    "page_path",
    "occurred_at",
    "client_tz",
    "user_agent",
    "is_bot",
    "referrer_domain",
    "referrer_path",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "page_query",
    "client_lang",
    "platform",
    "screen_width",
    "screen_height",
    "viewport_width",
    "viewport_height",
    "browser_family",
    "device_type",
    "os_family",
    "traffic_channel",
)


def init_web_visit_schema(conn: sqlite3.Connection) -> None:
    cursor = conn.cursor()
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS web_visit_event (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            anon_id TEXT NOT NULL,
            session_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            page_path TEXT NOT NULL,
            occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            client_tz TEXT,
            user_agent TEXT,
            is_bot INTEGER NOT NULL DEFAULT 0,
            referrer_domain TEXT,
            referrer_path TEXT,
            utm_source TEXT,
            utm_medium TEXT,
            utm_campaign TEXT,
            utm_term TEXT,
            utm_content TEXT,
            page_query TEXT,
            client_lang TEXT,
            platform TEXT,
            screen_width INTEGER,
            screen_height INTEGER,
            viewport_width INTEGER,
            viewport_height INTEGER,
            browser_family TEXT,
            device_type TEXT,
            os_family TEXT,
            traffic_channel TEXT
        )
        """
    )
    _ensure_web_visit_columns(conn)
    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_web_visit_page_occurred
            ON web_visit_event (page_path, occurred_at)
        """
    )
    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_web_visit_anon_occurred
            ON web_visit_event (anon_id, occurred_at)
        """
    )
    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_web_visit_session_occurred
            ON web_visit_event (session_id, occurred_at)
        """
    )
    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_web_visit_event_type_occurred
            ON web_visit_event (event_type, occurred_at)
        """
    )
    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_web_visit_utm_occurred
            ON web_visit_event (utm_source, utm_medium, occurred_at)
        """
    )
    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_web_visit_referrer_occurred
            ON web_visit_event (referrer_domain, occurred_at)
        """
    )
    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_web_visit_channel_occurred
            ON web_visit_event (traffic_channel, occurred_at)
        """
    )
    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_web_visit_device_browser_occurred
            ON web_visit_event (device_type, browser_family, occurred_at)
        """
    )


def _ensure_web_visit_columns(conn: sqlite3.Connection) -> None:
    cursor = conn.cursor()
    columns = cursor.execute("PRAGMA table_info(web_visit_event)").fetchall()
    column_names = {str(row[1]) for row in columns}
    for name, sql_type in WEB_VISIT_EXT_COLUMNS:
        if name not in column_names:
            cursor.execute(f"ALTER TABLE web_visit_event ADD COLUMN {name} {sql_type}")
