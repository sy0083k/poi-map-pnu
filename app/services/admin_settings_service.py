from __future__ import annotations

from ipaddress import ip_network
from pathlib import Path

import bcrypt
from fastapi import HTTPException, Request

from app.core import get_settings
from app.dependencies import validate_csrf_token

WHITELIST_KEYS = {
    "APP_NAME",
    "VWORLD_WMTS_KEY",
    "CADASTRAL_FGB_PATH",
    "CADASTRAL_FGB_PNU_FIELD",
    "CADASTRAL_FGB_CRS",
    "CADASTRAL_MIN_RENDER_ZOOM",
    "ALLOWED_IPS",
    "MAX_UPLOAD_SIZE_MB",
    "MAX_UPLOAD_ROWS",
    "LOGIN_MAX_ATTEMPTS",
    "LOGIN_COOLDOWN_SECONDS",
    "SESSION_HTTPS_ONLY",
    "TRUST_PROXY_HEADERS",
    "TRUSTED_PROXY_IPS",
    "UPLOAD_SHEET_NAME",
}

INT_KEYS = {
    "MAX_UPLOAD_SIZE_MB",
    "MAX_UPLOAD_ROWS",
    "LOGIN_MAX_ATTEMPTS",
    "LOGIN_COOLDOWN_SECONDS",
    "CADASTRAL_MIN_RENDER_ZOOM",
}

BOOL_KEYS = {"SESSION_HTTPS_ONLY"}


def get_current_settings() -> dict[str, str]:
    settings = get_settings()
    return {
        "APP_NAME": settings.app_name,
        "VWORLD_WMTS_KEY": settings.vworld_wmts_key,
        "CADASTRAL_FGB_PATH": settings.cadastral_fgb_path,
        "CADASTRAL_FGB_PNU_FIELD": settings.cadastral_fgb_pnu_field,
        "CADASTRAL_FGB_CRS": settings.cadastral_fgb_crs,
        "CADASTRAL_MIN_RENDER_ZOOM": str(settings.cadastral_min_render_zoom),
        "ALLOWED_IPS": ",".join(str(n) for n in settings.allowed_ip_networks),
        "MAX_UPLOAD_SIZE_MB": str(settings.max_upload_size_mb),
        "MAX_UPLOAD_ROWS": str(settings.max_upload_rows),
        "LOGIN_MAX_ATTEMPTS": str(settings.login_max_attempts),
        "LOGIN_COOLDOWN_SECONDS": str(settings.login_cooldown_seconds),
        "SESSION_HTTPS_ONLY": "true" if settings.session_https_only else "false",
        "TRUST_PROXY_HEADERS": "true" if settings.trust_proxy_headers else "false",
        "TRUSTED_PROXY_IPS": ",".join(str(n) for n in settings.trusted_proxy_networks),
        "UPLOAD_SHEET_NAME": settings.upload_sheet_name,
    }


def validate_updates(updates: dict[str, str]) -> dict[str, str]:
    cleaned: dict[str, str] = {}
    for key, value in updates.items():
        if key not in WHITELIST_KEYS:
            continue
        raw = value.strip()
        if raw == "":
            continue
        if key in INT_KEYS:
            if not raw.isdigit():
                raise ValueError(f"{key} must be an integer.")
        if key == "CADASTRAL_FGB_CRS":
            normalized = raw.upper()
            if normalized not in {"EPSG:3857", "EPSG:4326"}:
                raise ValueError("CADASTRAL_FGB_CRS must be EPSG:3857 or EPSG:4326.")
            raw = normalized
        if key == "TRUSTED_PROXY_IPS":
            for candidate in [item.strip() for item in raw.split(",") if item.strip()]:
                try:
                    ip_network(candidate, strict=False)
                except ValueError as exc:
                    raise ValueError(f"Invalid TRUSTED_PROXY_IPS entry: {candidate}") from exc
        if key in BOOL_KEYS or key == "TRUST_PROXY_HEADERS":
            if raw.lower() not in {"true", "false"}:
                raise ValueError(f"{key} must be true or false.")
            raw = raw.lower()
        cleaned[key] = raw
    return cleaned


def update_env_file(base_dir: str, updates: dict[str, str]) -> None:
    env_path = Path(base_dir) / ".env"
    if env_path.exists():
        lines = env_path.read_text(encoding="utf-8").splitlines()
    else:
        lines = []

    parsed_keys: list[str | None] = [_parse_env_key(line) for line in lines]
    last_index_by_key: dict[str, int] = {}
    for idx, key in enumerate(parsed_keys):
        if key:
            last_index_by_key[key] = idx

    remaining = dict(updates)
    new_lines: list[str] = []
    for idx, line in enumerate(lines):
        key = parsed_keys[idx]
        if not key:
            new_lines.append(line)
            continue

        if last_index_by_key.get(key) != idx:
            continue

        if key in remaining:
            new_lines.append(f"{key}={_format_env_value(remaining.pop(key))}")
        else:
            new_lines.append(line)

    for key, value in remaining.items():
        new_lines.append(f"{key}={_format_env_value(value)}")

    env_path.write_text("\n".join(new_lines) + "\n", encoding="utf-8")


def update_admin_password_hash(base_dir: str, password_hash: str) -> None:
    update_env_file(base_dir, {"ADMIN_PW_HASH": password_hash})


def _format_env_value(value: str) -> str:
    if " " in value or "#" in value:
        return f"\"{value}\""
    return value


def _parse_env_key(line: str) -> str | None:
    stripped = line.strip()
    if not stripped or stripped.startswith("#") or "=" not in line:
        return None

    key, _value = line.split("=", 1)
    normalized = key.strip()
    if normalized.startswith("export "):
        normalized = normalized[len("export ") :].strip()
    if not normalized:
        return None
    return normalized


def apply_settings_update(
    request: Request,
    *,
    csrf_token: str,
    settings_password: str,
    updates: dict[str, str],
) -> None:
    if not validate_csrf_token(request, csrf_token):
        raise HTTPException(status_code=403, detail="CSRF 토큰 검증에 실패했습니다.")

    if not settings_password:
        raise HTTPException(status_code=400, detail="관리자 비밀번호를 입력해주세요.")

    config = request.app.state.config
    if not bcrypt.checkpw(settings_password.encode("utf-8"), config.ADMIN_PW_HASH.encode("utf-8")):
        raise HTTPException(status_code=401, detail="관리자 비밀번호가 올바르지 않습니다.")

    try:
        cleaned = validate_updates(updates)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    update_env_file(config.BASE_DIR, cleaned)


def apply_password_update(
    request: Request,
    *,
    csrf_token: str,
    current_password: str,
    new_password: str,
    new_password_confirm: str,
) -> None:
    if not validate_csrf_token(request, csrf_token):
        raise HTTPException(status_code=403, detail="CSRF 토큰 검증에 실패했습니다.")

    if not current_password or not new_password:
        raise HTTPException(status_code=400, detail="비밀번호를 입력해주세요.")

    if new_password != new_password_confirm:
        raise HTTPException(status_code=400, detail="새 비밀번호가 일치하지 않습니다.")

    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="새 비밀번호는 8자 이상이어야 합니다.")

    config = request.app.state.config
    if not bcrypt.checkpw(current_password.encode("utf-8"), config.ADMIN_PW_HASH.encode("utf-8")):
        raise HTTPException(status_code=401, detail="현재 비밀번호가 올바르지 않습니다.")

    new_hash = bcrypt.hashpw(new_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    update_admin_password_hash(config.BASE_DIR, new_hash)
