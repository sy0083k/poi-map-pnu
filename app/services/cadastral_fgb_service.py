from __future__ import annotations

from pathlib import Path
from typing import Iterator

from fastapi import HTTPException
from fastapi.responses import Response, StreamingResponse

STREAMING_THRESHOLD_BYTES = 8 * 1024 * 1024


def build_fgb_file_response(
    *,
    base_dir: str,
    configured_path: str,
    range_header: str | None = None,
) -> Response:
    file_path = _resolve_fgb_path(base_dir=base_dir, configured_path=configured_path)
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="연속지적도 파일을 찾을 수 없습니다.")

    file_size = file_path.stat().st_size
    common_headers = {
        "Accept-Ranges": "bytes",
        "Content-Disposition": f'inline; filename="{file_path.name}"',
        "ETag": _build_file_etag(file_path),
    }

    if range_header:
        start, end = _parse_range_header(range_header=range_header, file_size=file_size)
        content_length = (end - start) + 1
        if content_length <= STREAMING_THRESHOLD_BYTES:
            payload = _read_range(file_path=file_path, start=start, end=end)
            headers = {
                **common_headers,
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Content-Length": str(len(payload)),
            }
            return Response(
                content=payload,
                media_type="application/x-flatgeobuf",
                status_code=206,
                headers=headers,
            )

        headers = {
            **common_headers,
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Content-Length": str(content_length),
        }
        return StreamingResponse(
            _iter_file_range(file_path=file_path, start=start, end=end),
            media_type="application/x-flatgeobuf",
            status_code=206,
            headers=headers,
        )

    if file_size <= STREAMING_THRESHOLD_BYTES:
        payload = file_path.read_bytes()
        headers = {**common_headers, "Content-Length": str(len(payload))}
        return Response(
            content=payload,
            media_type="application/x-flatgeobuf",
            headers=headers,
        )

    headers = {**common_headers, "Content-Length": str(file_size)}
    return StreamingResponse(
        _iter_file(file_path=file_path),
        media_type="application/x-flatgeobuf",
        headers=headers,
    )


def resolve_fgb_path_for_health(*, base_dir: str, configured_path: str) -> Path:
    return _resolve_fgb_path(base_dir=base_dir, configured_path=configured_path)


def _resolve_fgb_path(*, base_dir: str, configured_path: str) -> Path:
    raw = Path(configured_path)
    if raw.is_absolute():
        return raw
    return Path(base_dir) / raw


def _iter_file_range(*, file_path: Path, start: int, end: int, chunk_size: int = 64 * 1024) -> Iterator[bytes]:
    remaining = (end - start) + 1
    with file_path.open("rb") as handle:
        handle.seek(start)
        while remaining > 0:
            chunk = handle.read(min(chunk_size, remaining))
            if not chunk:
                break
            remaining -= len(chunk)
            yield chunk


def _read_range(*, file_path: Path, start: int, end: int) -> bytes:
    with file_path.open("rb") as handle:
        handle.seek(start)
        return handle.read(end - start + 1)


def _iter_file(*, file_path: Path, chunk_size: int = 64 * 1024) -> Iterator[bytes]:
    with file_path.open("rb") as handle:
        while True:
            chunk = handle.read(chunk_size)
            if not chunk:
                break
            yield chunk


def _parse_range_header(*, range_header: str, file_size: int) -> tuple[int, int]:
    value = _extract_single_range_value(range_header)
    start, end = _parse_range_bounds(value=value, file_size=file_size)
    return _validate_and_clamp_range(start=start, end=end, file_size=file_size)


def _extract_single_range_value(range_header: str) -> str:
    if not range_header.startswith("bytes="):
        raise HTTPException(status_code=416, detail="지원하지 않는 Range 헤더 형식입니다.")

    value = range_header[6:].strip()
    if "," in value:
        raise HTTPException(status_code=416, detail="멀티 파트 Range는 지원하지 않습니다.")
    if "-" not in value:
        raise HTTPException(status_code=416, detail="잘못된 Range 헤더 형식입니다.")
    return value


def _parse_range_bounds(*, value: str, file_size: int) -> tuple[int, int]:
    start_raw, end_raw = value.split("-", 1)
    try:
        if start_raw == "":
            suffix = int(end_raw)
            if suffix <= 0:
                raise ValueError
            return max(file_size - suffix, 0), file_size - 1
        start = int(start_raw)
        end = file_size - 1 if end_raw == "" else int(end_raw)
    except ValueError as exc:
        raise HTTPException(status_code=416, detail="Range 값은 정수여야 합니다.") from exc
    return start, end


def _validate_and_clamp_range(*, start: int, end: int, file_size: int) -> tuple[int, int]:
    if start < 0 or end < start or start >= file_size:
        raise HTTPException(status_code=416, detail="요청한 Range가 파일 범위를 벗어났습니다.")
    return start, min(end, file_size - 1)


def _build_file_etag(file_path: Path) -> str:
    stat = file_path.stat()
    return f'W/"{stat.st_size:x}-{stat.st_mtime_ns:x}"'
