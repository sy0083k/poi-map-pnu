import sqlite3
from typing import Sequence


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
