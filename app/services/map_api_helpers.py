from typing import Any, Literal

from fastapi import Request
from fastapi.responses import JSONResponse

from app.services import cadastral_highlight_service
from app.services.land_service import LandListFilters

THEME_CITY_OWNED: Literal["city_owned"] = "city_owned"


def parse_cursor(raw_cursor: str | None) -> int | None:
    if raw_cursor is None or raw_cursor.strip() == "":
        return None
    cursor = int(raw_cursor)
    if cursor < 0:
        raise ValueError("cursor must be >= 0")
    return cursor


def parse_theme(raw_theme: str | None) -> Literal["city_owned"]:
    if raw_theme is None or raw_theme.strip() == "":
        return THEME_CITY_OWNED
    theme = raw_theme.strip()
    if theme == THEME_CITY_OWNED:
        return THEME_CITY_OWNED
    raise ValueError("theme must be city_owned")


def parse_land_ids(raw_ids: Any, *, max_export_ids: int) -> list[int]:
    if not isinstance(raw_ids, list):
        raise ValueError("landIds must be an array of integers")
    parsed: list[int] = []
    seen: set[int] = set()
    for value in raw_ids:
        item_id = int(value)
        if item_id <= 0 or item_id in seen:
            continue
        seen.add(item_id)
        parsed.append(item_id)
    if not parsed:
        raise ValueError("landIds must include at least one positive integer")
    if len(parsed) > max_export_ids:
        raise ValueError(f"landIds must be <= {max_export_ids}")
    return parsed


def parse_highlight_payload(payload: Any) -> tuple[str, list[str], tuple[float, float, float, float] | None, str]:
    if not isinstance(payload, dict):
        raise ValueError("payload must be an object")
    theme = cadastral_highlight_service.parse_theme(payload.get("theme"))
    pnus = cadastral_highlight_service.parse_requested_pnus(payload.get("pnus"))
    bbox = cadastral_highlight_service.parse_bbox(payload.get("bbox"))
    bbox_crs = cadastral_highlight_service.parse_bbox_crs(payload.get("bboxCrs"))
    return theme, pnus, bbox, bbox_crs


def parse_debug_probe_query(
    *,
    bbox: str | None,
    bbox_crs: str | None,
    limit: int | None,
) -> tuple[tuple[float, float, float, float], str, int]:
    parsed_bbox = cadastral_highlight_service.parse_debug_probe_bbox(bbox)
    parsed_bbox_crs = cadastral_highlight_service.parse_bbox_crs(bbox_crs or "EPSG:4326")
    parsed_limit = cadastral_highlight_service.parse_debug_probe_limit(limit)
    return parsed_bbox, parsed_bbox_crs, parsed_limit


def parse_optional_bbox_query(
    *,
    bbox: str | None,
    bbox_crs: str | None,
) -> tuple[tuple[float, float, float, float] | None, str]:
    if bbox is None or bbox.strip() == "":
        return None, cadastral_highlight_service.parse_bbox_crs(bbox_crs or "EPSG:4326")
    parsed_bbox = cadastral_highlight_service.parse_debug_probe_bbox(bbox)
    parsed_bbox_crs = cadastral_highlight_service.parse_bbox_crs(bbox_crs or "EPSG:4326")
    return parsed_bbox, parsed_bbox_crs


def build_rate_limit_key(request: Request, payload: dict[str, Any]) -> str:
    client_ip = request.client.host if request.client else "unknown"
    anon_id = str(payload.get("anonId", "")).strip()
    if anon_id:
        return f"{client_ip}:{anon_id}"
    return client_ip


def build_rate_limited_response(retry_after: int) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={"success": False, "message": "요청이 너무 많습니다. 잠시 후 다시 시도해주세요."},
        headers={"Retry-After": str(retry_after)},
    )


def parse_land_list_filters(
    *,
    search_term: str | None,
    min_area: str | None,
    max_area: str | None,
    property_manager: str | None,
    property_usage: str | None,
    land_type: str | None,
) -> LandListFilters:
    return LandListFilters(
        search_term=(search_term or "").strip(),
        min_area=_parse_float_or_default(min_area, default=0.0),
        max_area=_parse_float_or_default(max_area, default=float("inf")),
        property_manager_term=(property_manager or "").strip(),
        property_usage_term=(property_usage or "").strip(),
        land_type_term=(land_type or "").strip(),
    )


def _parse_float_or_default(raw: str | None, *, default: float) -> float:
    if raw is None:
        return default
    value = raw.strip()
    if value == "":
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default
