import importlib
import importlib.util
import os
import sys
import unittest
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))


@contextmanager
def temp_env(values: dict[str, str]) -> Iterator[None]:
    original = {k: os.environ.get(k) for k in values}
    os.environ.update(values)
    try:
        yield
    finally:
        for key, value in original.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


class ConfigTests(unittest.TestCase):
    def test_required_env_validation(self) -> None:
        from app.core import config

        config.get_settings.cache_clear()
        with temp_env(
            {
                "SECRET_KEY": "",
                "VWORLD_WMTS_KEY": "key",
                "ADMIN_ID": "admin",
                "ADMIN_PW_HASH": "hash",
            }
        ):
            with self.assertRaises(config.SettingsError):
                config.get_settings()

    def test_invalid_admin_hash_rejected(self) -> None:
        from app.core import config

        config.get_settings.cache_clear()
        with temp_env(
            {
                "SECRET_KEY": "a" * 32,
                "VWORLD_WMTS_KEY": "key",
                "ADMIN_ID": "admin",
                "ADMIN_PW_HASH": "plaintext-password",
            }
        ):
            with self.assertRaises(config.SettingsError):
                config.get_settings()

    def test_short_secret_key_rejected(self) -> None:
        from app.core import config

        config.get_settings.cache_clear()
        with temp_env(
            {
                "SECRET_KEY": "tooshort",
                "VWORLD_WMTS_KEY": "key",
                "ADMIN_ID": "admin",
                "ADMIN_PW_HASH": "$2b$12$MGjgBz6IZSV2boORoUbbQeLqG11Nry5H75zvbYOpJWfMaucKkVSZ6",
            }
        ):
            with self.assertRaises(config.SettingsError):
                config.get_settings()

    def test_sufficient_secret_key_accepted(self) -> None:
        from app.core import config

        config.get_settings.cache_clear()
        with temp_env(
            {
                "SECRET_KEY": "a" * 32,
                "VWORLD_WMTS_KEY": "key",
                "ADMIN_ID": "admin",
                "ADMIN_PW_HASH": "$2b$12$MGjgBz6IZSV2boORoUbbQeLqG11Nry5H75zvbYOpJWfMaucKkVSZ6",
            }
        ):
            settings = config.get_settings()
            assert settings.secret_key == "a" * 32


class AppSmokeTests(unittest.TestCase):
    def test_root_and_config_routes(self) -> None:
        env = {
            "APP_NAME": "관심 필지 지도 (POI Map Geo)",
            "MAP_CENTER_LON": "126.45",
            "MAP_CENTER_LAT": "36.78",
            "MAP_DEFAULT_ZOOM": "14",
            "VWORLD_WMTS_KEY": "test-key",
            "CADASTRAL_FGB_CRS": "EPSG:3857",
            "ADMIN_ID": "admin",
            "ADMIN_PW_HASH": "$2b$12$uYvkCs.waU3zAbFG8sM4xONVkRuA6xk//0A8I1yKTPfUFihhsN0.q",
            "SECRET_KEY": "test-secret-key-padded-to-32chars!",
            "ALLOWED_IPS": "127.0.0.1/32,::1/128",
            "SESSION_HTTPS_ONLY": "false",
        }
        with temp_env(env):
            from app.core import config

            config.get_settings.cache_clear()
            app_main = importlib.import_module("app.main")
            app_main = importlib.reload(app_main)

            import anyio
            import httpx

            async def run_flow() -> None:
                transport = httpx.ASGITransport(app=app_main.app, client=("127.0.0.1", 50000))
                async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
                    root = await client.get("/", follow_redirects=False)
                    self.assertEqual(root.status_code, 307)
                    self.assertEqual(root.headers.get("location"), "/siyu")

                    root_followed = await client.get("/", follow_redirects=True)
                    self.assertEqual(root_followed.status_code, 200)

                    cfg = await client.get("/api/config")
                    self.assertEqual(cfg.status_code, 200)
                    payload = cfg.json()
                    self.assertIn("center", payload)
                    self.assertEqual(payload["cadastralCrs"], "EPSG:3857")
                    self.assertEqual(payload["cadastralPmtilesUrl"], "/api/cadastral/pmtiles")

                    readme_page = await client.get("/readme")
                    self.assertEqual(readme_page.status_code, 200)
                    self.assertIn('<article class="readme-markdown">', readme_page.text)
                    self.assertNotIn('<pre class="readme-body">', readme_page.text)
                    if importlib.util.find_spec("markdown_it"):
                        self.assertIn("<table", readme_page.text)
                        self.assertNotIn("| 영역명(국문) |", readme_page.text)
                self.assertEqual(payload["vworldKey"], "test-key")

            anyio.run(run_flow)


if __name__ == "__main__":
    unittest.main()
