import os
import re
from dataclasses import dataclass
from functools import lru_cache
from ipaddress import IPv4Network, IPv6Network, ip_network
from pathlib import Path


class SettingsError(RuntimeError):
    """Raised when required settings are missing or invalid."""

IPAddressNetwork = IPv4Network | IPv6Network
BCRYPT_HASH_RE = re.compile(r"^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$")

@dataclass(frozen=True)
class Settings:
    app_name: str
    map_center_lon: float
    map_center_lat: float
    map_default_zoom: int
    vworld_key: str
    admin_id: str
    admin_pw_hash: str
    secret_key: str
    allowed_ip_networks: tuple[IPAddressNetwork, ...]
    max_upload_size_mb: int
    max_upload_rows: int
    login_max_attempts: int
    login_cooldown_seconds: int
    vworld_timeout_s: float
    vworld_retries: int
    vworld_backoff_s: float
    session_https_only: bool
    base_dir: str


def _load_dotenv_if_present(base_dir: Path) -> None:
    """Load .env file into environment when python-dotenv is unavailable or not preloaded."""
    env_path = base_dir / ".env"
    if not env_path.exists():
        return

    try:
        # Prefer python-dotenv when available.
        from dotenv import load_dotenv

        load_dotenv(dotenv_path=env_path)
        return
    except Exception:
        # Fallback: minimal parser for KEY=VALUE lines.
        pass

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def _get_required_env(name: str) -> str:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        raise SettingsError(f"Required environment variable is missing: {name}")
    return value.strip()


def _parse_allowed_ips(raw_ips: str) -> tuple[IPAddressNetwork, ...]:
    networks: list[IPAddressNetwork] = []
    for raw_entry in raw_ips.split(","):
        entry = raw_entry.strip()
        if not entry:
            continue
        try:
            networks.append(ip_network(entry, strict=False))
        except ValueError as exc:
            raise SettingsError(
                f"Invalid ALLOWED_IPS entry: {entry}. Use CIDR or exact IP (e.g. 127.0.0.1/32)."
            ) from exc

    if not networks:
        return (ip_network("127.0.0.1/32"), ip_network("::1/128"))

    return tuple(networks)


def _parse_bool_env(name: str, default: bool) -> bool:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default

    normalized = raw_value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise SettingsError(f"Invalid boolean value for {name}: {raw_value}")


def _validate_admin_hash(hash_value: str) -> str:
    if not BCRYPT_HASH_RE.match(hash_value):
        raise SettingsError("ADMIN_PW_HASH must be a valid bcrypt hash.")
    return hash_value


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    base_dir = Path(__file__).resolve().parents[2]
    _load_dotenv_if_present(base_dir)

    return Settings(
        app_name=os.getenv("APP_NAME", "IdlePublicProperty"),
        map_center_lon=float(os.getenv("MAP_CENTER_LON", "126.4500")),
        map_center_lat=float(os.getenv("MAP_CENTER_LAT", "36.7848")),
        map_default_zoom=int(os.getenv("MAP_DEFAULT_ZOOM", "14")),
        vworld_key=_get_required_env("VWORLD_KEY"),
        admin_id=_get_required_env("ADMIN_ID"),
        admin_pw_hash=_validate_admin_hash(_get_required_env("ADMIN_PW_HASH")),
        secret_key=_get_required_env("SECRET_KEY"),
        allowed_ip_networks=_parse_allowed_ips(os.getenv("ALLOWED_IPS", "127.0.0.1/32,::1/128")),
        max_upload_size_mb=int(os.getenv("MAX_UPLOAD_SIZE_MB", "10")),
        max_upload_rows=int(os.getenv("MAX_UPLOAD_ROWS", "5000")),
        login_max_attempts=int(os.getenv("LOGIN_MAX_ATTEMPTS", "5")),
        login_cooldown_seconds=int(os.getenv("LOGIN_COOLDOWN_SECONDS", "300")),
        vworld_timeout_s=float(os.getenv("VWORLD_TIMEOUT_S", "5.0")),
        vworld_retries=int(os.getenv("VWORLD_RETRIES", "3")),
        vworld_backoff_s=float(os.getenv("VWORLD_BACKOFF_S", "0.5")),
        session_https_only=_parse_bool_env("SESSION_HTTPS_ONLY", True),
        base_dir=str(base_dir),
    )
