from app.db.connection import db_connection
from app.repositories import health_repository
from app.services import cadastral_fgb_service


def evaluate_health_checks(*, deep: int, request_id: str) -> dict[str, str]:
    checks: dict[str, str] = {}

    with db_connection() as conn:
        health_repository.ping(conn)
    checks["db"] = "ok"

    if deep == 1:
        config = get_settings_snapshot()
        try:
            file_path = cadastral_fgb_service.resolve_fgb_path_for_health(
                base_dir=config["base_dir"],
                configured_path=config["cadastral_fgb_path"],
            )
            checks["cadastral_fgb"] = "ok" if file_path.exists() and file_path.stat().st_size > 0 else "degraded"
        except Exception:
            checks["cadastral_fgb"] = "degraded"

    return checks


def get_settings_snapshot() -> dict[str, str]:
    from app.core import get_settings

    settings = get_settings()
    return {
        "base_dir": settings.base_dir,
        "cadastral_fgb_path": settings.cadastral_fgb_path,
    }
