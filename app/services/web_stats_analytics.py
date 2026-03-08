from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from app.db.connection import db_connection
from app.repositories import web_visit_repository
from app.services.web_stats_utils import SEOUL_OFFSET, TOP_BREAKDOWN_LIMIT, to_breakdown


def get_web_stats(days: int) -> dict[str, Any]:
    clamped_days = max(1, min(int(days), 365))
    now_utc = datetime.now(UTC)
    now_kst = now_utc + SEOUL_OFFSET
    today_kst_start = now_kst.replace(hour=0, minute=0, second=0, microsecond=0)
    today_kst_end = today_kst_start + timedelta(days=1)
    today_utc_start = (today_kst_start - SEOUL_OFFSET).strftime("%Y-%m-%d %H:%M:%S")
    today_utc_end = (today_kst_end - SEOUL_OFFSET).strftime("%Y-%m-%d %H:%M:%S")
    since_utc = (now_utc - timedelta(days=clamped_days)).strftime("%Y-%m-%d %H:%M:%S")

    with db_connection(row_factory=True) as conn:
        total_visitors = web_visit_repository.fetch_web_total_visitors(conn, page_path=None)
        daily_visitors = web_visit_repository.fetch_web_daily_visitors(
            conn, page_path=None, since_utc=today_utc_start, until_utc=today_utc_end
        )
        session_rows = web_visit_repository.fetch_web_session_durations_seconds(
            conn, page_path=None, since_utc=since_utc
        )
        visitor_trend_rows = web_visit_repository.fetch_web_daily_unique_visitors_trend(
            conn, page_path=None, since_utc=since_utc
        )
        top_referrers = web_visit_repository.fetch_web_top_referrer_domains(
            conn, since_utc=since_utc, limit=TOP_BREAKDOWN_LIMIT
        )
        top_utm_sources = web_visit_repository.fetch_web_top_utm_sources(
            conn, since_utc=since_utc, limit=TOP_BREAKDOWN_LIMIT
        )
        top_utm_campaigns = web_visit_repository.fetch_web_top_utm_campaigns(
            conn, since_utc=since_utc, limit=TOP_BREAKDOWN_LIMIT
        )
        device_breakdown = web_visit_repository.fetch_web_device_breakdown(conn, since_utc=since_utc)
        browser_breakdown = web_visit_repository.fetch_web_browser_breakdown(conn, since_utc=since_utc)
        top_page_paths = web_visit_repository.fetch_web_top_page_paths(
            conn, since_utc=since_utc, limit=TOP_BREAKDOWN_LIMIT
        )
        channel_breakdown = web_visit_repository.fetch_web_channel_breakdown(conn, since_utc=since_utc)

    session_count = 0
    durations_total_seconds = 0
    durations_by_date: dict[str, list[int]] = {}
    for row in session_rows:
        duration_seconds = int(row["duration_seconds"] or 0)
        capped = min(duration_seconds, 8 * 60 * 60)
        session_count += 1
        durations_total_seconds += capped
        date_key = str(row["kst_date"])
        durations_by_date.setdefault(date_key, []).append(capped)

    avg_dwell_minutes = round((durations_total_seconds / session_count) / 60, 2) if session_count > 0 else 0.0
    sessions_by_date: dict[str, int] = {}
    for row in session_rows:
        date_key = str(row["kst_date"])
        sessions_by_date[date_key] = sessions_by_date.get(date_key, 0) + 1

    visitors_by_date = {str(row["date"]): int(row["visitors"]) for row in visitor_trend_rows}
    all_dates = sorted(set(visitors_by_date.keys()) | set(sessions_by_date.keys()) | set(durations_by_date.keys()))
    daily_trend = []
    for date in all_dates:
        per_day_durations = durations_by_date.get(date, [])
        avg_day_dwell = round((sum(per_day_durations) / len(per_day_durations)) / 60, 2) if per_day_durations else 0.0
        daily_trend.append(
            {
                "date": date,
                "visitors": visitors_by_date.get(date, 0),
                "sessions": sessions_by_date.get(date, 0),
                "avgDwellMinutes": avg_day_dwell,
            }
        )

    return {
        "summary": {
            "dailyVisitors": daily_visitors,
            "totalVisitors": total_visitors,
            "avgDwellMinutes": avg_dwell_minutes,
            "sessionCount": session_count,
        },
        "dailyTrend": daily_trend,
        "topReferrers": to_breakdown(top_referrers),
        "topUtmSources": to_breakdown(top_utm_sources),
        "topUtmCampaigns": to_breakdown(top_utm_campaigns),
        "deviceBreakdown": to_breakdown(device_breakdown),
        "browserBreakdown": to_breakdown(browser_breakdown),
        "topPagePaths": to_breakdown(top_page_paths),
        "channelBreakdown": to_breakdown(channel_breakdown),
    }
