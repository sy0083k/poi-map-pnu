from pathlib import Path

import httpx
import pytest


@pytest.mark.anyio
async def test_cadastral_highlights_served_with_v1_alias(
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.services import cadastral_highlight_service

    payload = {
        "type": "FeatureCollection",
        "features": [{"type": "Feature", "geometry": {"type": "Point", "coordinates": [1, 2]}, "properties": {"pnu": "111"}}],
        "meta": {"requested": 1, "matched": 1, "scanned": 10, "source": "parsed", "fgbEtag": 'W/"1-1"'},
    }
    monkeypatch.setattr(cadastral_highlight_service, "get_filtered_highlights", lambda **_kwargs: payload)

    body = {"theme": "city_owned", "pnus": ["1111111111111111111"]}
    v0 = await async_client.post("/api/cadastral/highlights", json=body)
    v1 = await async_client.post("/api/v1/cadastral/highlights", json=body)

    assert v0.status_code == 200
    assert v1.status_code == 200
    assert v0.json() == payload
    assert v1.json() == payload


@pytest.mark.anyio
async def test_cadastral_highlights_reject_invalid_payload(async_client: httpx.AsyncClient) -> None:
    response = await async_client.post("/api/cadastral/highlights", json={"theme": "city_owned", "pnus": ["bad"]})
    assert response.status_code == 400
    assert "19-digit PNU" in response.json()["detail"]


@pytest.mark.anyio
async def test_cadastral_highlights_reject_invalid_theme(async_client: httpx.AsyncClient) -> None:
    response = await async_client.post(
        "/api/cadastral/highlights",
        json={"theme": "invalid", "pnus": ["1111111111111111111"]},
    )
    assert response.status_code == 400
    assert "theme must be city_owned or national_public" == response.json()["detail"]


def test_cadastral_highlight_service_build_filtered_response(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    from app.services import cadastral_highlight_service

    fgb_file = tmp_path / "sample.fgb"
    fgb_file.write_bytes(b"fgb")
    monkeypatch.setattr(
        cadastral_highlight_service,
        "load_features_from_fgb",
        lambda _path: [
            {"type": "Feature", "geometry": {"type": "Point", "coordinates": [0, 0]}, "properties": {"PNU": "1111111111111111111"}},
            {"type": "Feature", "geometry": {"type": "Point", "coordinates": [0, 1]}, "properties": {"PNU": "2222222222222222222"}},
        ],
    )

    response = cadastral_highlight_service.build_filtered_geojson_response(
        file_path=fgb_file,
        pnu_field="PNU",
        requested_pnus=["1111111111111111111"],
        fgb_etag='W/"1-1"',
    )
    assert response["type"] == "FeatureCollection"
    assert len(response["features"]) == 1
    assert response["features"][0]["properties"]["pnu"] == "1111111111111111111"
    assert response["meta"]["matched"] == 1
