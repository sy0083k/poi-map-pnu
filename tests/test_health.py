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
async def test_health_deep_includes_vworld_check(
    async_client: httpx.AsyncClient, monkeypatch: MonkeyPatch
) -> None:
    from app import main as app_main

    monkeypatch.setattr(
        app_main,
        "get_json_with_retry",
        lambda *_args, **_kwargs: {"response": {"status": "OK"}},
    )
    res = await async_client.get("/health?deep=1")
    assert res.status_code == 200
    payload = res.json()
    assert payload["checks"]["vworld"] == "ok"
