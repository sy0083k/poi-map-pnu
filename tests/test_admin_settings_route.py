import re
from collections.abc import Callable

import httpx
import pytest
from _pytest.monkeypatch import MonkeyPatch
from fastapi import FastAPI

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
async def test_admin_settings_accepts_proxy_and_sheet_fields(
    async_client: httpx.AsyncClient,
    monkeypatch: MonkeyPatch,
) -> None:
    captured: dict[str, str] = {}

    def _capture_env_update(_base_dir: str, updates: dict[str, str]) -> None:
        captured.update(updates)

    monkeypatch.setattr("app.services.admin_settings_service.update_env_file", _capture_env_update)

    await _login_as_admin(async_client)
    csrf_token = await _get_admin_csrf(async_client)

    response = await async_client.post(
        "/admin/settings",
        data={
            "csrf_token": csrf_token,
            "settings_password": "admin-password",
            "app_name": "관심 필지 지도 (POI Map Geo)",
            "vworld_wmts_key": "test-key",
            "vworld_geocoder_key": "test-key",
            "allowed_ips": "127.0.0.1/32,::1/128",
            "max_upload_size_mb": "10",
            "max_upload_rows": "10",
            "login_max_attempts": "5",
            "login_cooldown_seconds": "300",
            "vworld_timeout_s": "5.0",
            "vworld_retries": "3",
            "vworld_backoff_s": "0.5",
            "session_https_only": "false",
            "trust_proxy_headers": "true",
            "trusted_proxy_ips": "10.0.0.0/8",
            "upload_sheet_name": "목록",
        },
        follow_redirects=False,
    )

    assert response.status_code == 303
    assert response.headers["location"] == "/admin/?updated=1"
    assert captured["TRUST_PROXY_HEADERS"] == "true"
    assert captured["TRUSTED_PROXY_IPS"] == "10.0.0.0/8"
    assert captured["UPLOAD_SHEET_NAME"] == "목록"


@pytest.mark.anyio
async def test_admin_settings_rejects_invalid_trusted_proxy_ips(
    async_client: httpx.AsyncClient,
) -> None:
    await _login_as_admin(async_client)
    csrf_token = await _get_admin_csrf(async_client)

    response = await async_client.post(
        "/admin/settings",
        data={
            "csrf_token": csrf_token,
            "settings_password": "admin-password",
            "app_name": "관심 필지 지도 (POI Map Geo)",
            "vworld_wmts_key": "test-key",
            "vworld_geocoder_key": "test-key",
            "allowed_ips": "127.0.0.1/32,::1/128",
            "max_upload_size_mb": "10",
            "max_upload_rows": "10",
            "login_max_attempts": "5",
            "login_cooldown_seconds": "300",
            "vworld_timeout_s": "5.0",
            "vworld_retries": "3",
            "vworld_backoff_s": "0.5",
            "session_https_only": "false",
            "trust_proxy_headers": "true",
            "trusted_proxy_ips": "invalid-network",
            "upload_sheet_name": "목록",
        },
    )

    assert response.status_code == 400
    assert "TRUSTED_PROXY_IPS" in response.text


@pytest.mark.anyio
@pytest.mark.integration
async def test_password_change_rejects_weak_password(
    async_client: httpx.AsyncClient,
) -> None:
    await _login_as_admin(async_client)
    csrf_token = await _get_admin_csrf(async_client)

    response = await async_client.post(
        "/admin/password",
        data={
            "csrf_token": csrf_token,
            "current_password": "admin-password",
            "new_password": "aaaaaaaa",
            "new_password_confirm": "aaaaaaaa",
        },
    )

    assert response.status_code == 400


@pytest.mark.anyio
@pytest.mark.integration
async def test_password_change_rejects_short_password(
    async_client: httpx.AsyncClient,
) -> None:
    await _login_as_admin(async_client)
    csrf_token = await _get_admin_csrf(async_client)

    response = await async_client.post(
        "/admin/password",
        data={
            "csrf_token": csrf_token,
            "current_password": "admin-password",
            "new_password": "Ab1!",
            "new_password_confirm": "Ab1!",
        },
    )

    assert response.status_code == 400


