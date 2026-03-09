from __future__ import annotations

import os
import shutil
import uuid
from pathlib import Path
from typing import Any

from fastapi import HTTPException, Request, UploadFile

from app.dependencies import validate_csrf_token
from app.services import admin_settings_service, cadastral_fgb_service
from app.services.cadastral_highlight_cache import clear_cached_responses

ALLOWED_CONTENT_TYPES = {
    "application/octet-stream",
    "application/x-flatgeobuf",
    "application/binary",
}
MAX_UPLOAD_SIZE_BYTES = 1024 * 1024 * 1024  # 1GB

def handle_cadastral_fgb_upload(
    request: Request,
    *,
    csrf_token: str,
    file: UploadFile,
) -> dict[str, Any]:
    if not validate_csrf_token(request, csrf_token):
        raise HTTPException(status_code=403, detail="CSRF 토큰 검증에 실패했습니다.")

    config = request.app.state.config
    old_path = cadastral_fgb_service.resolve_fgb_path_for_health(
        base_dir=config.BASE_DIR,
        configured_path=config.CADASTRAL_FGB_PATH,
    )
    data_dir = Path(config.BASE_DIR) / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    file_name = _validated_fgb_filename(file)
    final_path = data_dir / file_name
    temp_path = data_dir / f".upload-{uuid.uuid4().hex}.tmp.fgb"

    try:
        _write_upload_to_temp(file=file, temp_path=temp_path)
        _validate_fgb_file(temp_path)
        os.replace(temp_path, final_path)

        applied_relative_path = final_path.relative_to(Path(config.BASE_DIR)).as_posix()
        admin_settings_service.update_env_file(config.BASE_DIR, {"CADASTRAL_FGB_PATH": applied_relative_path})
        config.CADASTRAL_FGB_PATH = applied_relative_path
        clear_cached_responses()

        if old_path != final_path and old_path.exists() and old_path.is_file():
            old_path.unlink()

        stat = final_path.stat()
        return {
            "success": True,
            "message": "연속지적도 FGB 파일이 교체되어 즉시 반영되었습니다.",
            "appliedPath": applied_relative_path,
            "fileSizeBytes": stat.st_size,
            "appliedAt": str(stat.st_mtime_ns),
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"연속지적도 업로드 처리 중 오류가 발생했습니다: {exc}") from exc
    finally:
        if temp_path.exists():
            temp_path.unlink(missing_ok=True)


def _validated_fgb_filename(file: UploadFile) -> str:
    name = Path(file.filename or "").name
    if not name:
        raise HTTPException(status_code=400, detail="업로드 파일명이 비어 있습니다.")
    if not name.lower().endswith(".fgb"):
        raise HTTPException(status_code=400, detail="FlatGeobuf 파일(.fgb)만 업로드 가능합니다.")

    content_type = (file.content_type or "").strip().lower()
    if content_type and content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="지원하지 않는 파일 형식입니다.")
    return name


def _write_upload_to_temp(*, file: UploadFile, temp_path: Path) -> int:
    file.file.seek(0, os.SEEK_END)
    file_size = file.file.tell()
    file.file.seek(0)
    if file_size <= 0:
        raise HTTPException(status_code=400, detail="비어 있는 파일은 업로드할 수 없습니다.")
    if file_size > MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="파일 크기 제한(1GB)을 초과했습니다.")

    with temp_path.open("wb") as handle:
        shutil.copyfileobj(file.file, handle)
    return file_size


def _validate_fgb_file(file_path: Path) -> None:
    try:
        import flatgeobuf as fgb
    except ImportError as exc:
        raise HTTPException(status_code=500, detail="flatgeobuf 의존성이 설치되어 있지 않습니다.") from exc

    try:
        with file_path.open("rb") as handle:
            reader = fgb.Reader(handle)
            iterator = iter(reader)
            try:
                next(iterator)
            except StopIteration:
                pass
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"유효한 FlatGeobuf 파일이 아닙니다: {exc}") from exc
