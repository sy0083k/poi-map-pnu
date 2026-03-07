import sqlite3
from typing import Sequence

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


def insert_web_visit_event(
    conn: sqlite3.Connection,
    *,
    anon_id: str,
    session_id: str,
    event_type: str,
    page_path: str,
    occurred_at: str,
    client_tz: str | None,
    user_agent: str | None,
    is_bot: bool,
    referrer_domain: str | None = None,
    referrer_path: str | None = None,
    utm_source: str | None = None,
    utm_medium: str | None = None,
    utm_campaign: str | None = None,
    utm_term: str | None = None,
    utm_content: str | None = None,
    page_query: str | None = None,
    client_lang: str | None = None,
    platform: str | None = None,
    screen_width: int | None = None,
    screen_height: int | None = None,
    viewport_width: int | None = None,
    viewport_height: int | None = None,
    browser_family: str | None = None,
    device_type: str | None = None,
    os_family: str | None = None,
    traffic_channel: str | None = None,
) -> None:
    cursor = conn.cursor()
    placeholders = ", ".join(["?"] * len(WEB_VISIT_INSERT_COLUMNS))
    insert_columns = ", ".join(WEB_VISIT_INSERT_COLUMNS)
    cursor.execute(
        f"INSERT INTO web_visit_event ({insert_columns}) VALUES ({placeholders})",
        (
            anon_id,
            session_id,
            event_type,
            page_path,
            occurred_at,
            client_tz,
            user_agent,
            1 if is_bot else 0,
            referrer_domain,
            referrer_path,
            utm_source,
            utm_medium,
            utm_campaign,
            utm_term,
            utm_content,
            page_query,
            client_lang,
            platform,
            screen_width,
            screen_height,
            viewport_width,
            viewport_height,
            browser_family,
            device_type,
            os_family,
            traffic_channel,
        ),
    )


def fetch_web_total_visitors(conn: sqlite3.Connection, *, page_path: str | None = None) -> int:
    cursor = conn.cursor()
    if page_path is None:
        cursor.execute(
            """
            SELECT COUNT(DISTINCT anon_id)
              FROM web_visit_event
             WHERE is_bot = 0
            """
        )
    else:
        cursor.execute(
            """
            SELECT COUNT(DISTINCT anon_id)
              FROM web_visit_event
             WHERE page_path = ?
               AND is_bot = 0
            """,
            (page_path,),
        )
    row = cursor.fetchone()
    return int(row[0] or 0) if row else 0


def fetch_web_daily_visitors(
    conn: sqlite3.Connection, *, page_path: str | None = None, since_utc: str, until_utc: str
) -> int:
    cursor = conn.cursor()
    if page_path is None:
        cursor.execute(
            """
            SELECT COUNT(DISTINCT anon_id)
              FROM web_visit_event
             WHERE is_bot = 0
               AND occurred_at >= ?
               AND occurred_at < ?
            """,
            (since_utc, until_utc),
        )
    else:
        cursor.execute(
            """
            SELECT COUNT(DISTINCT anon_id)
              FROM web_visit_event
             WHERE page_path = ?
               AND is_bot = 0
               AND occurred_at >= ?
               AND occurred_at < ?
            """,
            (page_path, since_utc, until_utc),
        )
    row = cursor.fetchone()
    return int(row[0] or 0) if row else 0


def fetch_web_session_durations_seconds(
    conn: sqlite3.Connection,
    *,
    page_path: str | None = None,
    since_utc: str,
) -> Sequence[sqlite3.Row]:
    cursor = conn.cursor()
    if page_path is None:
        cursor.execute(
            """
            SELECT
                session_id,
                (MAX(strftime('%s', occurred_at)) - MIN(strftime('%s', occurred_at))) AS duration_seconds,
                DATE(datetime(MAX(occurred_at), '+9 hours')) AS kst_date
              FROM web_visit_event
             WHERE is_bot = 0
               AND occurred_at >= ?
             GROUP BY session_id
             ORDER BY kst_date ASC
            """,
            (since_utc,),
        )
    else:
        cursor.execute(
            """
            SELECT
                session_id,
                (MAX(strftime('%s', occurred_at)) - MIN(strftime('%s', occurred_at))) AS duration_seconds,
                DATE(datetime(MAX(occurred_at), '+9 hours')) AS kst_date
              FROM web_visit_event
             WHERE page_path = ?
               AND is_bot = 0
               AND occurred_at >= ?
             GROUP BY session_id
             ORDER BY kst_date ASC
            """,
            (page_path, since_utc),
        )
    return cursor.fetchall()


