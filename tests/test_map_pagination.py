import io

import httpx
import pandas as pd
import pytest

from app.db.connection import db_connection
from app.repositories import poi_repository


def _seed_lands(count: int) -> None:
    with db_connection(row_factory=True) as conn:
        poi_repository.init_db(conn)
        poi_repository.delete_all(conn)
        for idx in range(count):
            poi_repository.insert_land(
                conn,
                address=f"addr-{idx}",
                land_type="type",
                area=1.0 + idx,
                adm_property="adm",
                gen_property="gen",
                contact="010",
            )
        conn.commit()

        missing = poi_repository.fetch_missing_geom(conn)
        for item_id, _ in missing:
            poi_repository.update_geom(conn, item_id, '{"type":"Point","coordinates":[0,0]}')
        conn.commit()


@pytest.mark.anyio
async def test_lands_pagination_cursor(async_client: httpx.AsyncClient, db_path: object) -> None:
    _seed_lands(3)

    first = await async_client.get("/api/lands?limit=2")
    assert first.status_code == 200
    payload1 = first.json()
    assert payload1["type"] == "FeatureCollection"
    assert len(payload1["features"]) == 2
    assert payload1["nextCursor"] is not None

    second = await async_client.get(f"/api/lands?limit=2&cursor={payload1['nextCursor']}")
    assert second.status_code == 200
    payload2 = second.json()
    assert len(payload2["features"]) == 1
    assert payload2["nextCursor"] is None


@pytest.mark.anyio
async def test_map_v1_router_matches_map_router(async_client: httpx.AsyncClient, db_path: object) -> None:
    _seed_lands(1)

    v0 = await async_client.get("/api/lands?limit=5")
    v1 = await async_client.get("/api/v1/lands?limit=5")

    assert v0.status_code == 200
    assert v1.status_code == 200
    assert v0.json() == v1.json()


@pytest.mark.anyio
async def test_lands_invalid_cursor_returns_400(async_client: httpx.AsyncClient) -> None:
    res = await async_client.get("/api/lands?cursor=bad")
    assert res.status_code == 400


@pytest.mark.anyio
async def test_lands_list_includes_dynamic_source_fields(async_client: httpx.AsyncClient, db_path: object) -> None:
    with db_connection(row_factory=True) as conn:
        poi_repository.init_db(conn)
        poi_repository.delete_all(conn)
        poi_repository.insert_land(
            conn,
            pnu="1111012345678901234",
            address="addr-1",
            land_type="답",
            area=10.0,
            property_manager="홍길동",
            source_fields_json='[{"key":"고유번호","label":"고유번호","value":"1111012345678901234"},{"key":"비고","label":"비고","value":"테스트"}]',
        )
        conn.commit()

    res = await async_client.get("/api/lands/list?limit=10")
    assert res.status_code == 200
    payload = res.json()
    assert len(payload["items"]) == 1
    item = payload["items"][0]
    assert item["sourceFields"][0]["label"] == "고유번호"
    assert item["sourceFields"][1]["value"] == "테스트"


@pytest.mark.anyio
async def test_lands_list_supports_theme_query(async_client: httpx.AsyncClient, db_path: object) -> None:
    with db_connection(row_factory=True) as conn:
        poi_repository.init_db(conn)
        poi_repository.delete_all_for_theme(conn, theme="national_public")
        poi_repository.delete_all_for_theme(conn, theme="city_owned")
        poi_repository.insert_land_for_theme(
            conn,
            theme="national_public",
            pnu="1111012345678901234",
            address="national-addr",
            land_type="답",
            area=10.0,
            property_manager="국공유",
            source_fields_json="[]",
        )
        poi_repository.insert_land_for_theme(
            conn,
            theme="city_owned",
            pnu="2222012345678901234",
            address="city-addr",
            land_type="전",
            area=20.0,
            property_manager="시유지",
            source_fields_json="[]",
        )
        conn.commit()

    national = await async_client.get("/api/lands/list?limit=10&theme=national_public")
    city = await async_client.get("/api/lands/list?limit=10&theme=city_owned")
    assert national.status_code == 200
    assert city.status_code == 200
    assert national.json()["items"][0]["address"] == "national-addr"
    assert city.json()["items"][0]["address"] == "city-addr"


