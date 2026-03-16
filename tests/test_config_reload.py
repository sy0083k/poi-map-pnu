"""Unit tests for config hot-reload functionality (RISK-001)."""
import os
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from app.auth_security import LoginAttemptLimiter
from app.core.config import SettingsError, _reload_dotenv, get_settings, reload_settings
from tests.helpers import temp_env

_VALID_ENV = {
    "APP_NAME": "관심 필지 지도 (POI Map Geo)",
    "VWORLD_WMTS_KEY": "test-key",
    "ADMIN_ID": "admin",
    "ADMIN_PW_HASH": "$2b$12$MGjgBz6IZSV2boORoUbbQeLqG11Nry5H75zvbYOpJWfMaucKkVSZ6",
    "SECRET_KEY": "test-secret-key-padded-to-32chars!",
    "ALLOWED_IPS": "127.0.0.1/32",
    "SESSION_HTTPS_ONLY": "false",
}


@pytest.mark.unit
def test_reload_dotenv_overrides_existing_env(tmp_path: Path) -> None:
    os.environ["APP_NAME"] = "old-name"
    env_file = tmp_path / ".env"
    env_file.write_text('APP_NAME="new-name"\n', encoding="utf-8")
    _reload_dotenv(tmp_path)
    assert os.environ["APP_NAME"] == "new-name"
    del os.environ["APP_NAME"]


@pytest.mark.unit
def test_reload_dotenv_noop_when_no_env_file(tmp_path: Path) -> None:
    os.environ["SOME_UNIQUE_KEY_XYZ"] = "original"
    _reload_dotenv(tmp_path)  # no .env file exists
    assert os.environ["SOME_UNIQUE_KEY_XYZ"] == "original"
    del os.environ["SOME_UNIQUE_KEY_XYZ"]


@pytest.mark.unit
def test_reload_settings_clears_cache_and_returns_new_value() -> None:
    env = {**_VALID_ENV, "APP_NAME": "first"}
    with temp_env(env):
        get_settings.cache_clear()
        s1 = get_settings()
        assert s1.app_name == "first"

    env2 = {**_VALID_ENV, "APP_NAME": "second"}
    with temp_env(env2):
        # reload_settings must not call _reload_dotenv (which reads the real .env file)
        with patch("app.core.config._reload_dotenv"):
            s2 = reload_settings()
        assert s2.app_name == "second"
        assert get_settings().app_name == "second"


@pytest.mark.unit
def test_reload_settings_raises_on_invalid_hash() -> None:
    env = {**_VALID_ENV, "ADMIN_PW_HASH": "not-a-valid-bcrypt-hash"}
    with temp_env(env):
        with patch("app.core.config._reload_dotenv"):
            get_settings.cache_clear()
            with pytest.raises(SettingsError, match="ADMIN_PW_HASH"):
                reload_settings()


@pytest.mark.unit
def test_config_instances_are_independent() -> None:
    with temp_env(_VALID_ENV):
        get_settings.cache_clear()
        import importlib

        import app.main as app_main

        app_main = importlib.reload(app_main)
        Config = app_main.Config

    s1 = MagicMock()
    s1.app_name = "alpha"
    s1.map_center_lon = 1.0
    s1.map_center_lat = 2.0
    s1.map_default_zoom = 14
    s1.vworld_wmts_key = "k1"
    s1.cadastral_fgb_path = "p1"
    s1.cadastral_pmtiles_url = "u1"
    s1.cadastral_fgb_pnu_field = "PNU"
    s1.cadastral_fgb_crs = "EPSG:3857"
    s1.cadastral_min_render_zoom = 15
    s1.base_dir = "/tmp/a"
    s1.admin_id = "admin"
    s1.admin_pw_hash = "hash1"
    s1.session_cookie_name = "cookie1"
    s1.session_namespace = "ns1"
    s1.allowed_ip_networks = ()
    s1.max_upload_size_mb = 10
    s1.max_upload_rows = 5000
    s1.login_max_attempts = 5
    s1.login_cooldown_seconds = 300
    s1.session_https_only = True
    s1.trust_proxy_headers = False
    s1.trusted_proxy_networks = ()
    s1.upload_sheet_name = "목록"

    s2 = MagicMock()
    s2.app_name = "beta"
    s2.map_center_lon = 3.0
    s2.map_center_lat = 4.0
    s2.map_default_zoom = 14
    s2.vworld_wmts_key = "k2"
    s2.cadastral_fgb_path = "p2"
    s2.cadastral_pmtiles_url = "u2"
    s2.cadastral_fgb_pnu_field = "PNU"
    s2.cadastral_fgb_crs = "EPSG:3857"
    s2.cadastral_min_render_zoom = 15
    s2.base_dir = "/tmp/b"
    s2.admin_id = "admin"
    s2.admin_pw_hash = "hash2"
    s2.session_cookie_name = "cookie2"
    s2.session_namespace = "ns2"
    s2.allowed_ip_networks = ()
    s2.max_upload_size_mb = 20
    s2.max_upload_rows = 1000
    s2.login_max_attempts = 3
    s2.login_cooldown_seconds = 600
    s2.session_https_only = False
    s2.trust_proxy_headers = True
    s2.trusted_proxy_networks = ()
    s2.upload_sheet_name = "sheet"

    c1 = Config(s1)
    c2 = Config(s2)

    assert c1.APP_NAME == "alpha"
    assert c2.APP_NAME == "beta"
    assert c1.APP_NAME != c2.APP_NAME
    assert c1.MAX_UPLOAD_SIZE_MB == 10
    assert c2.MAX_UPLOAD_SIZE_MB == 20


