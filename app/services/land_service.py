import json
from typing import Any, cast

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


def get_public_land_features() -> GeoJSONFeatureCollection:
    with db_connection(row_factory=True) as conn:
        rows = poi_repository.fetch_lands_with_geom(conn)

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


def get_public_land_features_page(*, cursor: int | None, limit: int) -> dict[str, Any]:
    with db_connection(row_factory=True) as conn:
        rows = poi_repository.fetch_lands_with_geom_page(conn, after_id=cursor, limit=limit)

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


def get_public_land_list_page(*, cursor: int | None, limit: int) -> dict[str, Any]:
    with db_connection(row_factory=True) as conn:
        rows = poi_repository.fetch_lands_page_without_geom(conn, after_id=cursor, limit=limit)

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
