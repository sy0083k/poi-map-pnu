from fastapi import APIRouter, Request

from app.services import land_service

router = APIRouter()


@router.get("/config")
async def get_config(request: Request):
    config = request.app.state.config
    return {
        "vworldKey": config.VWORLD_KEY,
        "center": [config.CENTER_LON, config.CENTER_LAT],
        "zoom": config.DEFAULT_ZOOM,
    }


@router.get("/lands")
async def get_lands(request: Request):
    return land_service.get_public_land_features()
