from pathlib import Path

import httpx
import pytest
from _pytest.monkeypatch import MonkeyPatch


@pytest.mark.anyio
async def test_health_includes_db_check(async_client: httpx.AsyncClient) -> None:
    res = await async_client.get("/health")
    assert res.status_code == 200
    payload = res.json()
    assert payload["status"] == "ok"
    assert payload["checks"]["db"] == "ok"
    assert "request_id" in payload


@pytest.mark.anyio
async def test_health_deep_includes_cadastral_fgb_check(
    async_client: httpx.AsyncClient, monkeypatch: MonkeyPatch
) -> None:
    from app.services import health_service

    monkeypatch.setattr(
        health_service,
        "get_settings_snapshot",
        lambda: {"base_dir": "/tmp", "cadastral_fgb_path": "fake.fgb"},
    )
    monkeypatch.setattr(
        health_service.cadastral_fgb_service,
        "resolve_fgb_path_for_health",
        lambda **_kwargs: Path(__file__),
    )
    res = await async_client.get("/health?deep=1")
    assert res.status_code == 200
    payload = res.json()
    assert payload["checks"]["cadastral_fgb"] == "ok"
