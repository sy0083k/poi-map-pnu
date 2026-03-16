import io
from typing import Any

import pandas as pd
import pytest
from _pytest.monkeypatch import MonkeyPatch
from fastapi import BackgroundTasks, FastAPI, HTTPException
from starlette.datastructures import UploadFile
from starlette.requests import Request

from app.repositories import land_repository
from app.services import upload_service
from tests.helpers import init_test_db, table_name_for_theme


class DummyExcelFile:
    def __init__(self, *_args: object, sheet_names: list[str] | None = None, **_kwargs: object) -> None:
        self.sheet_names = sheet_names or ["목록"]


def _make_request(app: FastAPI, *, csrf_token: str) -> Request:
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/admin/upload/city",
        "headers": [],
        "client": ("127.0.0.1", 50000),
        "server": ("testserver", 80),
        "scheme": "http",
        "root_path": "",
        "query_string": b"",
        "app": app,
        "session": {"user": "admin", "csrf_token": csrf_token},
    }

    async def receive() -> dict[str, Any]:
        return {"type": "http.request", "body": b"", "more_body": False}

    return Request(scope, receive)


def _make_upload_file(name: str, content: bytes, content_type: str) -> UploadFile:
    return UploadFile(
        filename=name,
        file=io.BytesIO(content),
        headers={"content-type": content_type},
    )


def test_upload_service_success(
    build_app: Any, monkeypatch: MonkeyPatch, db_path: Any
) -> None:
    app = build_app()
    from app.db.connection import db_connection

    with db_connection() as conn:
        init_test_db(conn)
    request = _make_request(app, csrf_token="csrf")
    file = _make_upload_file(
        "upload.xlsx", b'PK\x03\x04' + b'\x00' * 20, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )

    df = pd.DataFrame(
        {
            "고유번호": ["1111012345678901234"],
            "소재지": ["addr"],
            "지목": ["답"],
            "실면적": [12.5],
            "재산관리관": ["홍길동"],
        }
    )
    monkeypatch.setattr(pd, "ExcelFile", lambda *_args, **_kwargs: DummyExcelFile(sheet_names=["목록"]))
    monkeypatch.setattr(pd, "read_excel", lambda *_args, **_kwargs: df)

    result = upload_service.handle_excel_upload(
        request=request,
        background_tasks=BackgroundTasks(),
        csrf_token="csrf",
        file=file,
    )
    assert result["success"] is True


def test_upload_service_success_city_theme(
    build_app: Any, monkeypatch: MonkeyPatch, db_path: Any
) -> None:
    app = build_app()
    from app.db.connection import db_connection

    with db_connection() as conn:
        init_test_db(conn)
    request = _make_request(app, csrf_token="csrf")
    file = _make_upload_file(
        "upload.xlsx", b'PK\x03\x04' + b'\x00' * 20, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )

    df = pd.DataFrame(
        {
            "고유번호": ["1111012345678901234"],
            "소재지": ["city-addr"],
            "지목": ["답"],
            "실면적": [12.5],
            "재산관리관": ["시유담당"],
        }
    )
    monkeypatch.setattr(pd, "ExcelFile", lambda *_args, **_kwargs: DummyExcelFile(sheet_names=["목록"]))
    monkeypatch.setattr(pd, "read_excel", lambda *_args, **_kwargs: df)

    result = upload_service.handle_excel_upload(
        request=request,
        background_tasks=BackgroundTasks(),
        csrf_token="csrf",
        file=file,
        theme="city_owned",
    )
    assert result["success"] is True

    with db_connection(row_factory=True) as conn:
        city_rows = land_repository.fetch_lands_page_without_geom(
            conn,
            after_id=None,
            limit=10,
            table_name=table_name_for_theme("city_owned"),
        )
    assert len(city_rows) == 1
    assert city_rows[0]["address"] == "city-addr"


