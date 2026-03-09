import io
import re
from pathlib import Path

import httpx
import pytest
from _pytest.monkeypatch import MonkeyPatch

CSRF_PATTERN = r'name="csrf_token" value="([^"]+)"'


async def _login_as_admin(client: httpx.AsyncClient) -> None:
    login_page = await client.get("/admin/login")
    match = re.search(CSRF_PATTERN, login_page.text)
    assert match is not None

    response = await client.post(
        "/login",
        data={
            "username": "admin",
            "password": "admin-password",
            "csrf_token": match.group(1),
        },
    )
    assert response.status_code == 200
    assert response.json()["success"] is True


async def _get_admin_csrf(client: httpx.AsyncClient) -> str:
    admin_page = await client.get("/admin/")
    assert admin_page.status_code == 200
    match = re.search(CSRF_PATTERN, admin_page.text)
    assert match is not None
    return match.group(1)


@pytest.mark.anyio
async def test_admin_cadastral_fgb_upload_success(async_client: httpx.AsyncClient, monkeypatch: MonkeyPatch, tmp_path: Path) -> None:
    await _login_as_admin(async_client)
    csrf_token = await _get_admin_csrf(async_client)

    app = async_client._transport.app
    app.state.config.BASE_DIR = str(tmp_path)
    app.state.config.CADASTRAL_FGB_PATH = "data/old.fgb"
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    (data_dir / "old.fgb").write_bytes(b"old")

    monkeypatch.setattr("app.services.cadastral_fgb_upload_service._validate_fgb_file", lambda _path: None)
    monkeypatch.setattr("app.services.cadastral_fgb_upload_service.admin_settings_service.update_env_file", lambda _base, _u: None)

    response = await async_client.post(
        "/admin/upload/cadastral-fgb",
        data={"csrf_token": csrf_token},
        files={"file": ("latest.fgb", io.BytesIO(b"new"), "application/octet-stream")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["appliedPath"] == "data/latest.fgb"
    assert (data_dir / "latest.fgb").exists()
    assert not (data_dir / "old.fgb").exists()


@pytest.mark.anyio
async def test_admin_cadastral_fgb_upload_requires_authentication(async_client: httpx.AsyncClient) -> None:
    response = await async_client.post(
        "/admin/upload/cadastral-fgb",
        data={"csrf_token": "x"},
        files={"file": ("latest.fgb", io.BytesIO(b"new"), "application/octet-stream")},
    )
    assert response.status_code == 401


@pytest.mark.anyio
async def test_admin_cadastral_fgb_upload_rejects_missing_csrf(
    async_client: httpx.AsyncClient, monkeypatch: MonkeyPatch, tmp_path: Path
) -> None:
    await _login_as_admin(async_client)

    app = async_client._transport.app
    app.state.config.BASE_DIR = str(tmp_path)
    app.state.config.CADASTRAL_FGB_PATH = "data/old.fgb"
    monkeypatch.setattr("app.services.cadastral_fgb_upload_service._validate_fgb_file", lambda _path: None)
    monkeypatch.setattr("app.services.cadastral_fgb_upload_service.admin_settings_service.update_env_file", lambda _base, _u: None)

    response = await async_client.post(
        "/admin/upload/cadastral-fgb",
        data={"csrf_token": ""},
        files={"file": ("latest.fgb", io.BytesIO(b"new"), "application/octet-stream")},
    )
    assert response.status_code == 403
