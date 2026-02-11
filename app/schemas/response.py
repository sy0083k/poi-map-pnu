from typing import Any

from pydantic import BaseModel, Field


class ApiErrorResponse(BaseModel):
    detail: str
    request_id: str | None = None


class LoginResponse(BaseModel):
    success: bool
    message: str | None = None


class UploadResponse(BaseModel):
    success: bool
    total: int | None = None
    message: str


class ValidationErrorItem(BaseModel):
    row_index: int = Field(ge=0)
    field: str
    reason: str
    value: Any | None = None


class MapConfigResponse(BaseModel):
    vworldKey: str
    center: tuple[float, float]
    zoom: int


class LandFeatureCollectionResponse(BaseModel):
    type: str = "FeatureCollection"
    features: list[dict[str, Any]] = Field(default_factory=list)


class HealthResponse(BaseModel):
    status: str
