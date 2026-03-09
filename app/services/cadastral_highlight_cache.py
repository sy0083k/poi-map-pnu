from __future__ import annotations

import hashlib
import os
import threading
import time
from collections import OrderedDict
from pathlib import Path
from typing import Any

CACHE_KEY_VERSION = 2
LEGACY_CACHE_KEY_VERSION = 1
_DEFAULT_CACHE_TTL_SECONDS = 300
_DEFAULT_MAX_CACHE_ENTRIES = 512

_cache_lock = threading.Lock()
_response_cache: OrderedDict[str, tuple[float, dict[str, Any]]] = OrderedDict()


def clear_cached_responses() -> None:
    with _cache_lock:
        _response_cache.clear()


def _read_int_env(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = int(raw.strip())
    except (TypeError, ValueError):
        return default
    return value if value > 0 else default


def _cache_ttl_seconds() -> int:
    return _read_int_env("HIGHLIGHT_CACHE_TTL_SECONDS", _DEFAULT_CACHE_TTL_SECONDS)


def _max_cache_entries() -> int:
    return _read_int_env("HIGHLIGHT_CACHE_MAX_ENTRIES", _DEFAULT_MAX_CACHE_ENTRIES)


def build_file_etag(file_path: Path) -> str:
    stat = file_path.stat()
    return f'W/"{stat.st_size:x}-{stat.st_mtime_ns:x}"'


def build_cache_key(
    *,
    theme: str,
    pnus: list[str],
    fgb_etag: str,
    bbox: tuple[float, float, float, float] | None = None,
    bbox_crs: str = "EPSG:3857",
    version: int = CACHE_KEY_VERSION,
) -> str:
    joined = ",".join(sorted(set(pnus)))
    bbox_key = build_bbox_key(bbox=bbox, bbox_crs=bbox_crs)
    digest = hashlib.sha256(f"{theme}:{fgb_etag}:{joined}:{bbox_key}".encode("utf-8")).hexdigest()
    return f"v{version}:{digest}"


def build_bbox_key(*, bbox: tuple[float, float, float, float] | None, bbox_crs: str) -> str:
    if bbox is None:
        return "bbox:none"
    return (
        f"bbox:{bbox[0]:.2f},{bbox[1]:.2f},{bbox[2]:.2f},{bbox[3]:.2f}:{bbox_crs}"
    )


def get_cached_response(cache_key: str) -> dict[str, Any] | None:
    now = time.time()
    with _cache_lock:
        _purge_expired(now=now)
        hit = _response_cache.get(cache_key)
        if not hit:
            return None
        expires_at, payload = hit
        _response_cache.move_to_end(cache_key)
        cached = dict(payload)
        cached_meta = dict(cached.get("meta", {}))
        cached_meta["source"] = "cache"
        cached_meta["cacheKeyVersion"] = _cache_key_version_from_key(cache_key)
        cached["meta"] = cached_meta
        return cached


def get_cached_response_with_fallback(cache_keys: list[str]) -> dict[str, Any] | None:
    for key in cache_keys:
        cached = get_cached_response(key)
        if cached is not None:
            return cached
    return None


def set_cached_response(cache_key: str, payload: dict[str, Any]) -> None:
    with _cache_lock:
        now = time.time()
        _purge_expired(now=now)
        _response_cache[cache_key] = (now + _cache_ttl_seconds(), payload)
        _response_cache.move_to_end(cache_key)
        _enforce_max_entries()


def _purge_expired(*, now: float) -> None:
    expired_keys = [key for key, (expires_at, _payload) in _response_cache.items() if expires_at < now]
    for key in expired_keys:
        _response_cache.pop(key, None)


def _enforce_max_entries() -> None:
    max_entries = _max_cache_entries()
    while len(_response_cache) > max_entries:
        _response_cache.popitem(last=False)


def _cache_key_version_from_key(cache_key: str) -> int:
    if ":" not in cache_key:
        return LEGACY_CACHE_KEY_VERSION
    prefix, _digest = cache_key.split(":", 1)
    if not prefix.startswith("v"):
        return LEGACY_CACHE_KEY_VERSION
    try:
        return int(prefix[1:])
    except ValueError:
        return LEGACY_CACHE_KEY_VERSION
