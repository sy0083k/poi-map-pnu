from pathlib import Path

from app.services import admin_settings_service


def _read_env_lines(path: Path) -> list[str]:
    return path.read_text(encoding="utf-8").splitlines()


def test_update_env_file_replaces_spaced_assignment_without_duplicate(tmp_path: Path) -> None:
    env_path = tmp_path / ".env"
    env_path.write_text("VWORLD_WMTS_KEY = old-value\n", encoding="utf-8")

    admin_settings_service.update_env_file(str(tmp_path), {"VWORLD_WMTS_KEY": "new-value"})

    lines = _read_env_lines(env_path)
    assert lines == ["VWORLD_WMTS_KEY=new-value"]


def test_update_env_file_deduplicates_existing_duplicate_keys(tmp_path: Path) -> None:
    env_path = tmp_path / ".env"
    env_path.write_text(
        "CADASTRAL_FGB_PATH=first.fgb\n"
        "APP_NAME=test\n"
        "CADASTRAL_FGB_PATH=second.fgb\n",
        encoding="utf-8",
    )

    admin_settings_service.update_env_file(str(tmp_path), {})

    lines = _read_env_lines(env_path)
    assert lines == ["APP_NAME=test", "CADASTRAL_FGB_PATH=second.fgb"]


def test_update_env_file_preserves_comments_and_blank_lines(tmp_path: Path) -> None:
    env_path = tmp_path / ".env"
    env_path.write_text(
        "# header\n"
        "\n"
        "VWORLD_WMTS_KEY = old\n"
        "\n"
        "# tail\n",
        encoding="utf-8",
    )

    admin_settings_service.update_env_file(str(tmp_path), {"VWORLD_WMTS_KEY": "new"})

    lines = _read_env_lines(env_path)
    assert lines == ["# header", "", "VWORLD_WMTS_KEY=new", "", "# tail"]


def test_update_env_file_appends_missing_key_once(tmp_path: Path) -> None:
    env_path = tmp_path / ".env"
    env_path.write_text("APP_NAME=test\n", encoding="utf-8")

    admin_settings_service.update_env_file(str(tmp_path), {"CADASTRAL_MIN_RENDER_ZOOM": "17"})

    lines = _read_env_lines(env_path)
    assert lines == ["APP_NAME=test", "CADASTRAL_MIN_RENDER_ZOOM=17"]
