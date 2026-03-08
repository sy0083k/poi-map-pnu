import json
import math
from dataclasses import dataclass
from datetime import datetime
from io import BytesIO
from typing import Any, Literal, cast

import pandas as pd
from fastapi.responses import Response

from app.db.connection import db_connection
from app.repositories import land_repository
from app.types import GeoJSONFeature, GeoJSONFeatureCollection

PUBLIC_LAND_FIELDS = {
    "id",
    "pnu",
    "address",
    "land_type",
    "area",
    "property_manager",
    "geom_status",
}
ThemeType = Literal["city_owned"]
EXPORT_REQUIRED_COLUMNS = ["고유번호", "소재지", "지목", "실면적", "재산관리관"]


@dataclass(frozen=True)
class LandListFilters:
    search_term: str = ""
    min_area: float = 0.0
    max_area: float = math.inf
    property_manager_term: str = ""
    property_usage_term: str = ""
    land_type_term: str = ""


def _table_name_for_theme(_theme: ThemeType) -> str:
    return land_repository.CITY_TABLE_NAME


def get_public_land_features(*, theme: ThemeType = "city_owned") -> GeoJSONFeatureCollection:
    with db_connection(row_factory=True) as conn:
        rows = land_repository.fetch_lands_with_geom(conn, table_name=_table_name_for_theme(theme))

    features: list[GeoJSONFeature] = []
    for row in rows:
        geometry = cast(dict[str, Any], json.loads(row["geom"]))
        features.append(
            {
                "type": "Feature",
                "geometry": geometry,
                "properties": {key: row[key] for key in row.keys() if key in PUBLIC_LAND_FIELDS},
            }
        )
    return {"type": "FeatureCollection", "features": features}


def get_public_land_features_page(
    *, cursor: int | None, limit: int, theme: ThemeType = "city_owned"
) -> dict[str, Any]:
    with db_connection(row_factory=True) as conn:
        rows = land_repository.fetch_lands_with_geom_page(
            conn,
            after_id=cursor,
            limit=limit,
            table_name=_table_name_for_theme(theme),
        )

    features: list[GeoJSONFeature] = []
    next_cursor: int | None = None
    for row in rows:
        geometry = cast(dict[str, Any], json.loads(row["geom"]))
        features.append(
            {
                "type": "Feature",
                "geometry": geometry,
                "properties": {key: row[key] for key in row.keys() if key in PUBLIC_LAND_FIELDS},
            }
        )
        next_cursor = int(row["id"])

    has_more = len(rows) == limit
    return {
        "type": "FeatureCollection",
        "features": features,
        "nextCursor": str(next_cursor) if has_more and next_cursor is not None else None,
    }


def get_public_land_list_page(
    *,
    cursor: int | None,
    limit: int,
    theme: ThemeType = "city_owned",
    filters: LandListFilters | None = None,
) -> dict[str, Any]:
    normalized_filters = filters or LandListFilters()
    max_area = normalized_filters.max_area if math.isfinite(normalized_filters.max_area) else None

    with db_connection(row_factory=True) as conn:
        rows = land_repository.fetch_lands_page_without_geom_filtered(
            conn,
            after_id=cursor,
            limit=limit,
            search_term=normalized_filters.search_term,
            min_area=normalized_filters.min_area,
            max_area=max_area,
            property_manager_term=normalized_filters.property_manager_term,
            property_usage_term=normalized_filters.property_usage_term,
            land_type_term=normalized_filters.land_type_term,
            table_name=_table_name_for_theme(theme),
        )

    items: list[dict[str, Any]] = []
    next_cursor: int | None = None
    for row in rows:
        source_fields = _decode_source_fields(row["source_fields_json"])
        items.append(
            {
                "id": row["id"],
                "pnu": row["pnu"],
                "address": row["address"],
                "land_type": row["land_type"],
                "area": row["area"],
                "property_manager": row["property_manager"],
                "sourceFields": source_fields,
            }
        )
        next_cursor = int(row["id"])

    has_more = len(rows) == limit
    return {
        "items": items,
        "nextCursor": str(next_cursor) if has_more and next_cursor is not None else None,
    }


