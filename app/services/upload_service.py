import json
import logging
import os
from typing import Any, Literal

import pandas as pd
from fastapi import BackgroundTasks, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse

from app.db.connection import db_connection
from app.dependencies import validate_csrf_token
from app.logging_utils import RequestIdFilter
from app.repositories import land_repository
from app.validators import land_validators

logger = logging.getLogger(__name__)
logger.addFilter(RequestIdFilter())
ThemeType = Literal["city_owned"]
ALLOWED_CONTENT_TYPES = {
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "application/octet-stream",
}


def _table_name_for_theme(_theme: ThemeType) -> str:
    return land_repository.CITY_TABLE_NAME


def handle_excel_upload(
    request: Request,
    background_tasks: BackgroundTasks,
    csrf_token: str,
    file: UploadFile,
    theme: ThemeType = "city_owned",
) -> JSONResponse | dict:
    config, request_id, actor, client_ip = _resolve_upload_context(request)
    filename = _validate_upload_request(
        request=request,
        csrf_token=csrf_token,
        file=file,
        request_id=request_id,
        max_upload_size_mb=int(config.MAX_UPLOAD_SIZE_MB),
    )

    try:
        logger.info(
            "upload started",
            extra={
                "request_id": request_id,
                "event": "admin.upload.started",
                "theme": theme,
                "actor": actor,
                "ip": client_ip,
                "status": 202,
            },
        )
        df = _read_upload_dataframe(file=file, filename=filename, requested_sheet=config.UPLOAD_SHEET_NAME)
        normalized_rows, errors, total_errors = _normalize_upload_rows(
            df=df,
            request_id=request_id,
            max_upload_rows=int(config.MAX_UPLOAD_ROWS),
        )
        if total_errors:
            logger.warning("upload rejected: row validation failed", extra={"request_id": request_id})
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "message": "데이터 검증 실패",
                    "failed": total_errors,
                    "errors": errors,
                },
            )

        _replace_theme_lands(theme=theme, normalized_rows=normalized_rows)

        logger.info(
            "upload accepted: %s rows",
            len(df),
            extra={
                "request_id": request_id,
                "event": "admin.upload.succeeded",
                "theme": theme,
                "actor": actor,
                "ip": client_ip,
                "status": 200,
            },
        )
        return _build_upload_success_payload(total_rows=len(df), normalized_rows=normalized_rows)

    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "upload processing failed",
            extra={
                "request_id": request_id,
                "event": "admin.upload.failed",
                "theme": theme,
                "actor": actor,
                "ip": client_ip,
                "status": 500,
            },
        )
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": "업로드 처리 중 오류가 발생했습니다."},
        )


def _resolve_upload_context(request: Request) -> tuple[Any, str, str, str]:
    config = request.app.state.config
    request_id = getattr(request.state, "request_id", "-")
    actor = request.session.get("user", "anonymous")
    client_ip = request.client.host if request.client else "unknown"
    return config, request_id, actor, client_ip


def _validate_upload_request(
    *,
    request: Request,
    csrf_token: str,
    file: UploadFile,
    request_id: str,
    max_upload_size_mb: int,
) -> str:
    if not validate_csrf_token(request, csrf_token):
        raise HTTPException(status_code=403, detail="CSRF 토큰 검증에 실패했습니다.")

    filename = (file.filename or "").lower()
    if not filename.endswith((".xlsx", ".xls")):
        logger.warning("upload rejected: invalid extension", extra={"request_id": request_id})
        raise HTTPException(status_code=400, detail="엑셀 파일(.xlsx, .xls)만 업로드 가능합니다.")

    _validate_upload_file_size(file=file, request_id=request_id, max_upload_size_mb=max_upload_size_mb)
    _validate_upload_content_type(file=file)
    return filename


def _validate_upload_file_size(*, file: UploadFile, request_id: str, max_upload_size_mb: int) -> None:
    file.file.seek(0, os.SEEK_END)
    file_size = file.file.tell()
    file.file.seek(0)
    max_size_bytes = max_upload_size_mb * 1024 * 1024
    if file_size > max_size_bytes:
        logger.warning("upload rejected: file too large (%s bytes)", file_size, extra={"request_id": request_id})
        raise HTTPException(
            status_code=400,
            detail=f"파일 용량 제한({max_upload_size_mb}MB)을 초과했습니다.",
        )


def _validate_upload_content_type(*, file: UploadFile) -> None:
    content_type = (file.content_type or "").lower()
    if content_type and content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="지원하지 않는 파일 형식입니다.")


def _read_upload_dataframe(*, file: UploadFile, filename: str, requested_sheet: str) -> pd.DataFrame:
    excel_engine: Literal["xlrd", "openpyxl"] = "xlrd" if filename.endswith(".xls") else "openpyxl"
    excel_book = pd.ExcelFile(file.file, engine=excel_engine)
    if requested_sheet in excel_book.sheet_names:
        return pd.read_excel(excel_book, sheet_name=requested_sheet)
    return pd.read_excel(excel_book, sheet_name=excel_book.sheet_names[0])


def _normalize_upload_rows(
    *,
    df: pd.DataFrame,
    request_id: str,
    max_upload_rows: int,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], int]:
    missing = land_validators.validate_required_columns(df)
    if missing:
        logger.warning("upload rejected: required columns missing", extra={"request_id": request_id})
        raise HTTPException(status_code=400, detail=f"필수 컬럼 누락: {', '.join(missing)}")

    if len(df) > max_upload_rows:
        logger.warning("upload rejected: row count exceeded (%s)", len(df), extra={"request_id": request_id})
        raise HTTPException(
            status_code=400,
            detail=f"최대 업로드 행 수({max_upload_rows})를 초과했습니다.",
        )

    return land_validators.normalize_upload_rows(df)


def _replace_theme_lands(*, theme: ThemeType, normalized_rows: list[dict[str, Any]]) -> None:
    with db_connection() as conn:
        table_name = _table_name_for_theme(theme)
        land_repository.delete_all(conn, table_name=table_name)

        for row in normalized_rows:
            land_repository.insert_land(
                conn,
                pnu=row["pnu"],
                address=row["address"],
                land_type=row["land_type"],
                area=row["area"],
                property_manager=row["property_manager"],
                property_usage=row.get("property_usage", ""),
                source_fields_json=json.dumps(row["source_fields"], ensure_ascii=False),
                table_name=table_name,
            )
        conn.commit()


def _build_upload_success_payload(*, total_rows: int, normalized_rows: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "success": True,
        "total": total_rows,
        "message": "엑셀 데이터 입력 완료",
        "pnuSummary": {
            "totalRows": total_rows,
            "uniquePnu": len({row["pnu"] for row in normalized_rows}),
        },
    }
