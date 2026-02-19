from app.db.connection import db_connection
from app.repositories import idle_land_repository
from app.services import geo_service
from _pytest.monkeypatch import MonkeyPatch


def test_geo_service_updates_geom(db_path: object, monkeypatch: MonkeyPatch) -> None:
    with db_connection() as conn:
        idle_land_repository.init_db(conn)
        idle_land_repository.delete_all(conn)
        idle_land_repository.insert_land(
            conn,
            address="addr",
            land_type="type",
            area=1.0,
            adm_property="adm",
            gen_property="gen",
            contact="010",
        )
        conn.commit()

    class DummyClient:
        def __init__(self, *args: object, **kwargs: object) -> None:
            pass

        def get_parcel_geometry(self, address: str, request_id: str = "-") -> str | None:
            return '{"type":"Point","coordinates":[0,0]}'

    monkeypatch.setattr(geo_service, "VWorldClient", DummyClient)
    updated, failed = geo_service.update_geoms(max_retries=1)
    assert updated == 1
    assert failed == 0


def test_geo_service_handles_missing_geom(db_path: object, monkeypatch: MonkeyPatch) -> None:
    with db_connection() as conn:
        idle_land_repository.init_db(conn)
        idle_land_repository.delete_all(conn)
        idle_land_repository.insert_land(
            conn,
            address="addr",
            land_type="type",
            area=1.0,
            adm_property="adm",
            gen_property="gen",
            contact="010",
        )
        conn.commit()

    class DummyClient:
        def __init__(self, *args: object, **kwargs: object) -> None:
            pass

        def get_parcel_geometry(self, address: str, request_id: str = "-") -> str | None:
            return None

    monkeypatch.setattr(geo_service, "VWorldClient", DummyClient)
    updated, failed = geo_service.update_geoms(max_retries=1)
    assert updated == 0
    assert failed == 1
