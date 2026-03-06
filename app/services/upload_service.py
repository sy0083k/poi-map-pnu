import json
import logging
import os
from typing import Literal

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
ThemeType = Literal["national_public", "city_owned"]


def _table_name_for_theme(theme: ThemeType) -> str:
    if theme == "city_owned":
        return land_repository.CITY_TABLE_NAME
    return land_repository.TABLE_NAME


def handle_excel_upload(
    request: Request,
    background_tasks: BackgroundTasks,
    csrf_token: str,
    file: UploadFile,
    theme: ThemeType = "national_public",
) -> JSONResponse | dict:
    config = request.app.state.config
    request_id = getattr(request.state, "request_id", "-")
    actor = request.session.get("user", "anonymous")
    client_ip = request.client.host if request.client else "unknown"

    if not validate_csrf_token(request, csrf_token):
        raise HTTPException(status_code=403, detail="CSRF 토큰 검증에 실패했습니다.")

    filename = (file.filename or "").lower()
    content_type = (file.content_type or "").lower()
    if not filename.endswith((".xlsx", ".xls")):
        logger.warning("upload rejected: invalid extension", extra={"request_id": request_id})
        raise HTTPException(status_code=400, detail="엑셀 파일(.xlsx, .xls)만 업로드 가능합니다.")

    file.file.seek(0, os.SEEK_END)
    file_size = file.file.tell()
    file.file.seek(0)
    max_size_bytes = int(config.MAX_UPLOAD_SIZE_MB) * 1024 * 1024
    if file_size > max_size_bytes:
        logger.warning("upload rejected: file too large (%s bytes)", file_size, extra={"request_id": request_id})
        raise HTTPException(
            status_code=400,
            detail=f"파일 용량 제한({config.MAX_UPLOAD_SIZE_MB}MB)을 초과했습니다.",
        )

    allowed_content_types = {
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
        "application/octet-stream",
    }
    if content_type and content_type not in allowed_content_types:
        raise HTTPException(status_code=400, detail="지원하지 않는 파일 형식입니다.")

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
        requested_sheet = config.UPLOAD_SHEET_NAME
        excel_engine: Literal["xlrd", "openpyxl"] = "xlrd" if filename.endswith(".xls") else "openpyxl"
        excel_book = pd.ExcelFile(file.file, engine=excel_engine)
        if requested_sheet in excel_book.sheet_names:
            df = pd.read_excel(excel_book, sheet_name=requested_sheet)
        else:
            df = pd.read_excel(excel_book, sheet_name=excel_book.sheet_names[0])

        missing = land_validators.validate_required_columns(df)
        if missing:
            logger.warning("upload rejected: required columns missing", extra={"request_id": request_id})
            raise HTTPException(status_code=400, detail=f"필수 컬럼 누락: {', '.join(missing)}")

        if len(df) > int(config.MAX_UPLOAD_ROWS):
            logger.warning("upload rejected: row count exceeded (%s)", len(df), extra={"request_id": request_id})
            raise HTTPException(
                status_code=400,
                detail=f"최대 업로드 행 수({config.MAX_UPLOAD_ROWS})를 초과했습니다.",
            )

        normalized_rows, errors, total_errors = land_validators.normalize_upload_rows(df)
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
                    source_fields_json=json.dumps(row["source_fields"], ensure_ascii=False),
                    table_name=table_name,
                )

            conn.commit()

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
        return {
            "success": True,
            "total": len(df),
            "message": "엑셀 데이터 입력 완료",
            "pnuSummary": {
                "totalRows": len(df),
                "uniquePnu": len({row["pnu"] for row in normalized_rows}),
            },
        }

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
