from app.db.connection import db_connection
from app.repositories import event_repository
from app.services import raw_query_export_service


def test_raw_query_export_service_date_parsers() -> None:
    assert raw_query_export_service.parse_date_start("2026-02-22") == "2026-02-22 00:00:00"
    assert raw_query_export_service.parse_date_end_exclusive("2026-02-22") == "2026-02-23 00:00:00"


def test_raw_query_export_service_export_csv(db_path: object) -> None:
    with db_connection() as conn:
        event_repository.init_event_schema(conn)
        event_repository.insert_raw_query_log(
            conn,
            event_type="search",
            anon_id="anon-1",
            raw_region_query="대산읍",
            raw_min_area_input="120",
            raw_max_area_input="500",
            raw_rent_only_input="true",
            raw_land_id_input=None,
            raw_land_address_input=None,
            raw_click_source_input=None,
            raw_payload_json="{}",
        )
        conn.commit()

    csv_text = raw_query_export_service.export_raw_query_csv(
        event_type="search",
        date_from=None,
        date_to=None,
        limit=100,
    )
    assert "event_type" in csv_text
    assert "search" in csv_text


def test_raw_query_export_service_escapes_formula_cells(db_path: object) -> None:
    with db_connection() as conn:
        event_repository.init_event_schema(conn)
        event_repository.insert_raw_query_log(
            conn,
            event_type="search",
            anon_id="anon-2",
            raw_region_query="=cmd|' /C calc'!A0",
            raw_min_area_input="+10",
            raw_max_area_input="-20",
            raw_rent_only_input="@test",
            raw_land_id_input=None,
            raw_land_address_input=None,
            raw_click_source_input=None,
            raw_payload_json='{"payload":"=danger"}',
        )
        conn.commit()

    csv_text = raw_query_export_service.export_raw_query_csv(
        event_type="search",
        date_from=None,
        date_to=None,
        limit=100,
    )
    assert "'=cmd|' /C calc'!A0" in csv_text
    assert "'+10" in csv_text
    assert "'-20" in csv_text
    assert "'@test" in csv_text
    assert '"{""payload"":""=danger""}"' in csv_text