def fetch_web_daily_unique_visitors_trend(
    conn: sqlite3.Connection,
    *,
    page_path: str | None = None,
    since_utc: str,
) -> Sequence[sqlite3.Row]:
    cursor = conn.cursor()
    if page_path is None:
        cursor.execute(
            """
            SELECT
                DATE(datetime(occurred_at, '+9 hours')) AS date,
                COUNT(DISTINCT anon_id) AS visitors
              FROM web_visit_event
             WHERE is_bot = 0
               AND occurred_at >= ?
             GROUP BY DATE(datetime(occurred_at, '+9 hours'))
             ORDER BY DATE(datetime(occurred_at, '+9 hours')) ASC
            """,
            (since_utc,),
        )
    else:
        cursor.execute(
            """
            SELECT
                DATE(datetime(occurred_at, '+9 hours')) AS date,
                COUNT(DISTINCT anon_id) AS visitors
              FROM web_visit_event
             WHERE page_path = ?
               AND is_bot = 0
               AND occurred_at >= ?
             GROUP BY DATE(datetime(occurred_at, '+9 hours'))
             ORDER BY DATE(datetime(occurred_at, '+9 hours')) ASC
            """,
            (page_path, since_utc),
        )
    return cursor.fetchall()


def fetch_web_top_referrer_domains(
    conn: sqlite3.Connection, *, since_utc: str, limit: int
) -> Sequence[sqlite3.Row]:
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT referrer_domain AS key, COUNT(*) AS count
          FROM web_visit_event
         WHERE is_bot = 0
           AND occurred_at >= ?
           AND referrer_domain IS NOT NULL
           AND referrer_domain != ''
         GROUP BY referrer_domain
         ORDER BY count DESC, referrer_domain ASC
         LIMIT ?
        """,
        (since_utc, limit),
    )
    return cursor.fetchall()


def fetch_web_top_utm_sources(
    conn: sqlite3.Connection, *, since_utc: str, limit: int
) -> Sequence[sqlite3.Row]:
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT utm_source AS key, COUNT(*) AS count
          FROM web_visit_event
         WHERE is_bot = 0
           AND occurred_at >= ?
           AND utm_source IS NOT NULL
           AND utm_source != ''
         GROUP BY utm_source
         ORDER BY count DESC, utm_source ASC
         LIMIT ?
        """,
        (since_utc, limit),
    )
    return cursor.fetchall()


def fetch_web_top_utm_campaigns(
    conn: sqlite3.Connection, *, since_utc: str, limit: int
) -> Sequence[sqlite3.Row]:
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT utm_campaign AS key, COUNT(*) AS count
          FROM web_visit_event
         WHERE is_bot = 0
           AND occurred_at >= ?
           AND utm_campaign IS NOT NULL
           AND utm_campaign != ''
         GROUP BY utm_campaign
         ORDER BY count DESC, utm_campaign ASC
         LIMIT ?
        """,
        (since_utc, limit),
    )
    return cursor.fetchall()


def fetch_web_device_breakdown(
    conn: sqlite3.Connection, *, since_utc: str
) -> Sequence[sqlite3.Row]:
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT COALESCE(NULLIF(device_type, ''), 'unknown') AS key, COUNT(*) AS count
          FROM web_visit_event
         WHERE is_bot = 0
           AND occurred_at >= ?
         GROUP BY COALESCE(NULLIF(device_type, ''), 'unknown')
         ORDER BY count DESC, key ASC
        """,
        (since_utc,),
    )
    return cursor.fetchall()


def fetch_web_browser_breakdown(
    conn: sqlite3.Connection, *, since_utc: str
) -> Sequence[sqlite3.Row]:
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT COALESCE(NULLIF(browser_family, ''), 'unknown') AS key, COUNT(*) AS count
          FROM web_visit_event
         WHERE is_bot = 0
           AND occurred_at >= ?
         GROUP BY COALESCE(NULLIF(browser_family, ''), 'unknown')
         ORDER BY count DESC, key ASC
        """,
        (since_utc,),
    )
    return cursor.fetchall()


def fetch_web_top_page_paths(
    conn: sqlite3.Connection, *, since_utc: str, limit: int
) -> Sequence[sqlite3.Row]:
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT page_path AS key, COUNT(*) AS count
          FROM web_visit_event
         WHERE is_bot = 0
           AND occurred_at >= ?
         GROUP BY page_path
         ORDER BY count DESC, page_path ASC
         LIMIT ?
        """,
        (since_utc, limit),
    )
    return cursor.fetchall()


def fetch_web_channel_breakdown(
    conn: sqlite3.Connection, *, since_utc: str
) -> Sequence[sqlite3.Row]:
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT COALESCE(NULLIF(traffic_channel, ''), 'unknown') AS key, COUNT(*) AS count
          FROM web_visit_event
         WHERE is_bot = 0
           AND occurred_at >= ?
         GROUP BY COALESCE(NULLIF(traffic_channel, ''), 'unknown')
         ORDER BY count DESC, key ASC
        """,
        (since_utc,),
    )
    return cursor.fetchall()


def _ensure_web_visit_columns(conn: sqlite3.Connection) -> None:
    cursor = conn.cursor()
    columns = cursor.execute("PRAGMA table_info(web_visit_event)").fetchall()
    column_names = {str(row[1]) for row in columns}
    for name, sql_type in WEB_VISIT_EXT_COLUMNS:
        if name not in column_names:
            cursor.execute(f"ALTER TABLE web_visit_event ADD COLUMN {name} {sql_type}")
