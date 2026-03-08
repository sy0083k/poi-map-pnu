import httpx
import pytest

from app.db.connection import db_connection
from app.routers import map_router
from tests.helpers import init_test_db


@pytest.mark.anyio
async def test_map_events_rate_limit_blocks_and_separates_by_anon_id(
    async_client: httpx.AsyncClient, db_path: object, monkeypatch: pytest.MonkeyPatch
) -> None:
    with db_connection() as conn:
        init_test_db(conn)

    monkeypatch.setattr(map_router, "EVENT_LIMIT_PER_MINUTE", 2)
    payload = {"eventType": "search", "anonId": "anon-rate-1", "minArea": 120, "searchTerm": "대산읍"}
    response_1 = await async_client.post("/api/events", json=payload)
    response_2 = await async_client.post("/api/events", json=payload)
    response_3 = await async_client.post("/api/events", json=payload)

    assert response_1.status_code == 200
    assert response_2.status_code == 200
    assert response_3.status_code == 429
    assert response_3.json()["success"] is False
    assert int(response_3.headers.get("retry-after", "0")) >= 1

    different_anon = await async_client.post(
        "/api/events",
        json={"eventType": "search", "anonId": "anon-rate-2", "minArea": 100, "searchTerm": "예천동"},
    )
    assert different_anon.status_code == 200


@pytest.mark.anyio
async def test_map_events_rate_limit_falls_back_to_ip_when_anon_id_missing(
    async_client: httpx.AsyncClient, db_path: object, monkeypatch: pytest.MonkeyPatch
) -> None:
    with db_connection() as conn:
        init_test_db(conn)

    monkeypatch.setattr(map_router, "EVENT_LIMIT_PER_MINUTE", 1)
    first = await async_client.post("/api/events", json={"eventType": "search", "minArea": 120, "searchTerm": "대산읍"})
    second = await async_client.post("/api/events", json={"eventType": "search", "minArea": 130, "searchTerm": "예천동"})

    assert first.status_code == 200
    assert second.status_code == 429
    assert int(second.headers.get("retry-after", "0")) >= 1


@pytest.mark.anyio
async def test_web_events_rate_limit_applies_on_v1_route(
    async_client: httpx.AsyncClient, db_path: object, monkeypatch: pytest.MonkeyPatch
) -> None:
    with db_connection() as conn:
        init_test_db(conn)

    monkeypatch.setattr(map_router, "WEB_EVENT_LIMIT_PER_MINUTE", 2)
    payload = {
        "eventType": "heartbeat",
        "anonId": "anon-web-rate-1",
        "sessionId": "session-web-rate-1",
        "pagePath": "/",
        "clientTs": 1763596800,
        "clientTz": "Asia/Seoul",
    }
    response_1 = await async_client.post("/api/v1/web-events", json=payload)
    response_2 = await async_client.post("/api/v1/web-events", json=payload)
    response_3 = await async_client.post("/api/v1/web-events", json=payload)

    assert response_1.status_code == 200
    assert response_2.status_code == 200
    assert response_3.status_code == 429
    assert int(response_3.headers.get("retry-after", "0")) >= 1
