from __future__ import annotations

from collections.abc import Iterable, Iterator
from pathlib import Path
from typing import Any

from fastapi import HTTPException

from app.services import cadastral_fgb_service
from app.services.cadastral_highlight_cache import (
    CACHE_KEY_VERSION,
    LEGACY_CACHE_KEY_VERSION,
    build_cache_key,
    build_file_etag,
    get_cached_response_with_fallback,
    set_cached_response,
)
from app.services.cadastral_highlight_geometry import (
    extract_pnu_from_properties,
    geometry_intersects_bbox,
    transform_bbox_to_crs,
    transform_geometry_to_wgs84,
)

MAX_REQUEST_PNUS = 10000
SUPPORTED_THEMES = {"city_owned", "national_public"}
SUPPORTED_CRS = {"EPSG:3857", "EPSG:4326"}
DEBUG_PROBE_FGB_PATH = "data/LSMD_CONT_LDREG_44210_202602.fgb"
DEFAULT_DEBUG_PROBE_LIMIT = 1000
MAX_DEBUG_PROBE_LIMIT = 5000


def normalize_pnu(raw: Any) -> str:
    return "".join(ch for ch in str(raw or "") if ch.isdigit())


def parse_requested_pnus(raw_pnus: Any) -> list[str]:
    if not isinstance(raw_pnus, list):
        raise HTTPException(status_code=400, detail="pnus must be an array of strings")

    normalized: list[str] = []
    seen: set[str] = set()
    for raw in raw_pnus:
        pnu = normalize_pnu(raw)
        if len(pnu) != 19 or pnu in seen:
            continue
        seen.add(pnu)
        normalized.append(pnu)

    if not normalized:
        raise HTTPException(status_code=400, detail="pnus must include at least one 19-digit PNU")
    if len(normalized) > MAX_REQUEST_PNUS:
        raise HTTPException(status_code=400, detail=f"pnus must be <= {MAX_REQUEST_PNUS}")
    return normalized


def parse_theme(raw_theme: Any) -> str:
    theme = str(raw_theme or "").strip() or "city_owned"
    if theme not in SUPPORTED_THEMES:
        raise HTTPException(status_code=400, detail="theme must be city_owned or national_public")
    return theme


def parse_bbox(raw_bbox: Any) -> tuple[float, float, float, float] | None:
    if raw_bbox is None:
        return None
    if not isinstance(raw_bbox, list) or len(raw_bbox) != 4:
        raise HTTPException(status_code=400, detail="bbox must be [minX, minY, maxX, maxY]")
    try:
        min_x, min_y, max_x, max_y = (float(raw_bbox[0]), float(raw_bbox[1]), float(raw_bbox[2]), float(raw_bbox[3]))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="bbox values must be numbers") from exc
    if min_x > max_x or min_y > max_y:
        raise HTTPException(status_code=400, detail="bbox min values must be <= max values")
    return (min_x, min_y, max_x, max_y)


def parse_bbox_crs(raw_bbox_crs: Any) -> str:
    bbox_crs = str(raw_bbox_crs or "").strip().upper() or "EPSG:3857"
    if bbox_crs not in SUPPORTED_CRS:
        raise HTTPException(status_code=400, detail="bboxCrs must be EPSG:3857 or EPSG:4326")
    return bbox_crs


def parse_debug_probe_bbox(raw_bbox: Any) -> tuple[float, float, float, float]:
    if not isinstance(raw_bbox, str) or raw_bbox.strip() == "":
        raise HTTPException(status_code=400, detail="bbox query is required")
    parts = [part.strip() for part in raw_bbox.split(",")]
    if len(parts) != 4:
        raise HTTPException(status_code=400, detail="bbox must be minX,minY,maxX,maxY")
    return parse_bbox(parts)


def parse_debug_probe_limit(raw_limit: Any) -> int:
    if raw_limit is None or str(raw_limit).strip() == "":
        return DEFAULT_DEBUG_PROBE_LIMIT
    try:
        limit = int(raw_limit)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="limit must be an integer") from exc
    if limit <= 0:
        raise HTTPException(status_code=400, detail="limit must be > 0")
    return min(limit, MAX_DEBUG_PROBE_LIMIT)