def test_upload_service_rejects_bad_extension(build_app: Any, db_path: Any) -> None:
    app = build_app()
    request = _make_request(app, csrf_token="csrf")
    file = _make_upload_file("upload.txt", b"dummy", "text/plain")
    with pytest.raises(HTTPException) as exc:
        upload_service.handle_excel_upload(
            request=request,
            background_tasks=BackgroundTasks(),
            csrf_token="csrf",
            file=file,
        )
    assert exc.value.status_code == 400


def test_upload_service_rejects_bad_content_type(
    build_app: Any, monkeypatch: MonkeyPatch, db_path: Any
) -> None:
    app = build_app()
    request = _make_request(app, csrf_token="csrf")
    file = _make_upload_file("upload.xlsx", b"dummy", "text/plain")

    df = pd.DataFrame(
        {
            "고유번호": ["1111012345678901234"],
            "소재지": ["addr"],
            "지목": ["답"],
            "실면적": [12.5],
            "재산관리관": ["홍길동"],
        }
    )
    monkeypatch.setattr(pd, "ExcelFile", lambda *_args, **_kwargs: DummyExcelFile(sheet_names=["목록"]))
    monkeypatch.setattr(pd, "read_excel", lambda *_args, **_kwargs: df)

    with pytest.raises(HTTPException) as exc:
        upload_service.handle_excel_upload(
            request=request,
            background_tasks=BackgroundTasks(),
            csrf_token="csrf",
            file=file,
        )
    assert exc.value.status_code == 400


def test_upload_service_rejects_octet_stream_content_type(
    build_app: Any, db_path: Any
) -> None:
    """application/octet-stream must be rejected for Excel uploads (RISK-014)."""
    app = build_app()
    request = _make_request(app, csrf_token="csrf")
    file = _make_upload_file("upload.xlsx", b"dummy", "application/octet-stream")
    with pytest.raises(HTTPException) as exc:
        upload_service.handle_excel_upload(
            request=request,
            background_tasks=BackgroundTasks(),
            csrf_token="csrf",
            file=file,
        )
    assert exc.value.status_code == 400


def test_upload_service_rejects_wrong_magic_bytes_xlsx(build_app: Any, db_path: Any) -> None:
    app = build_app()
    request = _make_request(app, csrf_token="csrf")
    file = _make_upload_file(
        "bad.xlsx", b"NOT_A_ZIP" + b"\x00" * 10,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    with pytest.raises(HTTPException) as exc:
        upload_service.handle_excel_upload(
            request=request, background_tasks=BackgroundTasks(), csrf_token="csrf", file=file
        )
    assert exc.value.status_code == 400


def test_upload_service_rejects_wrong_magic_bytes_xls(build_app: Any, db_path: Any) -> None:
    app = build_app()
    request = _make_request(app, csrf_token="csrf")
    file = _make_upload_file(
        "bad.xls", b"NOT_OLE2" + b"\x00" * 10,
        "application/vnd.ms-excel"
    )
    with pytest.raises(HTTPException) as exc:
        upload_service.handle_excel_upload(
            request=request, background_tasks=BackgroundTasks(), csrf_token="csrf", file=file
        )
    assert exc.value.status_code == 400
def test_upload_service_missing_columns(
    build_app: Any, monkeypatch: MonkeyPatch, db_path: Any
) -> None:
    app = build_app()
    request = _make_request(app, csrf_token="csrf")
    file = _make_upload_file(
        "upload.xlsx", b'PK\x03\x04' + b'\x00' * 20, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    df = pd.DataFrame({"소재지": ["addr"]})
    monkeypatch.setattr(pd, "ExcelFile", lambda *_args, **_kwargs: DummyExcelFile(sheet_names=["목록"]))
    monkeypatch.setattr(pd, "read_excel", lambda *_args, **_kwargs: df)

    with pytest.raises(HTTPException) as exc:
        upload_service.handle_excel_upload(
            request=request,
            background_tasks=BackgroundTasks(),
            csrf_token="csrf",
            file=file,
        )
    assert exc.value.status_code == 400

