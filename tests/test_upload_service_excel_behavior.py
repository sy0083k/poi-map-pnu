from typing import Any

import pandas as pd
import pytest
from _pytest.monkeypatch import MonkeyPatch
from fastapi import BackgroundTasks

from app.services import upload_service
from tests.test_upload_service import DummyExcelFile, _make_request, _make_upload_file


def test_upload_service_sheet_name_fallback(build_app: Any, monkeypatch: MonkeyPatch, db_path: Any) -> None:
    app = build_app()
    from app.db.connection import db_connection
    from tests.helpers import init_test_db

    with db_connection() as conn:
        init_test_db(conn)
    request = _make_request(app, csrf_token="csrf")
    file = _make_upload_file(
        "upload.xlsx", b"dummy", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
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

    called: dict[str, object] = {}

    def _read_excel(_excel: object, *, sheet_name: str) -> pd.DataFrame:
        called["sheet_name"] = sheet_name
        return df

    monkeypatch.setattr(pd, "ExcelFile", lambda *_args, **_kwargs: DummyExcelFile(sheet_names=["시트1"]))
    monkeypatch.setattr(pd, "read_excel", _read_excel)

    result = upload_service.handle_excel_upload(
        request=request,
        background_tasks=BackgroundTasks(),
        csrf_token="csrf",
        file=file,
    )
    assert result["success"] is True
    assert called["sheet_name"] == "시트1"


@pytest.mark.parametrize(
    ("filename", "expected_engine", "content_type"),
    [
        ("upload.xlsx", "openpyxl", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
        ("upload.xls", "xlrd", "application/vnd.ms-excel"),
    ],
)
def test_upload_service_selects_excel_engine_by_extension(
    build_app: Any,
    monkeypatch: MonkeyPatch,
    db_path: Any,
    filename: str,
    expected_engine: str,
    content_type: str,
) -> None:
    app = build_app()
    from app.db.connection import db_connection
    from tests.helpers import init_test_db

    with db_connection() as conn:
        init_test_db(conn)

    request = _make_request(app, csrf_token="csrf")
    file = _make_upload_file(filename, b"dummy", content_type)
    df = pd.DataFrame(
        {
            "고유번호": ["1111012345678901234"],
            "소재지": ["addr"],
            "지목": ["답"],
            "실면적": [12.5],
            "재산관리관": ["홍길동"],
        }
    )

    called: dict[str, object] = {}

    def _excel_file(*_args: object, engine: str, **_kwargs: object) -> DummyExcelFile:
        called["engine"] = engine
        return DummyExcelFile(sheet_names=["목록"])

    monkeypatch.setattr(pd, "ExcelFile", _excel_file)
    monkeypatch.setattr(pd, "read_excel", lambda *_args, **_kwargs: df)

    result = upload_service.handle_excel_upload(
        request=request,
        background_tasks=BackgroundTasks(),
        csrf_token="csrf",
        file=file,
    )
    assert result["success"] is True
    assert called["engine"] == expected_engine
