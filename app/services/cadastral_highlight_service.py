from __future__ import annotations

import hashlib
import threading
import time
from pathlib import Path
from typing import Any

from fastapi import HTTPException

from app.services import cadastral_fgb_service

CACHE_TTL_SECONDS = 300
MAX_REQUEST_PNUS = 10000
SUPPORTED_THEMES = {"city_owned", "national_public"}

_cache_lock = threading.Lock()
_response_cache: dict[str, tuple[float, dict[str, Any]]] = {}


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


def get_filtered_highlights(
    *,
    base_dir: str,
    configured_path: str,
    pnu_field: str,
    theme: str,
    requested_pnus: list[str],
) -> dict[str, Any]:
    file_path = cadastral_fgb_service.resolve_fgb_path_for_health(
        base_dir=base_dir,
        configured_path=configured_path,
    )
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="연속지적도 파일을 찾을 수 없습니다.")

    fgb_etag = build_file_etag(file_path)
    cache_key = build_cache_key(theme=theme, pnus=requested_pnus, fgb_etag=fgb_etag)
    cached = get_cached_response(cache_key)
    if cached:
        return cached

    response = build_filtered_geojson_response(
        file_path=file_path,
        pnu_field=pnu_field,
        requested_pnus=requested_pnus,
        fgb_etag=fgb_etag,
    )
    set_cached_response(cache_key, response)
    return response


def build_file_etag(file_path: Path) -> str:
    stat = file_path.stat()
    return f'W/"{stat.st_size:x}-{stat.st_mtime_ns:x}"'


def build_cache_key(*, theme: str, pnus: list[str], fgb_etag: str) -> str:
    joined = ",".join(sorted(set(pnus)))
    digest = hashlib.sha256(f"{theme}:{fgb_etag}:{joined}".encode("utf-8")).hexdigest()
    return f"v1:{digest}"


def get_cached_response(cache_key: str) -> dict[str, Any] | None:
    now = time.time()
    with _cache_lock:
        hit = _response_cache.get(cache_key)
        if not hit:
            return None
        expires_at, payload = hit
        if expires_at < now:
            _response_cache.pop(cache_key, None)
            return None
        cached = dict(payload)
        cached_meta = dict(cached.get("meta", {}))
        cached_meta["source"] = "cache"
        cached["meta"] = cached_meta
        return cached


def set_cached_response(cache_key: str, payload: dict[str, Any]) -> None:
    with _cache_lock:
        _response_cache[cache_key] = (time.time() + CACHE_TTL_SECONDS, payload)


def build_filtered_geojson_response(
    *,
    file_path: Path,
    pnu_field: str,
    requested_pnus: list[str],
    fgb_etag: str,
) -> dict[str, Any]:
    wanted = set(requested_pnus)
    matched: set[str] = set()
    features: list[dict[str, Any]] = []
    scanned = 0

    try:
        all_features = load_features_from_fgb(file_path)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

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

        matched.add(pnu)
        features.append(
            {
                "type": "Feature",
                "geometry": geometry,
                "properties": {"pnu": pnu},
            }
        )
        if len(matched) >= len(wanted):
            break

    return {
        "type": "FeatureCollection",
        "features": features,
        "meta": {
            "requested": len(wanted),
            "matched": len(matched),
            "scanned": scanned,
            "source": "parsed",
            "fgbEtag": fgb_etag,
        },
    }


def extract_pnu_from_properties(properties: Any, pnu_field: str) -> Any:
    if not isinstance(properties, dict):
        return ""
    return (
        properties.get(pnu_field)
        or properties.get(pnu_field.lower())
        or properties.get(pnu_field.upper())
        or properties.get("JIBUN")
        or properties.get("jibun")
        or ""
    )


def load_features_from_fgb(file_path: Path) -> list[dict[str, Any]]:
    try:
        import flatgeobuf as fgb
    except ImportError as exc:
        raise RuntimeError(
            "flatgeobuf package is required for /api/cadastral/highlights. Install dependencies first."
        ) from exc

    with file_path.open("rb") as handle:
        loaded = fgb.load(handle)
    return to_feature_list(loaded)


def to_feature_list(loaded: Any) -> list[dict[str, Any]]:
    if isinstance(loaded, dict):
        return _to_dict_features(loaded.get("features", []))
    if isinstance(loaded, list):
        return _to_dict_features(loaded)
    try:
        return _to_dict_features(list(loaded))
    except Exception:
        return []


def _to_dict_features(raw_features: Any) -> list[dict[str, Any]]:
    if not isinstance(raw_features, list):
        return []
    return [item for item in raw_features if isinstance(item, dict)]
