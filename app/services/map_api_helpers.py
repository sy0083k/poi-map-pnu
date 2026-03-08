from typing import Any, Literal

from fastapi import Request
from fastapi.responses import JSONResponse

from app.services import cadastral_highlight_service

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