def get_filtered_highlights(
    *,
    base_dir: str,
    configured_path: str,
    pnu_field: str,
    cadastral_crs: str,
    theme: str,
    requested_pnus: list[str],
    bbox: tuple[float, float, float, float] | None = None,
    bbox_crs: str = "EPSG:3857",
) -> dict[str, Any]:
    file_path = cadastral_fgb_service.resolve_fgb_path_for_health(
        base_dir=base_dir,
        configured_path=configured_path,
    )
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="연속지적도 파일을 찾을 수 없습니다.")
    if bbox is not None and bbox_crs != cadastral_crs:
        raise HTTPException(
            status_code=400,
            detail=f"bboxCrs({bbox_crs}) must match cadastral CRS({cadastral_crs})",
        )

    fgb_etag = build_file_etag(file_path)
    cache_key = build_cache_key(
        theme=theme,
        pnus=requested_pnus,
        fgb_etag=fgb_etag,
        bbox=bbox,
        bbox_crs=bbox_crs,
        version=CACHE_KEY_VERSION,
    )
    legacy_cache_key = build_cache_key(
        theme=theme,
        pnus=requested_pnus,
        fgb_etag=fgb_etag,
        bbox=bbox,
        bbox_crs=bbox_crs,
        version=LEGACY_CACHE_KEY_VERSION,
    )
    cached = get_cached_response_with_fallback([cache_key, legacy_cache_key])
    if cached:
        return cached

    response = build_filtered_geojson_response(
        file_path=file_path,
        pnu_field=pnu_field,
        requested_pnus=requested_pnus,
        fgb_etag=fgb_etag,
        cadastral_crs=cadastral_crs,
        bbox=bbox,
        bbox_crs=bbox_crs,
    )
    set_cached_response(cache_key, response)
    return response


def get_debug_probe_geojson_response(
    *,
    base_dir: str,
    pnu_field: str,
    cadastral_crs: str,
    bbox: tuple[float, float, float, float],
    bbox_crs: str,
    limit: int,
) -> dict[str, Any]:
    file_path = cadastral_fgb_service.resolve_fgb_path_for_health(
        base_dir=base_dir,
        configured_path=DEBUG_PROBE_FGB_PATH,
    )
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="디버그 대상 FGB 파일을 찾을 수 없습니다.")

    try:
        source_bbox = transform_bbox_to_crs(bbox, source_crs=bbox_crs, target_crs=cadastral_crs)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        loaded = load_features_from_fgb(file_path, bbox=source_bbox)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    features: list[dict[str, Any]] = []
    scanned = 0
    transformed = 0
    truncated = False

    for feature in loaded:
        scanned += 1
        geometry = feature.get("geometry") if isinstance(feature, dict) else None
        if geometry is None:
            continue
        transformed_geometry = transform_geometry_to_wgs84(geometry, source_crs=cadastral_crs)
        if transformed_geometry is None:
            continue

        properties = feature.get("properties", {}) if isinstance(feature, dict) else {}
        geometry_type = transformed_geometry.get("type") if isinstance(transformed_geometry, dict) else None
        features.append(
            {
                "type": "Feature",
                "geometry": transformed_geometry,
                "properties": {
                    "pnu": normalize_pnu(extract_pnu_from_properties(properties, pnu_field)),
                    "geometry_type": geometry_type,
                },
            }
        )
        transformed += 1
        if len(features) >= limit:
            truncated = True
            break

    return {
        "type": "FeatureCollection",
        "features": features,
        "meta": {
            "scanned": scanned,
            "returned": len(features),
            "transformed": transformed,
            "truncated": truncated,
            "limit": limit,
            "bboxApplied": True,
            "bboxCrs": bbox_crs,
            "sourceCrs": cadastral_crs,
            "outputCrs": "EPSG:4326",
            "sourceFile": DEBUG_PROBE_FGB_PATH,
        },
    }


