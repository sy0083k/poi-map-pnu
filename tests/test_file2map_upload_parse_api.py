import httpx
import pandas as pd
import pytest
from _pytest.monkeypatch import MonkeyPatch

from tests.test_upload_service import DummyExcelFile


@pytest.mark.anyio
async def test_file2map_upload_parse_success(async_client: httpx.AsyncClient, monkeypatch: MonkeyPatch) -> None:
    frame = pd.DataFrame(
        {
            "고유번호": ["1111012345678901234"],
            "소재지": ["충남 서산시 예천동 1-1"],
            "지목": ["전"],
            "실면적": [12.5],
            "재산관리관": ["회계과"],
            "비고": ["테스트"],
        }
    )
    monkeypatch.setattr(pd, "ExcelFile", lambda *_args, **_kwargs: DummyExcelFile(sheet_names=["시트1"]))
    monkeypatch.setattr(pd, "read_excel", lambda *_args, **_kwargs: frame)

    response = await async_client.post(
        "/api/file2map/upload/parse",
        files={"file": ("sample.xlsx", b"dummy", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["summary"]["fileName"] == "sample.xlsx"
    assert payload["summary"]["rowCount"] == 1
    assert payload["summary"]["uniquePnuCount"] == 1
    assert payload["items"][0]["pnu"] == "1111012345678901234"
    assert payload["items"][0]["sourceFields"][-1]["label"] == "비고"


@pytest.mark.anyio
async def test_file2map_upload_parse_rejects_invalid_extension(async_client: httpx.AsyncClient) -> None:
    response = await async_client.post(
        "/api/file2map/upload/parse",
        files={"file": ("sample.txt", b"dummy", "text/plain")},
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "엑셀 파일(.xlsx, .xls)만 업로드할 수 있습니다."


@pytest.mark.anyio
async def test_file2map_upload_parse_rejects_missing_columns(
    async_client: httpx.AsyncClient, monkeypatch: MonkeyPatch
) -> None:
    frame = pd.DataFrame({"소재지": ["충남 서산시 예천동 1-1"]})
    monkeypatch.setattr(pd, "ExcelFile", lambda *_args, **_kwargs: DummyExcelFile(sheet_names=["시트1"]))
    monkeypatch.setattr(pd, "read_excel", lambda *_args, **_kwargs: frame)

    response = await async_client.post(
        "/api/file2map/upload/parse",
        files={"file": ("sample.xlsx", b"dummy", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert response.status_code == 400
    assert response.json()["detail"].startswith("필수 컬럼 누락:")


@pytest.mark.anyio
async def test_file2map_upload_parse_v1_alias_matches(
    async_client: httpx.AsyncClient, monkeypatch: MonkeyPatch
) -> None:
    frame = pd.DataFrame(
        {
            "고유번호": ["1111012345678901234"],
            "소재지": ["충남 서산시 예천동 1-1"],
            "지목": ["전"],
            "실면적": [12.5],
            "재산관리관": ["회계과"],
        }
    )
    monkeypatch.setattr(pd, "ExcelFile", lambda *_args, **_kwargs: DummyExcelFile(sheet_names=["시트1"]))
    monkeypatch.setattr(pd, "read_excel", lambda *_args, **_kwargs: frame)

    files = {"file": ("sample.xlsx", b"dummy", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    v0 = await async_client.post("/api/file2map/upload/parse", files=files)
    v1 = await async_client.post("/api/v1/file2map/upload/parse", files=files)
    assert v0.status_code == 200
    assert v1.status_code == 200
    assert v0.json() == v1.json()
