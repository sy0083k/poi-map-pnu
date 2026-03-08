import sqlite3

from app.repositories.web_visit_repository_schema import WEB_VISIT_INSERT_COLUMNS


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
