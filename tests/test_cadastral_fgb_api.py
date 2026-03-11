from pathlib import Path

import httpx
import pytest
from fastapi.responses import StreamingResponse


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
    assert v0.headers.get("etag")
    assert v0.headers.get("etag") == v1.headers.get("etag")
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
async def test_cadastral_fgb_supports_open_ended_and_suffix_ranges(
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    from app.services import cadastral_fgb_service

    small_fgb = tmp_path / "sample.fgb"
    small_fgb.write_bytes(b"abcdefghij")
    monkeypatch.setattr(cadastral_fgb_service, "_resolve_fgb_path", lambda **_kwargs: small_fgb)

    open_ended = await async_client.get("/api/cadastral/fgb", headers={"Range": "bytes=5-"})
    assert open_ended.status_code == 206
    assert open_ended.headers.get("content-range") == "bytes 5-9/10"
    assert open_ended.headers.get("content-length") == "5"
    assert open_ended.content == b"fghij"

    suffix = await async_client.get("/api/cadastral/fgb", headers={"Range": "bytes=-4"})
    assert suffix.status_code == 206
    assert suffix.headers.get("content-range") == "bytes 6-9/10"
    assert suffix.headers.get("content-length") == "4"
    assert suffix.content == b"ghij"


@pytest.mark.anyio
async def test_cadastral_fgb_rejects_malformed_ranges(
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    from app.services import cadastral_fgb_service

    small_fgb = tmp_path / "sample.fgb"
    small_fgb.write_bytes(b"abcdefghij")
    monkeypatch.setattr(cadastral_fgb_service, "_resolve_fgb_path", lambda **_kwargs: small_fgb)

    invalid_format = await async_client.get("/api/cadastral/fgb", headers={"Range": "bytes=abc"})
    assert invalid_format.status_code == 416

    multi_part = await async_client.get("/api/cadastral/fgb", headers={"Range": "bytes=0-1,3-4"})
    assert multi_part.status_code == 416


def test_cadastral_fgb_streams_large_non_range_response(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    from app.services import cadastral_fgb_service

    small_fgb = tmp_path / "sample.fgb"
    small_fgb.write_bytes(b"abcdefghij")
    monkeypatch.setattr(cadastral_fgb_service, "_resolve_fgb_path", lambda **_kwargs: small_fgb)
    monkeypatch.setattr(cadastral_fgb_service, "STREAMING_THRESHOLD_BYTES", 1)

    response = cadastral_fgb_service.build_fgb_file_response(
        base_dir=str(tmp_path),
        configured_path="sample.fgb",
    )
    assert isinstance(response, StreamingResponse)
    assert response.status_code == 200
    assert response.headers.get("content-length") == "10"


def test_cadastral_fgb_streams_large_range_response(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    from app.services import cadastral_fgb_service

    small_fgb = tmp_path / "sample.fgb"
    small_fgb.write_bytes(b"abcdefghij")
    monkeypatch.setattr(cadastral_fgb_service, "_resolve_fgb_path", lambda **_kwargs: small_fgb)
    monkeypatch.setattr(cadastral_fgb_service, "STREAMING_THRESHOLD_BYTES", 1)

    response = cadastral_fgb_service.build_fgb_file_response(
        base_dir=str(tmp_path),
        configured_path="sample.fgb",
        range_header="bytes=0-5",
    )
    assert isinstance(response, StreamingResponse)
    assert response.status_code == 206
    assert response.headers.get("content-range") == "bytes 0-5/10"
    assert response.headers.get("content-length") == "6"


@pytest.mark.anyio
async def test_config_includes_cadastral_crs(async_client: httpx.AsyncClient) -> None:
    response = await async_client.get("/api/config")
    assert response.status_code == 200
    payload = response.json()
    assert payload["cadastralCrs"] == "EPSG:3857"
    assert payload["cadastralPmtilesUrl"] == "/api/cadastral/pmtiles"


@pytest.mark.anyio
async def test_cadastral_pmtiles_served_with_range_support(
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    from app.services import cadastral_fgb_service

    small_pmtiles = tmp_path / "sample.pmtiles"
    small_pmtiles.write_bytes(b"0123456789")
    monkeypatch.setattr(cadastral_fgb_service, "_resolve_fgb_path", lambda **_kwargs: small_pmtiles)

    response = await async_client.get("/api/cadastral/pmtiles", headers={"Range": "bytes=2-5"})

    assert response.status_code == 206
    assert response.headers.get("content-range") == "bytes 2-5/10"
    assert response.content == b"2345"


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
