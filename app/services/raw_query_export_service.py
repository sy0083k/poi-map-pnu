from __future__ import annotations

import csv
from datetime import datetime, timedelta
from io import StringIO
from typing import Any

from fastapi import HTTPException

from app.db.connection import db_connection
from app.repositories import event_repository

EVENT_TYPE_SEARCH = "search"
EVENT_TYPE_LAND_CLICK = "land_click"
FORMULA_PREFIXES = ("=", "+", "-", "@")
RAW_QUERY_TEXT_FIELDS = (
    "created_at",
    "event_type",
    "anon_id",
    "raw_region_query",
    "raw_min_area_input",
    "raw_max_area_input",
    "raw_rent_only_input",
    "raw_land_id_input",
    "raw_land_address_input",
    "raw_click_source_input",
    "raw_payload_json",
)


def export_raw_query_csv(
    *,
    event_type: str,
    date_from: str | None,
    date_to: str | None,
    limit: int,
) -> str:
    event_type_filter, created_at_from, created_at_to, clamped_limit = _normalize_export_query(
        event_type=event_type,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
    )

    with db_connection(row_factory=True) as conn:
        rows = event_repository.fetch_raw_query_logs(
            conn,
            event_type=event_type_filter,
            created_at_from=created_at_from,
            created_at_to=created_at_to,
            limit=clamped_limit,
        )

    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(_raw_query_csv_header())
    for row in rows:
        writer.writerow(_raw_query_csv_row(row))
    return output.getvalue()


def _normalize_export_query(
    *,
    event_type: str,
    date_from: str | None,
    date_to: str | None,
    limit: int,
) -> tuple[str | None, str | None, str | None, int]:
    if event_type not in {"all", EVENT_TYPE_SEARCH, EVENT_TYPE_LAND_CLICK}:
        raise HTTPException(status_code=400, detail="event_type must be one of: all, search, land_click.")

    clamped_limit = max(1, min(int(limit), 100000))
    created_at_from = parse_date_start(date_from)
    created_at_to = parse_date_end_exclusive(date_to)
    if created_at_from is not None and created_at_to is not None and created_at_from >= created_at_to:
        raise HTTPException(status_code=400, detail="date_from must be earlier than or equal to date_to.")

    event_type_filter = None if event_type == "all" else event_type
    return event_type_filter, created_at_from, created_at_to, clamped_limit


def _raw_query_csv_header() -> list[str]:
    return [
        "id",
        "created_at",
        "event_type",
        "anon_id",
        "raw_region_query",
        "raw_min_area_input",
        "raw_max_area_input",
        "raw_rent_only_input",
        "raw_land_id_input",
        "raw_land_address_input",
        "raw_click_source_input",
        "raw_payload_json",
    ]


def _raw_query_csv_row(row: Any) -> list[str | int]:
    escaped_values = [_escape_csv_cell(_row_text(row, field)) for field in RAW_QUERY_TEXT_FIELDS]
    return [int(row["id"]), *escaped_values]


def _row_text(row: Any, key: str) -> str:
    return str(row[key] or "")


def _escape_csv_cell(value: str) -> str:
    trimmed = value.lstrip()
    if trimmed and trimmed[0] in FORMULA_PREFIXES:
        return f"'{value}"
    return value


def parse_date_start(raw: str | None) -> str | None:
    if raw is None or raw.strip() == "":
        return None
    try:
        parsed = datetime.strptime(raw, "%Y-%m-%d")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="date_from must be YYYY-MM-DD.") from exc
    return parsed.strftime("%Y-%m-%d 00:00:00")


def parse_date_end_exclusive(raw: str | None) -> str | None:
    if raw is None or raw.strip() == "":
        return None
    try:
        parsed = datetime.strptime(raw, "%Y-%m-%d")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="date_to must be YYYY-MM-DD.") from exc
    return (parsed + timedelta(days=1)).strftime("%Y-%m-%d 00:00:00")