@pytest.mark.unit
def test_refresh_app_config_updates_state() -> None:
    with temp_env(_VALID_ENV):
        get_settings.cache_clear()
        import importlib

        import app.main as app_main

        app_main = importlib.reload(app_main)
        Config = app_main.Config
        refresh_app_config = app_main.refresh_app_config

    mock_app = MagicMock()
    mock_app.state.login_limiter = LoginAttemptLimiter(max_attempts=5, cooldown_seconds=300)

    new_settings = MagicMock()
    new_settings.app_name = "hot-reloaded"
    new_settings.map_center_lon = 1.0
    new_settings.map_center_lat = 2.0
    new_settings.map_default_zoom = 14
    new_settings.vworld_wmts_key = "k"
    new_settings.cadastral_fgb_path = "p"
    new_settings.cadastral_pmtiles_url = "u"
    new_settings.cadastral_fgb_pnu_field = "PNU"
    new_settings.cadastral_fgb_crs = "EPSG:3857"
    new_settings.cadastral_min_render_zoom = 15
    new_settings.base_dir = "/tmp"
    new_settings.admin_id = "admin"
    new_settings.admin_pw_hash = "hash"
    new_settings.session_cookie_name = "c"
    new_settings.session_namespace = "n"
    new_settings.allowed_ip_networks = ()
    new_settings.max_upload_size_mb = 10
    new_settings.max_upload_rows = 5000
    new_settings.login_max_attempts = 3
    new_settings.login_cooldown_seconds = 600
    new_settings.session_https_only = True
    new_settings.trust_proxy_headers = False
    new_settings.trusted_proxy_networks = ()
    new_settings.upload_sheet_name = "목록"

    with patch("app.core.reload_settings", return_value=new_settings):
        refresh_app_config(mock_app)

    assigned_config = mock_app.state.config
    assert isinstance(assigned_config, Config)
    assert assigned_config.APP_NAME == "hot-reloaded"
    assert mock_app.state.login_limiter.max_attempts == 3
    assert mock_app.state.login_limiter.cooldown_seconds == 600


@pytest.mark.unit
def test_refresh_app_config_updates_login_limiter() -> None:
    with temp_env(_VALID_ENV):
        get_settings.cache_clear()
        import importlib

        import app.main as app_main

        app_main = importlib.reload(app_main)
        refresh_app_config = app_main.refresh_app_config

    limiter = LoginAttemptLimiter(max_attempts=5, cooldown_seconds=300)
    mock_app = MagicMock()
    mock_app.state.login_limiter = limiter

    new_settings = MagicMock()
    new_settings.login_max_attempts = 10
    new_settings.login_cooldown_seconds = 120
    new_settings.app_name = "x"
    new_settings.map_center_lon = 0.0
    new_settings.map_center_lat = 0.0
    new_settings.map_default_zoom = 14
    new_settings.vworld_wmts_key = "k"
    new_settings.cadastral_fgb_path = "p"
    new_settings.cadastral_pmtiles_url = "u"
    new_settings.cadastral_fgb_pnu_field = "PNU"
    new_settings.cadastral_fgb_crs = "EPSG:3857"
    new_settings.cadastral_min_render_zoom = 15
    new_settings.base_dir = "/tmp"
    new_settings.admin_id = "admin"
    new_settings.admin_pw_hash = "hash"
    new_settings.session_cookie_name = "c"
    new_settings.session_namespace = "n"
    new_settings.allowed_ip_networks = ()
    new_settings.max_upload_size_mb = 10
    new_settings.max_upload_rows = 5000
    new_settings.session_https_only = True
    new_settings.trust_proxy_headers = False
    new_settings.trusted_proxy_networks = ()
    new_settings.upload_sheet_name = "목록"

    with patch("app.core.reload_settings", return_value=new_settings):
        refresh_app_config(mock_app)

    assert limiter.max_attempts == 10
    assert limiter.cooldown_seconds == 120