@pytest.mark.anyio
@pytest.mark.integration
async def test_password_change_accepts_strong_password(
    async_client: httpx.AsyncClient,
    monkeypatch: MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.services.admin_settings_service.update_admin_password_hash",
        lambda *_args, **_kwargs: None,
    )

    await _login_as_admin(async_client)
    csrf_token = await _get_admin_csrf(async_client)

    response = await async_client.post(
        "/admin/password",
        data={
            "csrf_token": csrf_token,
            "current_password": "admin-password",
            "new_password": "NewPass1!",
            "new_password_confirm": "NewPass1!",
        },
        follow_redirects=False,
    )

    assert response.status_code in (200, 303)


@pytest.mark.anyio
@pytest.mark.integration
async def test_settings_update_hot_reloads_app_name(
    build_app: Callable[[], FastAPI],
    monkeypatch: MonkeyPatch,
) -> None:
    """POST /admin/settings 성공 후 app.state.config.APP_NAME이 즉시 갱신되는지 검증."""
    captured_refreshes: list[object] = []

    def _fake_refresh(app: FastAPI) -> None:
        # Apply a real Config update with new APP_NAME to simulate hot-reload
        from app.core.config import get_settings
        from app.main import Config

        new_cfg = Config(get_settings())
        new_cfg.APP_NAME = "hot-reloaded-name"
        app.state.config = new_cfg
        captured_refreshes.append(app)

    app = build_app()
    # Override with our tracking refresh_config
    app.state.refresh_config = _fake_refresh

    transport = httpx.ASGITransport(app=app, client=("127.0.0.1", 50000))
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        monkeypatch.setattr("app.services.admin_settings_service.update_env_file", lambda *a, **kw: None)

        await _login_as_admin(client)
        csrf_token = await _get_admin_csrf(client)

        response = await client.post(
            "/admin/settings",
            data={
                "csrf_token": csrf_token,
                "settings_password": "admin-password",
                "app_name": "hot-reloaded-name",
                "vworld_wmts_key": "test-key",
                "allowed_ips": "127.0.0.1/32,::1/128",
                "max_upload_size_mb": "10",
                "max_upload_rows": "10",
                "login_max_attempts": "5",
                "login_cooldown_seconds": "300",
                "session_https_only": "false",
                "trust_proxy_headers": "false",
                "trusted_proxy_ips": "",
                "upload_sheet_name": "목록",
            },
            follow_redirects=False,
        )

    assert response.status_code == 303
    assert len(captured_refreshes) == 1
    assert app.state.config.APP_NAME == "hot-reloaded-name"


@pytest.mark.anyio
@pytest.mark.integration
async def test_password_update_triggers_refresh_config(
    build_app: Callable[[], FastAPI],
    monkeypatch: MonkeyPatch,
) -> None:
    """POST /admin/password 성공 후 refresh_config가 호출되는지 검증."""
    captured_refreshes: list[object] = []

    def _track_refresh(app: FastAPI) -> None:
        captured_refreshes.append(app)

    app = build_app()
    app.state.refresh_config = _track_refresh

    transport = httpx.ASGITransport(app=app, client=("127.0.0.1", 50000))
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        monkeypatch.setattr(
            "app.services.admin_settings_service.update_admin_password_hash",
            lambda *a, **kw: None,
        )

        await _login_as_admin(client)
        csrf_token = await _get_admin_csrf(client)

        response = await client.post(
            "/admin/password",
            data={
                "csrf_token": csrf_token,
                "current_password": "admin-password",
                "new_password": "NewPass1!",
                "new_password_confirm": "NewPass1!",
            },
            follow_redirects=False,
        )

    assert response.status_code in (200, 303)
    assert len(captured_refreshes) == 1
