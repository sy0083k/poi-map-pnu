from fastapi import APIRouter, Request
from typing import Any

from app.services import land_service
from app.types import GeoJSONFeatureCollection

router = APIRouter()


@router.get("/config")
async def get_config(request: Request) -> dict[str, Any]:
    config = request.app.state.config
    return {
        "vworldKey": config.VWORLD_WMTS_KEY,
        "center": [config.CENTER_LON, config.CENTER_LAT],
        "zoom": config.DEFAULT_ZOOM,
    }


@router.get("/lands")
async def get_lands(request: Request) -> GeoJSONFeatureCollection:
    return land_service.get_public_land_features()