def build_filtered_geojson_response(
    *,
    file_path: Path,
    pnu_field: str,
    requested_pnus: list[str],
    fgb_etag: str,
    cadastral_crs: str = "EPSG:3857",
    bbox: tuple[float, float, float, float] | None = None,
    bbox_crs: str = "EPSG:3857",
) -> dict[str, Any]:
    wanted = set(requested_pnus)
    matched: set[str] = set()
    features: list[dict[str, Any]] = []
    scanned = 0
    bbox_filtered = 0

    try:
        all_features = load_features_from_fgb(file_path, bbox=bbox)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    scanned, bbox_filtered, features, matched = collect_matching_features(
        all_features=all_features,
        pnu_field=pnu_field,
        wanted=wanted,
        cadastral_crs=cadastral_crs,
        bbox=bbox,
    )

    return {
        "type": "FeatureCollection",
        "features": features,
        "meta": {
            "requested": len(wanted),
            "matched": len(matched),
            "scanned": scanned,
            "bboxApplied": bbox is not None,
            "bboxFiltered": bbox_filtered,
            "source": "parsed",
            "fgbEtag": fgb_etag,
            "bboxCrs": bbox_crs if bbox is not None else None,
            "outputCrs": "EPSG:4326",
        },
    }


def load_features_from_fgb(
    file_path: Path,
    *,
    bbox: tuple[float, float, float, float] | None = None,
) -> Iterator[dict[str, Any]]:
    try:
        import flatgeobuf as fgb
    except ImportError as exc:
        raise RuntimeError(
            "flatgeobuf package is required for /api/cadastral/highlights. Install dependencies first."
        ) from exc
    return _iter_features_from_fgb(file_path=file_path, fgb_module=fgb, bbox=bbox)


def _iter_features_from_fgb(
    *,
    file_path: Path,
    fgb_module: Any,
    bbox: tuple[float, float, float, float] | None = None,
) -> Iterator[dict[str, Any]]:
    with file_path.open("rb") as handle:
        try:
            reader = fgb_module.Reader(handle, bbox=bbox)
            for feature in reader:
                if isinstance(feature, dict):
                    yield feature
            return
        except Exception:
            handle.seek(0)
            loaded = fgb_module.load(handle, bbox=bbox)

    yield from _iter_dict_features(loaded)


def _iter_dict_features(loaded: Any) -> Iterator[dict[str, Any]]:
    if isinstance(loaded, dict):
        raw_features = loaded.get("features", [])
    else:
        raw_features = loaded
    if not isinstance(raw_features, list):
        try:
            raw_features = list(raw_features)
        except Exception:
            return
    for item in raw_features:
        if isinstance(item, dict):
            yield item


def collect_matching_features(
    *,
    all_features: Iterable[dict[str, Any]],
    pnu_field: str,
    wanted: set[str],
    cadastral_crs: str,
    bbox: tuple[float, float, float, float] | None,
) -> tuple[int, int, list[dict[str, Any]], set[str]]:
    scanned = 0
    bbox_filtered = 0
    matched: set[str] = set()
    features: list[dict[str, Any]] = []

    for feature in all_features:
        scanned += 1
        properties = feature.get("properties", {}) if isinstance(feature, dict) else {}
        pnu_raw = extract_pnu_from_properties(properties, pnu_field)
        pnu = normalize_pnu(pnu_raw)
        if pnu not in wanted or pnu in matched:
            continue

        geometry = feature.get("geometry") if isinstance(feature, dict) else None
        if geometry is None:
            continue
        if bbox is not None and not geometry_intersects_bbox(geometry, bbox):
            bbox_filtered += 1
            continue

        matched.add(pnu)
        transformed_geometry = transform_geometry_to_wgs84(geometry, source_crs=cadastral_crs)
        if transformed_geometry is None:
            matched.remove(pnu)
            continue
        features.append(
            {
                "type": "Feature",
                "geometry": transformed_geometry,
                "properties": {"pnu": pnu},
            }
        )
        if len(matched) >= len(wanted):
            break

    return scanned, bbox_filtered, features, matched
