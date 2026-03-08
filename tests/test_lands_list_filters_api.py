import httpx
import pytest

from app.db.connection import db_connection
from app.repositories import land_repository
from tests.helpers import init_test_db, table_name_for_theme


@pytest.mark.anyio
async def test_lands_list_supports_server_filters(async_client: httpx.AsyncClient, db_path: object) -> None:
    with db_connection(row_factory=True) as conn:
        init_test_db(conn)
        land_repository.delete_all(conn, table_name=table_name_for_theme("city_owned"))
        land_repository.insert_land(
            conn,
            pnu="1111012345678901234",
            address="충남 서산시 예천동 1-1",
            land_type="전",
            area=50.0,
            property_manager="회계과",
            property_usage="행정재산",
            source_fields_json='[{"key":"재산용도","label":"재산용도","value":"행정재산"}]',
            table_name=table_name_for_theme("city_owned"),
        )
        land_repository.insert_land(
            conn,
            pnu="1111012345678905678",
            address="충남 서산시 대산읍 2-2",
            land_type="답",
            area=10.0,
            property_manager="재무과",
            property_usage="일반재산",
            source_fields_json='[{"key":"재산용도","label":"재산용도","value":"일반재산"}]',
            table_name=table_name_for_theme("city_owned"),
        )
        conn.commit()

    response = await async_client.get(
        "/api/lands/list?limit=10&theme=city_owned&searchTerm=예천동&minArea=40&maxArea=60&propertyManager=회계&propertyUsage=행정재산&landType=전"
    )
    assert response.status_code == 200
    payload = response.json()
    assert len(payload["items"]) == 1
    assert payload["items"][0]["address"] == "충남 서산시 예천동 1-1"


@pytest.mark.anyio
async def test_lands_list_filter_alias_matches_v1(async_client: httpx.AsyncClient, db_path: object) -> None:
    with db_connection(row_factory=True) as conn:
        init_test_db(conn)
        land_repository.delete_all(conn, table_name=table_name_for_theme("city_owned"))
        land_repository.insert_land(
            conn,
            pnu="1111012345678901234",
            address="충남 서산시 예천동 1-1",
            land_type="전",
            area=50.0,
            property_manager="회계과",
            property_usage="행정재산",
            source_fields_json='[{"key":"재산용도","label":"재산용도","value":"행정재산"}]',
            table_name=table_name_for_theme("city_owned"),
        )
        conn.commit()

    query = "limit=10&theme=city_owned&searchTerm=예천동&minArea=bad&maxArea=bad&propertyUsage=행정재산"
    v0 = await async_client.get(f"/api/lands/list?{query}")
    v1 = await async_client.get(f"/api/v1/lands/list?{query}")
    assert v0.status_code == 200
    assert v1.status_code == 200
    assert v0.json() == v1.json()
