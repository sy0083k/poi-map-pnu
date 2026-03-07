from app.db.connection import db_connection
from app.repositories import web_visit_repository


def test_web_visit_repository_aggregates(db_path: object) -> None:
    with db_connection(row_factory=True) as conn:
        web_visit_repository.init_web_visit_schema(conn)
        web_visit_repository.insert_web_visit_event(
            conn,
            anon_id="anon-1",
            session_id="s-1",
            event_type="visit_start",
            page_path="/",
            occurred_at="2026-02-20 00:00:00",
            client_tz="Asia/Seoul",
            user_agent="Mozilla/5.0",
            is_bot=False,
        )
        web_visit_repository.insert_web_visit_event(
            conn,
            anon_id="anon-1",
            session_id="s-1",
            event_type="visit_end",
            page_path="/",
            occurred_at="2026-02-20 00:10:00",
            client_tz="Asia/Seoul",
            user_agent="Mozilla/5.0",
            is_bot=False,
        )
        conn.commit()

        assert web_visit_repository.fetch_web_total_visitors(conn, page_path="/") == 1
        sessions = web_visit_repository.fetch_web_session_durations_seconds(
            conn,
            page_path="/",
            since_utc="2026-02-19 00:00:00",
        )
        assert len(sessions) == 1
        assert int(sessions[0]["duration_seconds"]) == 600


def test_web_visit_repository_breakdowns(db_path: object) -> None:
    with db_connection(row_factory=True) as conn:
        web_visit_repository.init_web_visit_schema(conn)
        web_visit_repository.insert_web_visit_event(
            conn,
            anon_id="anon-1",
            session_id="s-1",
            event_type="visit_start",
            page_path="/siyu",
            occurred_at="2026-02-20 00:00:00",
            client_tz="Asia/Seoul",
            user_agent="Mozilla/5.0",
            is_bot=False,
            referrer_domain="example.com",
            referrer_path="/landing",
            utm_source="naver",
            utm_campaign="spring",
            browser_family="chrome",
            device_type="desktop",
            traffic_channel="campaign",
        )
        conn.commit()

        referrers = web_visit_repository.fetch_web_top_referrer_domains(
            conn, since_utc="2026-02-19 00:00:00", limit=10
        )
        utm_sources = web_visit_repository.fetch_web_top_utm_sources(
            conn, since_utc="2026-02-19 00:00:00", limit=10
        )
        browsers = web_visit_repository.fetch_web_browser_breakdown(conn, since_utc="2026-02-19 00:00:00")
        devices = web_visit_repository.fetch_web_device_breakdown(conn, since_utc="2026-02-19 00:00:00")
        paths = web_visit_repository.fetch_web_top_page_paths(
            conn, since_utc="2026-02-19 00:00:00", limit=10
        )
        channels = web_visit_repository.fetch_web_channel_breakdown(
            conn, since_utc="2026-02-19 00:00:00"
        )

        assert len(referrers) == 1
        assert str(referrers[0]["key"]) == "example.com"
        assert len(utm_sources) == 1
        assert str(utm_sources[0]["key"]) == "naver"
        assert len(browsers) == 1
        assert str(browsers[0]["key"]) == "chrome"
        assert len(devices) == 1
        assert str(devices[0]["key"]) == "desktop"
        assert len(paths) == 1
        assert str(paths[0]["key"]) == "/siyu"
        assert len(channels) == 1
        assert str(channels[0]["key"]) == "campaign"
