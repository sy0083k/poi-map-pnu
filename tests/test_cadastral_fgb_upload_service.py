import io
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from _pytest.monkeypatch import MonkeyPatch
from fastapi import FastAPI, HTTPException
from starlette.datastructures import UploadFile
from starlette.requests import Request

from app.services import cadastral_fgb_upload_service


def _make_request(*, base_dir: Path, configured_path: str, csrf_token: str = "csrf") -> Request:
    app = FastAPI()
    app.state.config = SimpleNamespace(
        BASE_DIR=str(base_dir),
        CADASTRAL_FGB_PATH=configured_path,
        CADASTRAL_FGB_PNU_FIELD="PNU",
        CADASTRAL_FGB_CRS="EPSG:3857",
    )
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/admin/upload/cadastral-fgb",
        "headers": [],
        "client": ("127.0.0.1", 50000),
        "server": ("testserver", 80),
        "scheme": "http",
        "root_path": "",
        "query_string": b"",
        "app": app,
        "session": {"user": "admin", "csrf_token": csrf_token},
    }

    async def receive() -> dict[str, Any]:
        return {"type": "http.request", "body": b"", "more_body": False}

    return Request(scope, receive)


def _upload_file(name: str, content: bytes, content_type: str = "application/octet-stream") -> UploadFile:
    return UploadFile(
        filename=name,
        file=io.BytesIO(content),
        headers={"content-type": content_type},
    )


def test_cadastral_fgb_upload_success_replaces_path_and_deletes_previous(monkeypatch: MonkeyPatch, tmp_path: Path) -> None:
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    old_file = data_dir / "old.fgb"
    old_file.write_bytes(b"old")

    request = _make_request(base_dir=tmp_path, configured_path="data/old.fgb")
    file = _upload_file("new-cadastral.fgb", b"new")

    captured_updates: dict[str, str] = {}
    clear_called = {"value": False}

    monkeypatch.setattr(cadastral_fgb_upload_service, "_validate_fgb_file", lambda _path: None)
    monkeypatch.setattr(
        cadastral_fgb_upload_service.admin_settings_service,
        "update_env_file",
        lambda _base_dir, updates: captured_updates.update(updates),
    )
    monkeypatch.setattr(
        cadastral_fgb_upload_service,
        "clear_cached_responses",
        lambda: clear_called.__setitem__("value", True),
    )
    rebuild_calls: list[dict[str, Any]] = []
    monkeypatch.setattr(
        cadastral_fgb_upload_service.parcel_render_build_service,
        "rebuild_render_items_for_path",
        lambda **kwargs: rebuild_calls.append(kwargs) or 1,
    )

    payload = cadastral_fgb_upload_service.handle_cadastral_fgb_upload(request, csrf_token="csrf", file=file)

    assert payload["success"] is True
    assert payload["appliedPath"] == "data/new-cadastral.fgb"
    assert (data_dir / "new-cadastral.fgb").read_bytes() == b"new"
    assert not old_file.exists()
    assert captured_updates == {"CADASTRAL_FGB_PATH": "data/new-cadastral.fgb"}
    assert request.app.state.config.CADASTRAL_FGB_PATH == "data/new-cadastral.fgb"
    assert clear_called["value"] is True
    assert rebuild_calls[0]["source_path"] == "data/new-cadastral.fgb"


def test_cadastral_fgb_upload_keeps_previous_file_on_validation_failure(
    monkeypatch: MonkeyPatch, tmp_path: Path
) -> None:
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    old_file = data_dir / "old.fgb"
    old_file.write_bytes(b"old")

    request = _make_request(base_dir=tmp_path, configured_path="data/old.fgb")
    file = _upload_file("invalid.fgb", b"bad")

    monkeypatch.setattr(
        cadastral_fgb_upload_service,
        "_validate_fgb_file",
        lambda _path: (_ for _ in ()).throw(HTTPException(status_code=400, detail="invalid fgb")),
    )
    monkeypatch.setattr(
        cadastral_fgb_upload_service.admin_settings_service,
        "update_env_file",
        lambda _base_dir, _updates: (_ for _ in ()).throw(AssertionError("must not update env")),
    )
    monkeypatch.setattr(
        cadastral_fgb_upload_service.parcel_render_build_service,
        "rebuild_render_items_for_path",
        lambda **_kwargs: (_ for _ in ()).throw(AssertionError("must not rebuild render items")),
    )

    with pytest.raises(HTTPException) as exc:
        cadastral_fgb_upload_service.handle_cadastral_fgb_upload(request, csrf_token="csrf", file=file)

    assert exc.value.status_code == 400
    assert old_file.exists()
    assert request.app.state.config.CADASTRAL_FGB_PATH == "data/old.fgb"
    assert not (data_dir / "invalid.fgb").exists()


def test_cadastral_fgb_upload_rejects_non_fgb_extension(tmp_path: Path) -> None:
    request = _make_request(base_dir=tmp_path, configured_path="data/old.fgb")
    file = _upload_file("invalid.xlsx", b"bad")

    with pytest.raises(HTTPException) as exc:
        cadastral_fgb_upload_service.handle_cadastral_fgb_upload(request, csrf_token="csrf", file=file)

    assert exc.value.status_code == 400
