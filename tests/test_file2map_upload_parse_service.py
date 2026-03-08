import io

import pandas as pd
import pytest
from _pytest.monkeypatch import MonkeyPatch
from fastapi import HTTPException, UploadFile

from app.services import file2map_upload_parse_service
from tests.test_upload_service import DummyExcelFile


def _make_upload_file(name: str) -> UploadFile:
    return UploadFile(filename=name, file=io.BytesIO(b"dummy"))


def test_parse_file2map_upload_reports_row_number_from_two(monkeypatch: MonkeyPatch) -> None:
    frame = pd.DataFrame(
        {
            "고유번호": ["bad-pnu"],
            "소재지": ["충남 서산시 예천동 1-1"],
            "지목": ["전"],
            "실면적": [12.5],
            "재산관리관": ["회계과"],
        }
    )
    monkeypatch.setattr(pd, "ExcelFile", lambda *_args, **_kwargs: DummyExcelFile(sheet_names=["시트1"]))
    monkeypatch.setattr(pd, "read_excel", lambda *_args, **_kwargs: frame)

    with pytest.raises(HTTPException) as exc:
        file2map_upload_parse_service.parse_file2map_upload(_make_upload_file("sample.xlsx"))
    assert exc.value.status_code == 400
    assert exc.value.detail == "2행 고유번호(PNU)가 올바르지 않습니다."
