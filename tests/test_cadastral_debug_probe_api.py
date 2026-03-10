from pathlib import Path

import httpx
import pytest


@pytest.mark.anyio
async def test_cadastral_debug_probe_served_with_v1_alias(
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    from app.services import cadastral_fgb_service, cadastral_highlight_service

    probe_fgb = tmp_path / "probe.fgb"
    probe_fgb.write_bytes(b"fgb")
    monkeypatch.setattr(cadastral_fgb_service, "resolve_fgb_path_for_health", lambda **_kwargs: probe_fgb)
    monkeypatch.setattr(
        cadastral_highlight_service,
        "load_features_from_fgb",
        lambda _path, **_kwargs: [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [14135326.0, 4518366.0]},
                "properties": {"PNU": "1111111111111111111"},
            }
        ],
    )

    query = "bbox=126.9,37.5,127.0,37.6&bboxCrs=EPSG:4326&limit=10"
    v0 = await async_client.get(f"/api/cadastral/debug-probe?{query}")
    v1 = await async_client.get(f"/api/v1/cadastral/debug-probe?{query}")

    assert v0.status_code == 200
    assert v1.status_code == 200
    assert v0.json() == v1.json()
    payload = v0.json()
    assert payload["type"] == "FeatureCollection"
    assert payload["meta"]["outputCrs"] == "EPSG:4326"
    assert payload["features"][0]["properties"]["pnu"] == "1111111111111111111"


def test_debug_probe_transforms_bbox_and_applies_limit(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    from app.services import cadastral_highlight_service

    probe_fgb = tmp_path / "probe.fgb"
    probe_fgb.write_bytes(b"fgb")
    monkeypatch.setattr(
        cadastral_highlight_service.cadastral_fgb_service,
        "resolve_fgb_path_for_health",
        lambda **_kwargs: probe_fgb,
    )
    called: dict[str, object] = {"bbox": None}

    def fake_loader(_path: Path, **kwargs: object) -> list[dict[str, object]]:
        called["bbox"] = kwargs.get("bbox")
        return [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [14135326.0, 4518366.0]},
                "properties": {"PNU": "1111111111111111111"},
            },
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [14135327.0, 4518367.0]},
                "properties": {"PNU": "2222222222222222222"},
            },
        ]

    monkeypatch.setattr(cadastral_highlight_service, "load_features_from_fgb", fake_loader)

    response = cadastral_highlight_service.get_debug_probe_geojson_response(
        base_dir=str(tmp_path),
        pnu_field="PNU",
        cadastral_crs="EPSG:3857",
        bbox=(126.9, 37.5, 127.0, 37.6),
        bbox_crs="EPSG:4326",
        limit=1,
    )

    assert isinstance(called["bbox"], tuple)
    assert response["meta"]["truncated"] is True
    assert response["meta"]["returned"] == 1
    assert response["features"][0]["geometry"]["type"] == "Point"


@pytest.mark.anyio
async def test_cadastral_debug_probe_rejects_invalid_bbox(async_client: httpx.AsyncClient) -> None:
    response = await async_client.get("/api/cadastral/debug-probe?bbox=1,2,3")
    assert response.status_code == 400
    assert "bbox" in response.json()["detail"]
