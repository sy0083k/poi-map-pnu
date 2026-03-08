from app.repositories.web_visit_repository_read_breakdown import (
    fetch_web_browser_breakdown,
    fetch_web_channel_breakdown,
    fetch_web_device_breakdown,
    fetch_web_top_page_paths,
    fetch_web_top_referrer_domains,
    fetch_web_top_utm_campaigns,
    fetch_web_top_utm_sources,
)
from app.repositories.web_visit_repository_read_core import (
    fetch_web_daily_unique_visitors_trend,
    fetch_web_daily_visitors,
    fetch_web_session_durations_seconds,
    fetch_web_total_visitors,
)
from app.repositories.web_visit_repository_schema import (
    WEB_VISIT_EXT_COLUMNS,
    WEB_VISIT_INSERT_COLUMNS,
    init_web_visit_schema,
)
from app.repositories.web_visit_repository_write import insert_web_visit_event

__all__ = [
    "WEB_VISIT_EXT_COLUMNS",
    "WEB_VISIT_INSERT_COLUMNS",
    "init_web_visit_schema",
    "insert_web_visit_event",
    "fetch_web_total_visitors",
    "fetch_web_daily_visitors",
    "fetch_web_session_durations_seconds",
    "fetch_web_daily_unique_visitors_trend",
    "fetch_web_top_referrer_domains",
    "fetch_web_top_utm_sources",
    "fetch_web_top_utm_campaigns",
    "fetch_web_device_breakdown",
    "fetch_web_browser_breakdown",
    "fetch_web_top_page_paths",
    "fetch_web_channel_breakdown",
]
