from __future__ import annotations

from typing import Any

from fastapi import HTTPException, Request

from app.db.connection import db_connection
from app.repositories import web_visit_repository
from app.services.web_stats_analytics import get_web_stats as _get_web_stats
from app.services.web_stats_utils import (
    BOT_UA_PATTERNS,
    SEOUL_OFFSET,
    WEB_EVENT_TYPE_HEARTBEAT,
    WEB_EVENT_TYPE_VISIT_END,
    WEB_EVENT_TYPE_VISIT_START,
    WEB_EVENT_TYPES,
    WEB_SESSION_TIMEOUT_MINUTES,
    WEB_STATS_DAYS_DEFAULT,
    WEB_TRACKING_ALLOWED_PAGE_PATHS,
    WEB_TRACKING_PAGE_PATH,
    derive_traffic_channel,
    is_bot_user_agent,
    normalize_optional_int,
    normalize_optional_string,
    normalize_required_token,
    parse_browser_family,
    parse_client_ts,
    parse_device_type,
    parse_os_family,
    parse_referrer_context,
)


def record_web_visit_event(payload: dict[str, Any], request: Request) -> None:
    event_type = str(payload.get("eventType", "")).strip()
    if event_type not in WEB_EVENT_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported eventType.")

    anon_id = normalize_required_token(payload.get("anonId"), "anonId")
    session_id = normalize_required_token(payload.get("sessionId"), "sessionId")
    page_path = str(payload.get("pagePath", "")).strip() or WEB_TRACKING_PAGE_PATH
    if page_path not in WEB_TRACKING_ALLOWED_PAGE_PATHS:
        raise HTTPException(status_code=400, detail="Unsupported pagePath.")

    client_tz = normalize_optional_string(payload.get("clientTz"), max_length=64)
    occurred_at = parse_client_ts(payload.get("clientTs"))
    referrer_domain, referrer_path = parse_referrer_context(payload.get("referrerUrl"))
    utm_source = normalize_optional_string(payload.get("utmSource"), max_length=128)
    utm_medium = normalize_optional_string(payload.get("utmMedium"), max_length=128)
    utm_campaign = normalize_optional_string(payload.get("utmCampaign"), max_length=128)
    utm_term = normalize_optional_string(payload.get("utmTerm"), max_length=128)
    utm_content = normalize_optional_string(payload.get("utmContent"), max_length=128)
    page_query = normalize_optional_string(payload.get("pageQuery"), max_length=512)
    client_lang = normalize_optional_string(payload.get("clientLang"), max_length=32)
    platform = normalize_optional_string(payload.get("platform"), max_length=64)
    screen_width = normalize_optional_int(payload.get("screenWidth"))
    screen_height = normalize_optional_int(payload.get("screenHeight"))
    viewport_width = normalize_optional_int(payload.get("viewportWidth"))
    viewport_height = normalize_optional_int(payload.get("viewportHeight"))
    user_agent = request.headers.get("user-agent", "")[:500] or None
    is_bot = is_bot_user_agent(user_agent or "")
    browser_family = parse_browser_family(user_agent or "")
    device_type = parse_device_type(
        user_agent or "", viewport_width=viewport_width, viewport_height=viewport_height, is_bot=is_bot
    )
    os_family = parse_os_family(user_agent or "")
    traffic_channel = derive_traffic_channel(utm_medium=utm_medium, referrer_domain=referrer_domain)

    with db_connection() as conn:
        web_visit_repository.insert_web_visit_event(
            conn,
            anon_id=anon_id,
            session_id=session_id,
            event_type=event_type,
            page_path=page_path,
            occurred_at=occurred_at,
            client_tz=client_tz,
            user_agent=user_agent,
            is_bot=is_bot,
            referrer_domain=referrer_domain,
            referrer_path=referrer_path,
            utm_source=utm_source,
            utm_medium=utm_medium,
            utm_campaign=utm_campaign,
            utm_term=utm_term,
            utm_content=utm_content,
            page_query=page_query,
            client_lang=client_lang,
            platform=platform,
            screen_width=screen_width,
            screen_height=screen_height,
            viewport_width=viewport_width,
            viewport_height=viewport_height,
            browser_family=browser_family,
            device_type=device_type,
            os_family=os_family,
            traffic_channel=traffic_channel,
        )
        conn.commit()


def get_web_stats(days: int = WEB_STATS_DAYS_DEFAULT) -> dict[str, Any]:
    return _get_web_stats(days=days)


__all__ = [
    "WEB_EVENT_TYPE_VISIT_START",
    "WEB_EVENT_TYPE_HEARTBEAT",
    "WEB_EVENT_TYPE_VISIT_END",
    "WEB_EVENT_TYPES",
    "WEB_TRACKING_PAGE_PATH",
    "WEB_STATS_DAYS_DEFAULT",
    "WEB_SESSION_TIMEOUT_MINUTES",
    "SEOUL_OFFSET",
    "BOT_UA_PATTERNS",
    "record_web_visit_event",
    "get_web_stats",
    "normalize_required_token",
    "normalize_optional_string",
    "parse_client_ts",
    "is_bot_user_agent",
    "parse_referrer_context",
    "derive_traffic_channel",
]
