from typing import Any

from fastapi import APIRouter, File, HTTPException, Request, UploadFile

from app.services import (
    cadastral_fgb_service,
    cadastral_highlight_service,
    file2map_upload_parse_service,
    land_service,
    map_api_helpers,
    stats_service,
)

DEFAULT_LANDS_PAGE_LIMIT = 500
MAX_LANDS_PAGE_LIMIT = 2000
MAX_EXPORT_IDS = 10000
EVENT_LIMIT_PER_MINUTE = 60
WEB_EVENT_LIMIT_PER_MINUTE = 120
RATE_LIMIT_WINDOW_SECONDS = 60


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
            "cadastralPmtilesUrl": config.CADASTRAL_PMTILES_URL,
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

    @router.get("/cadastral/debug-probe")
    async def get_cadastral_debug_probe(
        request: Request,
        bbox: str,
        bboxCrs: str = "EPSG:4326",
        limit: int | None = None,
    ) -> dict[str, Any]:
        try:
            parsed_bbox, parsed_bbox_crs, parsed_limit = map_api_helpers.parse_debug_probe_query(
                bbox=bbox,
                bbox_crs=bboxCrs,
                limit=limit,
            )
        except (HTTPException, ValueError) as exc:
            if isinstance(exc, HTTPException):
                raise
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        config = request.app.state.config
        return cadastral_highlight_service.get_debug_probe_geojson_response(
            base_dir=config.BASE_DIR,
            pnu_field=config.CADASTRAL_FGB_PNU_FIELD,
            cadastral_crs=config.CADASTRAL_FGB_CRS,
            bbox=parsed_bbox,
            bbox_crs=parsed_bbox_crs,
            limit=parsed_limit,
        )

    @router.post("/cadastral/highlights")
    async def post_cadastral_highlights(request: Request, payload: dict[str, Any]) -> dict[str, Any]:
        try:
            theme, pnus, bbox, bbox_crs = map_api_helpers.parse_highlight_payload(payload)
        except (HTTPException, ValueError) as exc:
            if isinstance(exc, HTTPException):
                raise
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        config = request.app.state.config
        return cadastral_highlight_service.get_filtered_highlights(
            base_dir=config.BASE_DIR,
            configured_path=config.CADASTRAL_FGB_PATH,
            pnu_field=config.CADASTRAL_FGB_PNU_FIELD,
            cadastral_crs=config.CADASTRAL_FGB_CRS,
            theme=theme,
            requested_pnus=pnus,
            bbox=bbox,
            bbox_crs=bbox_crs,
        )

    @router.get("/lands")
    async def get_lands(
        limit: int = DEFAULT_LANDS_PAGE_LIMIT,
        cursor: str | None = None,
        theme: str | None = None,
    ) -> dict[str, Any]:
        clamped_limit = max(1, min(limit, MAX_LANDS_PAGE_LIMIT))
        try:
            parsed_cursor = map_api_helpers.parse_cursor(cursor)
            parsed_theme = map_api_helpers.parse_theme(theme)
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
        searchTerm: str | None = None,
        minArea: str | None = None,
        maxArea: str | None = None,
        propertyManager: str | None = None,
        propertyUsage: str | None = None,
        landType: str | None = None,
    ) -> dict[str, Any]:
        clamped_limit = max(1, min(limit, MAX_LANDS_PAGE_LIMIT))
        try:
            parsed_cursor = map_api_helpers.parse_cursor(cursor)
            parsed_theme = map_api_helpers.parse_theme(theme)
            parsed_filters = map_api_helpers.parse_land_list_filters(
                search_term=searchTerm,
                min_area=minArea,
                max_area=maxArea,
                property_manager=propertyManager,
                property_usage=propertyUsage,
                land_type=landType,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return land_service.get_public_land_list_page(
            cursor=parsed_cursor,
            limit=clamped_limit,
            theme=parsed_theme,
            filters=parsed_filters,
        )

    @router.post("/lands/export")
    async def export_lands(payload: dict[str, Any]):
        try:
            parsed_theme = map_api_helpers.parse_theme(str(payload.get("theme", "")))
            parsed_land_ids = map_api_helpers.parse_land_ids(
                payload.get("landIds"),
                max_export_ids=MAX_EXPORT_IDS,
            )
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        try:
            return land_service.build_public_land_export_response(
                land_ids=parsed_land_ids,
                theme=parsed_theme,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @router.post("/file2map/upload/parse")
    async def parse_file2map_upload(file: UploadFile = File(...)):  # noqa: B008
        return file2map_upload_parse_service.parse_file2map_upload(file)

    @router.post("/events")
    async def post_map_event(request: Request, payload: dict[str, Any]):
        key = map_api_helpers.build_rate_limit_key(request, payload)
        allowed, retry_after = request.app.state.event_rate_limiter.allow(
            key=f"events:{key}",
            limit=EVENT_LIMIT_PER_MINUTE,
            window_seconds=RATE_LIMIT_WINDOW_SECONDS,
        )
        if not allowed:
            return map_api_helpers.build_rate_limited_response(retry_after)
        stats_service.record_map_event(payload)
        return {"success": True}

    @router.post("/web-events")
    async def post_web_event(request: Request, payload: dict[str, Any]):
        key = map_api_helpers.build_rate_limit_key(request, payload)
        allowed, retry_after = request.app.state.event_rate_limiter.allow(
            key=f"web-events:{key}",
            limit=WEB_EVENT_LIMIT_PER_MINUTE,
            window_seconds=RATE_LIMIT_WINDOW_SECONDS,
        )
        if not allowed:
            return map_api_helpers.build_rate_limited_response(retry_after)
        stats_service.record_web_visit_event(payload, request)
        return {"success": True}

    return router


router = create_router()
