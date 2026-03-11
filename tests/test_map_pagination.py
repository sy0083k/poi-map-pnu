import io

import httpx
import pandas as pd
import pytest

from app.db.connection import db_connection
from app.repositories import land_repository, parcel_render_repository
from app.services.cadastral_highlight_geometry import wgs84_to_mercator
from tests.helpers import init_test_db, table_name_for_theme


def _seed_lands(count: int) -> None:
    with db_connection(row_factory=True) as conn:
        init_test_db(conn)
        land_repository.delete_all(conn)
        for idx in range(count):
            land_repository.insert_land(
                conn,
                address=f"addr-{idx}",
                land_type="type",
                area=1.0 + idx,
                adm_property="adm",
                gen_property="gen",
                contact="010",
            )
        conn.commit()

        missing = land_repository.fetch_missing_geom(conn)
        for item_id, _ in missing:
            land_repository.update_geom(conn, item_id, '{"type":"Point","coordinates":[0,0]}')
        conn.commit()


def _seed_render_item(
    *,
    pnu: str,
    bbox: tuple[float, float, float, float],
    conn: object,
) -> None:
    assert hasattr(conn, "execute")
    parcel_render_repository.init_schema(conn)  # type: ignore[arg-type]
    conn.execute(  # type: ignore[attr-defined]
        f"""
        INSERT OR REPLACE INTO {parcel_render_repository.TABLE_NAME} (
            pnu,
            bbox_minx,
            bbox_miny,
            bbox_maxx,
            bbox_maxy,
            center_x,
            center_y,
            area_m2,
            vertex_count,
            geom_geojson_full,
            geom_geojson_mid,
            geom_geojson_low,
            label_x,
            label_y,
            source_fgb_etag,
            source_fgb_path,
            source_crs,
            updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
        """,
        (
            pnu,
            bbox[0],
            bbox[1],
            bbox[2],
            bbox[3],
            (bbox[0] + bbox[2]) / 2,
            (bbox[1] + bbox[3]) / 2,
            1.0,
            4,
            '{"type":"Polygon","coordinates":[[[0,0],[0,1],[1,1],[1,0],[0,0]]]}',
            '{"type":"Polygon","coordinates":[[[0,0],[0,1],[1,1],[1,0],[0,0]]]}',
            '{"type":"Polygon","coordinates":[[[0,0],[0,1],[1,1],[1,0],[0,0]]]}',
            (bbox[0] + bbox[2]) / 2,
            (bbox[1] + bbox[3]) / 2,
            "etag",
            "data/test.fgb",
            "EPSG:4326",
        ),
    )


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
        init_test_db(conn)
        land_repository.delete_all(conn)
        land_repository.insert_land(
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
        init_test_db(conn)
        land_repository.delete_all(conn, table_name=table_name_for_theme("city_owned"))
        land_repository.insert_land(
            conn,
            pnu="2222012345678901234",
            address="city-addr",
            land_type="전",
            area=20.0,
            property_manager="시유지",
            source_fields_json="[]",
            table_name=table_name_for_theme("city_owned"),
        )
        conn.commit()

    city = await async_client.get("/api/lands/list?limit=10&theme=city_owned")
    default_theme = await async_client.get("/api/lands/list?limit=10")
    assert city.status_code == 200
    assert default_theme.status_code == 200
    assert city.json()["items"][0]["address"] == "city-addr"
    assert default_theme.json()["items"][0]["address"] == "city-addr"


@pytest.mark.anyio
async def test_lands_theme_query_rejects_invalid_value(async_client: httpx.AsyncClient) -> None:
    res = await async_client.get("/api/lands?theme=invalid")
    assert res.status_code == 400


@pytest.mark.anyio
async def test_lands_theme_query_rejects_national_public(async_client: httpx.AsyncClient) -> None:
    res = await async_client.get("/api/lands?theme=national_public")
    assert res.status_code == 400


@pytest.mark.anyio
async def test_lands_theme_query_v1_alias_matches(async_client: httpx.AsyncClient, db_path: object) -> None:
    with db_connection(row_factory=True) as conn:
        init_test_db(conn)
        land_repository.delete_all(conn, table_name=table_name_for_theme("city_owned"))
        land_repository.insert_land(
            conn,
            pnu="2222012345678901234",
            address="city-v1-addr",
            land_type="전",
            area=20.0,
            property_manager="시유지",
            source_fields_json="[]",
            table_name=table_name_for_theme("city_owned"),
        )
        conn.commit()

    v0 = await async_client.get("/api/lands/list?limit=10&theme=city_owned")
    v1 = await async_client.get("/api/v1/lands/list?limit=10&theme=city_owned")
    assert v0.status_code == 200
    assert v1.status_code == 200
    assert v0.json() == v1.json()


@pytest.mark.anyio
async def test_lands_list_supports_bbox_query(async_client: httpx.AsyncClient, db_path: object) -> None:
    with db_connection(row_factory=True) as conn:
        init_test_db(conn)
        land_repository.delete_all(conn, table_name=table_name_for_theme("city_owned"))
        parcel_render_repository.init_schema(conn)
        land_repository.insert_land(
            conn,
            pnu="3333012345678901234",
            address="inside-bbox",
            land_type="전",
            area=20.0,
            property_manager="시유지",
            source_fields_json="[]",
            table_name=table_name_for_theme("city_owned"),
        )
        land_repository.insert_land(
            conn,
            pnu="3333012345678909999",
            address="outside-bbox",
            land_type="답",
            area=25.0,
            property_manager="시유지",
            source_fields_json="[]",
            table_name=table_name_for_theme("city_owned"),
        )
        inside_min = wgs84_to_mercator(126.0, 36.0)
        inside_max = wgs84_to_mercator(126.1, 36.1)
        outside_min = wgs84_to_mercator(128.0, 38.0)
        outside_max = wgs84_to_mercator(128.1, 38.1)
        _seed_render_item(
            pnu="3333012345678901234",
            bbox=(inside_min[0], inside_min[1], inside_max[0], inside_max[1]),
            conn=conn,
        )
        _seed_render_item(
            pnu="3333012345678909999",
            bbox=(outside_min[0], outside_min[1], outside_max[0], outside_max[1]),
            conn=conn,
        )
        conn.commit()

    res = await async_client.get(
        "/api/lands/list?limit=10&theme=city_owned&bbox=125.9,35.9,126.2,36.2&bboxCrs=EPSG:4326"
    )
    assert res.status_code == 200
    payload = res.json()
    assert [item["address"] for item in payload["items"]] == ["inside-bbox"]


@pytest.mark.anyio
async def test_lands_export_returns_filtered_source_fields_excel(
    async_client: httpx.AsyncClient, db_path: object
) -> None:
    with db_connection(row_factory=True) as conn:
        init_test_db(conn)
        land_repository.delete_all(conn, table_name=table_name_for_theme("city_owned"))
        land_repository.insert_land(
            conn,
            pnu="2222012345678901234",
            address="city-addr-1",
            land_type="전",
            area=20.0,
            property_manager="회계과",
            source_fields_json='[{"key":"고유번호","label":"고유번호","value":"2222012345678901234"},{"key":"소재지","label":"소재지","value":"city-addr-1"},{"key":"재산관리관","label":"재산관리관","value":"회계과"}]',
            table_name=table_name_for_theme("city_owned"),
        )
        land_repository.insert_land(
            conn,
            pnu="2222012345678909999",
            address="city-addr-2",
            land_type="답",
            area=15.0,
            property_manager="재무과",
            source_fields_json='[{"key":"고유번호","label":"고유번호","value":"2222012345678909999"},{"key":"소재지","label":"소재지","value":"city-addr-2"},{"key":"재산관리관","label":"재산관리관","value":"재무과"}]',
            table_name=table_name_for_theme("city_owned"),
        )
        conn.commit()
        rows = land_repository.fetch_lands_page_without_geom(
            conn,
            after_id=None,
            limit=10,
            table_name=table_name_for_theme("city_owned"),
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
        init_test_db(conn)
        land_repository.delete_all(conn, table_name=table_name_for_theme("city_owned"))
        land_repository.insert_land(
            conn,
            pnu="2222012345678901234",
            address="city-addr",
            land_type="전",
            area=20.0,
            property_manager="시유지",
            source_fields_json='[{"key":"고유번호","label":"고유번호","value":"2222012345678901234"}]',
            table_name=table_name_for_theme("city_owned"),
        )
        conn.commit()
        rows = land_repository.fetch_lands_page_without_geom(
            conn,
            after_id=None,
            limit=10,
            table_name=table_name_for_theme("city_owned"),
        )
        only_id = int(rows[0]["id"])

    payload = {"theme": "city_owned", "landIds": [only_id]}
    v0 = await async_client.post("/api/lands/export", json=payload)
    v1 = await async_client.post("/api/v1/lands/export", json=payload)
    assert v0.status_code == 200
    assert v1.status_code == 200
    frame_v0 = pd.read_excel(io.BytesIO(v0.content))
    frame_v1 = pd.read_excel(io.BytesIO(v1.content))
    assert frame_v0.equals(frame_v1)
