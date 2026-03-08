import sqlite3
from typing import Sequence


def fetch_web_top_referrer_domains(conn: sqlite3.Connection, *, since_utc: str, limit: int) -> Sequence[sqlite3.Row]:
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


def fetch_web_top_utm_sources(conn: sqlite3.Connection, *, since_utc: str, limit: int) -> Sequence[sqlite3.Row]:
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


def fetch_web_top_utm_campaigns(conn: sqlite3.Connection, *, since_utc: str, limit: int) -> Sequence[sqlite3.Row]:
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


def fetch_web_device_breakdown(conn: sqlite3.Connection, *, since_utc: str) -> Sequence[sqlite3.Row]:
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


def fetch_web_browser_breakdown(conn: sqlite3.Connection, *, since_utc: str) -> Sequence[sqlite3.Row]:
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


def fetch_web_top_page_paths(conn: sqlite3.Connection, *, since_utc: str, limit: int) -> Sequence[sqlite3.Row]:
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


def fetch_web_channel_breakdown(conn: sqlite3.Connection, *, since_utc: str) -> Sequence[sqlite3.Row]:
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