@pytest.mark.anyio
async def test_lands_theme_query_rejects_invalid_value(async_client: httpx.AsyncClient) -> None:
    res = await async_client.get("/api/lands?theme=invalid")
    assert res.status_code == 400


@pytest.mark.anyio
async def test_lands_theme_query_v1_alias_matches(async_client: httpx.AsyncClient, db_path: object) -> None:
    with db_connection(row_factory=True) as conn:
        poi_repository.init_db(conn)
        poi_repository.delete_all_for_theme(conn, theme="city_owned")
        poi_repository.insert_land_for_theme(
            conn,
            theme="city_owned",
            pnu="2222012345678901234",
            address="city-v1-addr",
            land_type="전",
            area=20.0,
            property_manager="시유지",
            source_fields_json="[]",
        )
        conn.commit()

    v0 = await async_client.get("/api/lands/list?limit=10&theme=city_owned")
    v1 = await async_client.get("/api/v1/lands/list?limit=10&theme=city_owned")
    assert v0.status_code == 200
    assert v1.status_code == 200
    assert v0.json() == v1.json()


@pytest.mark.anyio
async def test_lands_export_returns_filtered_source_fields_excel(
    async_client: httpx.AsyncClient, db_path: object
) -> None:
    with db_connection(row_factory=True) as conn:
        poi_repository.init_db(conn)
        poi_repository.delete_all_for_theme(conn, theme="city_owned")
        poi_repository.insert_land_for_theme(
            conn,
            theme="city_owned",
            pnu="2222012345678901234",
            address="city-addr-1",
            land_type="전",
            area=20.0,
            property_manager="회계과",
            source_fields_json='[{"key":"고유번호","label":"고유번호","value":"2222012345678901234"},{"key":"소재지","label":"소재지","value":"city-addr-1"},{"key":"재산관리관","label":"재산관리관","value":"회계과"}]',
        )
        poi_repository.insert_land_for_theme(
            conn,
            theme="city_owned",
            pnu="2222012345678909999",
            address="city-addr-2",
            land_type="답",
            area=15.0,
            property_manager="재무과",
            source_fields_json='[{"key":"고유번호","label":"고유번호","value":"2222012345678909999"},{"key":"소재지","label":"소재지","value":"city-addr-2"},{"key":"재산관리관","label":"재산관리관","value":"재무과"}]',
        )
        conn.commit()
        rows = poi_repository.fetch_lands_page_without_geom_for_theme(
            conn, after_id=None, limit=10, theme="city_owned"
        )
        first_id = int(rows[0]["id"])

    response = await async_client.post(
        "/api/lands/export",
        json={"theme": "city_owned", "landIds": [first_id]},
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )

    frame = pd.read_excel(io.BytesIO(response.content))
    assert len(frame.index) == 1
    assert str(frame.iloc[0]["고유번호"]) == "2222012345678901234"
    assert frame.iloc[0]["재산관리관"] == "회계과"


@pytest.mark.anyio
async def test_lands_export_v1_alias_matches(async_client: httpx.AsyncClient, db_path: object) -> None:
    with db_connection(row_factory=True) as conn:
        poi_repository.init_db(conn)
        poi_repository.delete_all_for_theme(conn, theme="national_public")
        poi_repository.insert_land_for_theme(
            conn,
            theme="national_public",
            pnu="1111012345678901234",
            address="national-addr",
            land_type="답",
            area=10.0,
            property_manager="국공유",
            source_fields_json='[{"key":"고유번호","label":"고유번호","value":"1111012345678901234"}]',
        )
        conn.commit()
        rows = poi_repository.fetch_lands_page_without_geom_for_theme(
            conn, after_id=None, limit=10, theme="national_public"
        )
        only_id = int(rows[0]["id"])

    payload = {"theme": "national_public", "landIds": [only_id]}
    v0 = await async_client.post("/api/lands/export", json=payload)
    v1 = await async_client.post("/api/v1/lands/export", json=payload)
    assert v0.status_code == 200
    assert v1.status_code == 200
    frame_v0 = pd.read_excel(io.BytesIO(v0.content))
    frame_v1 = pd.read_excel(io.BytesIO(v1.content))
    assert frame_v0.equals(frame_v1)
