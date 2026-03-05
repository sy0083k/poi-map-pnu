import json
from datetime import datetime
from io import BytesIO
from typing import Any, Literal, cast

import pandas as pd
from fastapi.responses import Response

from app.db.connection import db_connection
from app.repositories import poi_repository
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
ThemeType = Literal["national_public", "city_owned"]
EXPORT_REQUIRED_COLUMNS = ["고유번호", "소재지", "지목", "실면적", "재산관리관"]


def get_public_land_features(*, theme: ThemeType = "national_public") -> GeoJSONFeatureCollection:
    with db_connection(row_factory=True) as conn:
        rows = poi_repository.fetch_lands_with_geom_for_theme(conn, theme=theme)

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
    *, cursor: int | None, limit: int, theme: ThemeType = "national_public"
) -> dict[str, Any]:
    with db_connection(row_factory=True) as conn:
        rows = poi_repository.fetch_lands_with_geom_page_for_theme(
            conn, after_id=cursor, limit=limit, theme=theme
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
    *, cursor: int | None, limit: int, theme: ThemeType = "national_public"
) -> dict[str, Any]:
    with db_connection(row_factory=True) as conn:
        rows = poi_repository.fetch_lands_page_without_geom_for_theme(
            conn, after_id=cursor, limit=limit, theme=theme
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
    with db_connection(row_factory=True) as conn:
        rows = poi_repository.fetch_lands_by_ids_for_theme(conn, ids=land_ids, theme=theme)

    rows_by_id = {int(row["id"]): row for row in rows}
    ordered_rows = [rows_by_id[item_id] for item_id in land_ids if item_id in rows_by_id]
    if not ordered_rows:
        raise ValueError("다운로드할 검색 결과가 없습니다.")

    column_order: list[str] = []
    records: list[dict[str, str]] = []
    for row in ordered_rows:
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
        records.append(record)

    if not column_order:
        column_order = EXPORT_REQUIRED_COLUMNS.copy()
        records = [_build_fallback_record(row) for row in ordered_rows]

    frame = pd.DataFrame(records, columns=column_order).fillna("")
    output = BytesIO()
    frame.to_excel(output, index=False)
    filename = f"lands-search-result-{theme}-{datetime.now().strftime('%Y%m%d-%H%M%S')}.xlsx"
    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
    }
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
