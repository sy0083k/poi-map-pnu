from typing import Any, Final, Literal

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from app.services import (
    cadastral_fgb_service,
    cadastral_highlight_service,
    land_service,
    stats_service,
)

DEFAULT_LANDS_PAGE_LIMIT = 500
MAX_LANDS_PAGE_LIMIT = 2000
MAX_EXPORT_IDS = 10000
EVENT_LIMIT_PER_MINUTE = 60
WEB_EVENT_LIMIT_PER_MINUTE = 120
RATE_LIMIT_WINDOW_SECONDS = 60
THEME_CITY_OWNED: Final[Literal["city_owned"]] = "city_owned"


def _parse_cursor(raw_cursor: str | None) -> int | None:
    if raw_cursor is None or raw_cursor.strip() == "":
        return None
    cursor = int(raw_cursor)
    if cursor < 0:
        raise ValueError("cursor must be >= 0")
    return cursor


def _parse_theme(raw_theme: str | None) -> Literal["city_owned"]:
    if raw_theme is None or raw_theme.strip() == "":
        return THEME_CITY_OWNED
    theme = raw_theme.strip()
    if theme == THEME_CITY_OWNED:
        return THEME_CITY_OWNED
    raise ValueError("theme must be city_owned")


def _parse_land_ids(raw_ids: Any) -> list[int]:
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
    if len(parsed) > MAX_EXPORT_IDS:
        raise ValueError(f"landIds must be <= {MAX_EXPORT_IDS}")
    return parsed


def _parse_highlight_payload(payload: Any) -> tuple[str, list[str]]:
    if not isinstance(payload, dict):
        raise ValueError("payload must be an object")
    theme = cadastral_highlight_service.parse_theme(payload.get("theme"))
    pnus = cadastral_highlight_service.parse_requested_pnus(payload.get("pnus"))
    return theme, pnus


def _rate_limit_key(request: Request, payload: dict[str, Any]) -> str:
    client_ip = request.client.host if request.client else "unknown"
    anon_id = str(payload.get("anonId", "")).strip()
    if anon_id:
        return f"{client_ip}:{anon_id}"
    return client_ip


def _rate_limited_response(retry_after: int) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={"success": False, "message": "요청이 너무 많습니다. 잠시 후 다시 시도해주세요."},
        headers={"Retry-After": str(retry_after)},
    )


def create_router() -> APIRouter:
    router = APIRouter()

    @router.get("/config")
    async def get_config(request: Request) -> dict[str, Any]:
        config = request.app.state.config
        return {
            "vworldKey": config.VWORLD_WMTS_KEY,
            "center": [config.CENTER_LON, config.CENTER_LAT],
            "zoom": config.DEFAULT_ZOOM,
            "cadastralFgbUrl": "/api/cadastral/fgb",
            "cadastralPnuField": config.CADASTRAL_FGB_PNU_FIELD,
            "cadastralCrs": config.CADASTRAL_FGB_CRS,
            "cadastralMinRenderZoom": config.CADASTRAL_MIN_RENDER_ZOOM,
        }

    @router.get("/cadastral/fgb")
    async def get_cadastral_fgb(request: Request):
        config = request.app.state.config
        return cadastral_fgb_service.build_fgb_file_response(
            base_dir=config.BASE_DIR,
            configured_path=config.CADASTRAL_FGB_PATH,
            range_header=request.headers.get("range"),
        )

    @router.post("/cadastral/highlights")
    async def post_cadastral_highlights(request: Request, payload: dict[str, Any]) -> dict[str, Any]:
        try:
            theme, pnus = _parse_highlight_payload(payload)
        except (HTTPException, ValueError) as exc:
            if isinstance(exc, HTTPException):
                raise
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        config = request.app.state.config
        return cadastral_highlight_service.get_filtered_highlights(
            base_dir=config.BASE_DIR,
            configured_path=config.CADASTRAL_FGB_PATH,
            pnu_field=config.CADASTRAL_FGB_PNU_FIELD,
            theme=theme,
            requested_pnus=pnus,
        )

    @router.get("/lands")
    async def get_lands(
        limit: int = DEFAULT_LANDS_PAGE_LIMIT,
        cursor: str | None = None,
        theme: str | None = None,
    ) -> dict[str, Any]:
        clamped_limit = max(1, min(limit, MAX_LANDS_PAGE_LIMIT))
        try:
            parsed_cursor = _parse_cursor(cursor)
            parsed_theme = _parse_theme(theme)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return land_service.get_public_land_features_page(
            cursor=parsed_cursor,
            limit=clamped_limit,
            theme=parsed_theme,
        )

    @router.get("/lands/list")
    async def get_lands_list(
        limit: int = DEFAULT_LANDS_PAGE_LIMIT,
        cursor: str | None = None,
        theme: str | None = None,
    ) -> dict[str, Any]:
        clamped_limit = max(1, min(limit, MAX_LANDS_PAGE_LIMIT))
        try:
            parsed_cursor = _parse_cursor(cursor)
            parsed_theme = _parse_theme(theme)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return land_service.get_public_land_list_page(
            cursor=parsed_cursor,
            limit=clamped_limit,
            theme=parsed_theme,
        )

    @router.post("/lands/export")
    async def export_lands(payload: dict[str, Any]):
        try:
            parsed_theme = _parse_theme(str(payload.get("theme", "")))
            parsed_land_ids = _parse_land_ids(payload.get("landIds"))
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        try:
            return land_service.build_public_land_export_response(
                land_ids=parsed_land_ids,
                theme=parsed_theme,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @router.post("/events")
    async def post_map_event(request: Request, payload: dict[str, Any]):
        key = _rate_limit_key(request, payload)
        allowed, retry_after = request.app.state.event_rate_limiter.allow(
            key=f"events:{key}",
            limit=EVENT_LIMIT_PER_MINUTE,
            window_seconds=RATE_LIMIT_WINDOW_SECONDS,
        )
        if not allowed:
            return _rate_limited_response(retry_after)
        stats_service.record_map_event(payload)
        return {"success": True}

    @router.post("/web-events")
    async def post_web_event(request: Request, payload: dict[str, Any]):
        key = _rate_limit_key(request, payload)
        allowed, retry_after = request.app.state.event_rate_limiter.allow(
            key=f"web-events:{key}",
            limit=WEB_EVENT_LIMIT_PER_MINUTE,
            window_seconds=RATE_LIMIT_WINDOW_SECONDS,
        )
        if not allowed:
            return _rate_limited_response(retry_after)
        stats_service.record_web_visit_event(payload, request)
        return {"success": True}

    return router


router = create_router()
