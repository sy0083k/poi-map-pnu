import sqlite3
from typing import Sequence


def insert_map_event(
    conn: sqlite3.Connection,
    *,
    event_type: str,
    anon_id: str | None,
    land_address: str | None = None,
    region_name: str | None = None,
    min_area_value: float | None = None,
    min_area_bucket: str | None = None,
    region_source: str = "derived_address",
) -> None:
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO map_event_log (
            event_type, anon_id, land_address, region_name, min_area_value, min_area_bucket, region_source
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (event_type, anon_id, land_address, region_name, min_area_value, min_area_bucket, region_source),
    )


def insert_raw_query_log(
    conn: sqlite3.Connection,
    *,
    event_type: str,
    anon_id: str | None,
    raw_region_query: str | None,
    raw_min_area_input: str | None,
    raw_max_area_input: str | None,
    raw_rent_only_input: str | None,
    raw_land_id_input: str | None,
    raw_land_address_input: str | None,
    raw_click_source_input: str | None,
    raw_payload_json: str,
) -> None:
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO raw_query_log (
            event_type,
            anon_id,
            raw_region_query,
            raw_min_area_input,
            raw_max_area_input,
            raw_rent_only_input,
            raw_land_id_input,
            raw_land_address_input,
            raw_click_source_input,
            raw_payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            event_type,
            anon_id,
            raw_region_query,
            raw_min_area_input,
            raw_max_area_input,
            raw_rent_only_input,
            raw_land_id_input,
            raw_land_address_input,
            raw_click_source_input,
            raw_payload_json,
        ),
    )


def fetch_event_summary(conn: sqlite3.Connection) -> sqlite3.Row:
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT
            SUM(CASE WHEN event_type = 'search' THEN 1 ELSE 0 END) AS search_count,
            SUM(CASE WHEN event_type = 'land_click' THEN 1 ELSE 0 END) AS click_count,
            COUNT(DISTINCT CASE WHEN anon_id IS NOT NULL AND anon_id != '' THEN anon_id END) AS unique_session_count
        FROM map_event_log
        """
    )
    return cursor.fetchone()


def fetch_top_regions(conn: sqlite3.Connection, *, limit: int) -> Sequence[sqlite3.Row]:
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT region_name, COUNT(*) AS count
          FROM map_event_log
         WHERE event_type = 'search'
           AND region_source = 'user_input'
           AND region_name IS NOT NULL
           AND region_name != ''
         GROUP BY region_name
         ORDER BY count DESC, region_name ASC
         LIMIT ?
        """,
        (limit,),
    )
    return cursor.fetchall()


def fetch_top_min_area_buckets(conn: sqlite3.Connection, *, limit: int) -> Sequence[sqlite3.Row]:
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT min_area_bucket, COUNT(*) AS count
          FROM map_event_log
         WHERE event_type = 'search'
           AND min_area_bucket IS NOT NULL
           AND min_area_bucket != ''
         GROUP BY min_area_bucket
         ORDER BY count DESC, min_area_bucket ASC
         LIMIT ?
        """,
        (limit,),
    )
    return cursor.fetchall()


def fetch_top_clicked_lands(conn: sqlite3.Connection, *, limit: int) -> Sequence[sqlite3.Row]:
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT
            land_address,
            COUNT(*) AS click_count,
            COUNT(DISTINCT CASE WHEN anon_id IS NOT NULL AND anon_id != '' THEN anon_id END) AS unique_session_count
          FROM map_event_log
         WHERE event_type = 'land_click'
           AND land_address IS NOT NULL
           AND land_address != ''
         GROUP BY land_address
         ORDER BY click_count DESC, land_address ASC
         LIMIT ?
        """,
        (limit,),
    )
    return cursor.fetchall()


def fetch_raw_query_logs(
    conn: sqlite3.Connection,
    *,
    event_type: str | None,
    created_at_from: str | None,
    created_at_to: str | None,
    limit: int,
) -> Sequence[sqlite3.Row]:
    cursor = conn.cursor()
    conditions: list[str] = []
    params: list[object] = []

    if event_type is not None:
        conditions.append("event_type = ?")
        params.append(event_type)
    if created_at_from is not None:
        conditions.append("created_at >= ?")
        params.append(created_at_from)
    if created_at_to is not None:
        conditions.append("created_at < ?")
        params.append(created_at_to)

    where_clause = ""
    if conditions:
        where_clause = "WHERE " + " AND ".join(conditions)

    cursor.execute(
        f"""
        SELECT
            id,
            created_at,
            event_type,
            anon_id,
            raw_region_query,
            raw_min_area_input,
            raw_max_area_input,
            raw_rent_only_input,
            raw_land_id_input,
            raw_land_address_input,
            raw_click_source_input,
            raw_payload_json
          FROM raw_query_log
          {where_clause}
         ORDER BY created_at DESC, id DESC
         LIMIT ?
        """,
        (*params, limit),
    )
    return cursor.fetchall()


def fetch_daily_event_counts(conn: sqlite3.Connection) -> Sequence[sqlite3.Row]:
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT
            DATE(created_at) AS date,
            SUM(CASE WHEN event_type = 'search' THEN 1 ELSE 0 END) AS search_count,
            SUM(CASE WHEN event_type = 'land_click' THEN 1 ELSE 0 END) AS click_count
          FROM map_event_log
         GROUP BY DATE(created_at)
         ORDER BY DATE(created_at) ASC
        """
    )
    return cursor.fetchall()
