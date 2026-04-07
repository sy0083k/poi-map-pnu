from __future__ import annotations

import logging
import os
import shutil
import uuid
from pathlib import Path
from typing import Any

from fastapi import HTTPException, Request, UploadFile

from app.dependencies import validate_csrf_token
from app.services import admin_settings_service
from app.services.cadastral_fgb_service import resolve_fgb_path_for_health
from app.services.cadastral_highlight_cache import clear_cached_responses

logger = logging.getLogger(__name__)

ALLOWED_CONTENT_TYPES = {
    "application/octet-stream",
    "application/vnd.pmtiles",
    "application/binary",
}
MAX_UPLOAD_SIZE_BYTES = 1024 * 1024 * 1024  # 1GB


def handle_cadastral_pmtiles_upload(
    request: Request,
    *,
    csrf_token: str,
    file: UploadFile,
) -> dict[str, Any]:
    if not validate_csrf_token(request, csrf_token):
        raise HTTPException(status_code=403, detail="CSRF 토큰 검증에 실패했습니다.")

    config = request.app.state.config
    old_path = resolve_fgb_path_for_health(
        base_dir=config.BASE_DIR,
        configured_path=config.CADASTRAL_PMTILES_PATH,
    )
    data_dir = Path(config.BASE_DIR) / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    file_name = _validated_pmtiles_filename(file)
    final_path = data_dir / file_name
    temp_path = data_dir / f".upload-{uuid.uuid4().hex}.tmp.pmtiles"
    backup_path = data_dir / f".backup-{uuid.uuid4().hex}.pmtiles"

    try:
        _write_upload_to_temp(file=file, temp_path=temp_path)
        _validate_pmtiles_file(temp_path)
        if old_path.exists() and old_path.is_file():
            shutil.copy2(old_path, backup_path)
        os.replace(temp_path, final_path)

        applied_relative_path = final_path.relative_to(Path(config.BASE_DIR)).as_posix()
        admin_settings_service.update_env_file(config.BASE_DIR, {"CADASTRAL_PMTILES_PATH": applied_relative_path})
        config.CADASTRAL_PMTILES_PATH = applied_relative_path
        clear_cached_responses()

        if old_path != final_path and old_path.exists() and old_path.is_file():
            old_path.unlink(missing_ok=True)
        if backup_path.exists():
            backup_path.unlink(missing_ok=True)

        stat = final_path.stat()
        return {
            "success": True,
            "message": "PMTiles 파일이 교체되었습니다.",
            "appliedPath": applied_relative_path,
            "fileSizeBytes": stat.st_size,
            "appliedAt": str(stat.st_mtime_ns),
        }
    except HTTPException:
        _restore_backup_file(backup_path=backup_path, final_path=final_path, old_path=old_path)
        raise
    except Exception as exc:
        _restore_backup_file(backup_path=backup_path, final_path=final_path, old_path=old_path)
        raise HTTPException(status_code=500, detail=f"PMTiles 업로드 처리 중 오류가 발생했습니다: {exc}") from exc
    finally:
        if temp_path.exists():
            temp_path.unlink(missing_ok=True)
        if backup_path.exists():
            backup_path.unlink(missing_ok=True)


def _validated_pmtiles_filename(file: UploadFile) -> str:
    name = Path(file.filename or "").name
    if not name:
        raise HTTPException(status_code=400, detail="업로드 파일명이 비어 있습니다.")
    if not name.lower().endswith(".pmtiles"):
        raise HTTPException(status_code=400, detail="PMTiles 파일(.pmtiles)만 업로드 가능합니다.")

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


def _validate_pmtiles_file(file_path: Path) -> None:
    with file_path.open("rb") as fh:
        header = fh.read(127)
    if len(header) < 127:
        raise HTTPException(status_code=400, detail="유효한 PMTiles 파일이 아닙니다: 파일이 너무 작습니다.")
    if header[:2] != b'PM':
        raise HTTPException(status_code=400, detail="유효한 PMTiles 파일이 아닙니다: 파일 시그니처 불일치")


def _restore_backup_file(*, backup_path: Path, final_path: Path, old_path: Path) -> None:
    if backup_path.exists():
        os.replace(backup_path, old_path)
        if final_path.exists() and final_path != old_path:
            final_path.unlink(missing_ok=True)
        return
    if final_path.exists() and final_path != old_path:
        final_path.unlink(missing_ok=True)
