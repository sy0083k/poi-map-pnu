from __future__ import annotations

from typing import Any, TypedDict


class GeoJSONFeature(TypedDict):
    type: str
    geometry: dict[str, Any]
    properties: dict[str, Any]


class GeoJSONFeatureCollection(TypedDict):
    type: str
    features: list[GeoJSONFeature]


class UploadValidationErrorItem(TypedDict):
    row: int
    field: str
    code: str
    value: str


class UploadValidationFailure(TypedDict):
    success: bool
    message: str
    failed: int
    errors: list[UploadValidationErrorItem]

