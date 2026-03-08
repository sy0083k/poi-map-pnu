from __future__ import annotations

import hashlib
import threading
import time
from pathlib import Path
from typing import Any

CACHE_TTL_SECONDS = 300
_cache_lock = threading.Lock()
_response_cache: dict[str, tuple[float, dict[str, Any]]] = {}


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
) -> str:
    joined = ",".join(sorted(set(pnus)))
    bbox_key = "none" if bbox is None else f"{bbox[0]:.6f},{bbox[1]:.6f},{bbox[2]:.6f},{bbox[3]:.6f}:{bbox_crs}"
    digest = hashlib.sha256(f"{theme}:{fgb_etag}:{joined}:{bbox_key}".encode("utf-8")).hexdigest()
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
