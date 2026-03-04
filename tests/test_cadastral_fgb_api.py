from pathlib import Path

import httpx
import pytest


@pytest.mark.anyio
async def test_cadastral_fgb_served_with_v1_alias(
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    from app.services import cadastral_fgb_service

    small_fgb = tmp_path / "sample.fgb"
    small_fgb.write_bytes(b"fgb")
    monkeypatch.setattr(cadastral_fgb_service, "_resolve_fgb_path", lambda **_kwargs: small_fgb)

    v0 = await async_client.get("/api/cadastral/fgb")
    v1 = await async_client.get("/api/v1/cadastral/fgb")

    assert v0.status_code == 200
    assert v1.status_code == 200
    assert v0.headers.get("content-type", "").startswith("application/x-flatgeobuf")
    assert v0.content == b"fgb"
    assert v1.content == b"fgb"


@pytest.mark.anyio
async def test_cadastral_fgb_supports_byte_range(
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    from app.services import cadastral_fgb_service

    small_fgb = tmp_path / "sample.fgb"
    small_fgb.write_bytes(b"abcdefghij")
    monkeypatch.setattr(cadastral_fgb_service, "_resolve_fgb_path", lambda **_kwargs: small_fgb)

    res = await async_client.get("/api/cadastral/fgb", headers={"Range": "bytes=0-3"})
    assert res.status_code == 206
    assert res.headers.get("content-range") == "bytes 0-3/10"
    assert res.content == b"abcd"


@pytest.mark.anyio
async def test_config_includes_cadastral_crs(async_client: httpx.AsyncClient) -> None:
    response = await async_client.get("/api/config")
    assert response.status_code == 200
    payload = response.json()
    assert payload["cadastralCrs"] == "EPSG:3857"


@pytest.mark.anyio
async def test_cadastral_fgb_returns_404_for_missing_file(
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.services import cadastral_fgb_service

    monkeypatch.setattr(
        cadastral_fgb_service,
        "_resolve_fgb_path",
        lambda **_kwargs: Path("/tmp/non-existent-cadastral.fgb"),
    )
    response = await async_client.get("/api/cadastral/fgb")
    assert response.status_code == 404