def _decode_source_fields(raw: Any) -> list[dict[str, str]]:
    if not raw:
        return []
    try:
        parsed = json.loads(str(raw))
    except (TypeError, ValueError, json.JSONDecodeError):
        return []
    if not isinstance(parsed, list):
        return []

    fields: list[dict[str, str]] = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        label = str(item.get("label", "")).strip()
        key = str(item.get("key", label)).strip() or label
        if not label:
            continue
        value = str(item.get("value", "")).strip()
        fields.append({"key": key, "label": label, "value": value})
    return fields


def build_public_land_export_response(*, land_ids: list[int], theme: ThemeType) -> Response:
    ordered_rows = _fetch_ordered_export_rows(land_ids=land_ids, theme=theme)
    records, column_order = _build_export_records(ordered_rows)
    if not column_order:
        column_order = EXPORT_REQUIRED_COLUMNS.copy()
        records = [_build_fallback_record(row) for row in ordered_rows]
    return _build_excel_response(records=records, column_order=column_order, theme=theme)


def _fetch_ordered_export_rows(*, land_ids: list[int], theme: ThemeType) -> list[Any]:
    with db_connection(row_factory=True) as conn:
        rows = land_repository.fetch_lands_by_ids(
            conn,
            ids=land_ids,
            table_name=_table_name_for_theme(theme),
        )
    rows_by_id = {int(row["id"]): row for row in rows}
    ordered_rows = [rows_by_id[item_id] for item_id in land_ids if item_id in rows_by_id]
    if not ordered_rows:
        raise ValueError("다운로드할 검색 결과가 없습니다.")
    return ordered_rows


def _build_export_records(rows: list[Any]) -> tuple[list[dict[str, str]], list[str]]:
    column_order: list[str] = []
    records: list[dict[str, str]] = []
    for row in rows:
        record = _record_from_source_fields(row, column_order)
        records.append(record)
    return records, column_order


def _record_from_source_fields(row: Any, column_order: list[str]) -> dict[str, str]:
    decoded = _decode_source_fields(row["source_fields_json"])
    source_fields = decoded if decoded else _build_fallback_source_fields(row)
    record: dict[str, str] = {}
    for field in source_fields:
        label = str(field.get("label", "")).strip()
        if not label:
            continue
        if label not in column_order:
            column_order.append(label)
        record[label] = str(field.get("value", "")).strip()
    return record


def _build_excel_response(*, records: list[dict[str, str]], column_order: list[str], theme: ThemeType) -> Response:
    frame = pd.DataFrame(records, columns=column_order).fillna("")
    output = BytesIO()
    frame.to_excel(output, index=False)
    filename = f"lands-search-result-{theme}-{datetime.now().strftime('%Y%m%d-%H%M%S')}.xlsx"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return Response(
        content=output.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers,
    )


def _build_fallback_source_fields(row: Any) -> list[dict[str, str]]:
    return [
        {"key": "고유번호", "label": "고유번호", "value": str(row["pnu"] or "").strip()},
        {"key": "소재지", "label": "소재지", "value": str(row["address"] or "").strip()},
        {"key": "지목", "label": "지목", "value": str(row["land_type"] or "").strip()},
        {"key": "실면적", "label": "실면적", "value": str(row["area"] or "").strip()},
        {"key": "재산관리관", "label": "재산관리관", "value": str(row["property_manager"] or "").strip()},
    ]


def _build_fallback_record(row: Any) -> dict[str, str]:
    return {
        "고유번호": str(row["pnu"] or "").strip(),
        "소재지": str(row["address"] or "").strip(),
        "지목": str(row["land_type"] or "").strip(),
        "실면적": str(row["area"] or "").strip(),
        "재산관리관": str(row["property_manager"] or "").strip(),
    }
