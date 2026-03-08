import re

import httpx
import pytest

from app.db.connection import db_connection
from tests.helpers import init_test_db

CSRF_PATTERN = r'name="csrf_token" value="([^"]+)"'


async def _login_as_admin(client: httpx.AsyncClient) -> None:
    login_page = await client.get("/admin/login")
    match = re.search(CSRF_PATTERN, login_page.text)
    assert match is not None

    response = await client.post(
        "/login",
        data={
            "username": "admin",
            "password": "admin-password",
            "csrf_token": match.group(1),
        },
    )
    assert response.status_code == 200
    assert response.json()["success"] is True


async def _seed_export_events(client: httpx.AsyncClient) -> None:
    search_payload = {
        "eventType": "search",
        "anonId": "anon-export-1",
        "minArea": 120,
        "searchTerm": "예천동",
        "rawSearchTerm": "  예천동  ",
        "rawMinAreaInput": " 120 ",
        "rawMaxAreaInput": " 500 ",
        "rawRentOnly": "true",
    }
    click_payload = {
        "eventType": "land_click",
        "anonId": "anon-export-2",
        "landAddress": "충남 서산시 대산읍 독곶리 1-1",
        "landId": "99",
        "clickSource": "map_click",
    }
    search_response = await client.post("/api/events", json=search_payload)
    click_response = await client.post("/api/events", json=click_payload)
    assert search_response.status_code == 200
    assert click_response.status_code == 200


@pytest.mark.anyio
async def test_admin_export_raw_query_csv_search_only(async_client: httpx.AsyncClient, db_path: object) -> None:
    with db_connection() as conn:
        init_test_db(conn)

    await _seed_export_events(async_client)
    await _login_as_admin(async_client)

    export_search = await async_client.get("/admin/raw-queries/export?event_type=search&limit=100")
    assert export_search.status_code == 200
    assert export_search.headers["content-type"].startswith("text/csv")
    assert "attachment; filename=" in export_search.headers.get("content-disposition", "")
    assert "raw_region_query" in export_search.text
    assert "  예천동  " in export_search.text
    assert " 120 " in export_search.text
    assert "충남 서산시 대산읍 독곶리 1-1" not in export_search.text


@pytest.mark.anyio
async def test_admin_export_raw_query_csv_all_events(async_client: httpx.AsyncClient, db_path: object) -> None:
    with db_connection() as conn:
        init_test_db(conn)

    await _seed_export_events(async_client)
    await _login_as_admin(async_client)

    export_all = await async_client.get("/admin/raw-queries/export?event_type=all&limit=100")
    assert export_all.status_code == 200
    assert "충남 서산시 대산읍 독곶리 1-1" in export_all.text
    assert "99" in export_all.text
    assert "map_click" in export_all.text
