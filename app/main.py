import logging
import os
import sys
import time
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from pathlib import Path
from typing import cast

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware

from app.auth_security import LoginAttemptLimiter
from app.core import get_settings
from app.core.config import Settings
from app.db.connection import db_connection
from app.exceptions import http_exception_handler, unhandled_exception_handler
from app.logging_utils import RequestIdFilter, configure_logging
from app.rate_limit import SlidingWindowRateLimiter
from app.repositories import (
    event_repository,
    job_repository,
    land_repository,
    parcel_render_repository,
    web_visit_repository,
)
from app.routers import admin, auth, map_router, map_v1_router
from app.services import health_service, parcel_render_build_service
from app.utils import vite_assets
from app.utils.markdown_render import render_markdown_to_html

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

configure_logging()
logger = logging.getLogger(__name__)
logger.addFilter(RequestIdFilter())
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    with db_connection() as conn:
        land_repository.init_land_schema(conn, table_name=land_repository.CITY_TABLE_NAME)
        job_repository.init_job_schema(conn)
        event_repository.init_event_schema(conn)
        web_visit_repository.init_web_visit_schema(conn)
        parcel_render_repository.init_schema(conn)
        conn.commit()
    parcel_render_build_service.ensure_render_items_current(
        base_dir=settings.base_dir,
        configured_path=settings.cadastral_fgb_path,
        pnu_field=settings.cadastral_fgb_pnu_field,
        cadastral_crs=settings.cadastral_fgb_crs,
    )
    yield


app = FastAPI(lifespan=lifespan)
app.add_exception_handler(HTTPException, http_exception_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)


@app.middleware("http")
async def add_request_context(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    started = time.perf_counter()
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    request.state.request_id = request_id
    response = await call_next(request)
    latency_ms = round((time.perf_counter() - started) * 1000, 2)
    client_ip = request.client.host if request.client else "unknown"
    response.headers["X-Request-ID"] = request_id
    logger.info(
        "request completed",
        extra={
            "request_id": request_id,
            "event": "http.request.completed",
            "actor": "anonymous",
            "ip": client_ip,
            "status": response.status_code,
            "latency_ms": latency_ms,
        },
    )
    return response


@app.middleware("http")
async def add_security_headers(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    response = await call_next(request)
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self' https://cdn.jsdelivr.net https://esm.sh https://api.vworld.kr; "
        "script-src 'self' https://cdn.jsdelivr.net https://esm.sh https://api.vworld.kr; "
        "worker-src 'self' blob:; "
        "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; "
        "font-src 'self' data: https://fonts.gstatic.com; "
        "img-src 'self' data: blob: https://api.vworld.kr https://xdworld.vworld.kr;"
    )
    return response


app.add_middleware(
    SessionMiddleware,
    secret_key=settings.secret_key,
    session_cookie=settings.session_cookie_name,
    max_age=3600,
    https_only=settings.session_https_only,
    same_site="lax",
)

BASE_DIR = settings.base_dir
app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))
templates.env.globals["vite_assets"] = lambda entry: vite_assets(entry, settings.base_dir)


class Config:
    def __init__(self, s: Settings) -> None:
        self.APP_NAME = s.app_name
        self.CENTER_LON = s.map_center_lon
        self.CENTER_LAT = s.map_center_lat
        self.DEFAULT_ZOOM = s.map_default_zoom
        self.VWORLD_WMTS_KEY = s.vworld_wmts_key
        self.CADASTRAL_FGB_PATH = s.cadastral_fgb_path
        self.CADASTRAL_PMTILES_URL = s.cadastral_pmtiles_url
        self.CADASTRAL_FGB_PNU_FIELD = s.cadastral_fgb_pnu_field
        self.CADASTRAL_FGB_CRS = s.cadastral_fgb_crs
        self.CADASTRAL_MIN_RENDER_ZOOM = s.cadastral_min_render_zoom
        self.BASE_DIR = s.base_dir
        self.ADMIN_ID = s.admin_id
        self.ADMIN_PW_HASH = s.admin_pw_hash
        self.SESSION_COOKIE_NAME = s.session_cookie_name
        self.SESSION_NAMESPACE = s.session_namespace
        self.ALLOWED_IP_NETWORKS = s.allowed_ip_networks
        self.MAX_UPLOAD_SIZE_MB = s.max_upload_size_mb
        self.MAX_UPLOAD_ROWS = s.max_upload_rows
        self.LOGIN_MAX_ATTEMPTS = s.login_max_attempts
        self.LOGIN_COOLDOWN_SECONDS = s.login_cooldown_seconds
        self.SESSION_HTTPS_ONLY = s.session_https_only
        self.TRUST_PROXY_HEADERS = s.trust_proxy_headers
        self.TRUSTED_PROXY_NETWORKS = s.trusted_proxy_networks
        self.UPLOAD_SHEET_NAME = s.upload_sheet_name


def refresh_app_config(app: FastAPI) -> None:
    """관리자 설정 저장 후 in-memory 즉시 반영. 라우터에서 app.state.refresh_config(app)으로 호출."""
    from app.core import reload_settings

    new_s = reload_settings()
    app.state.config = Config(new_s)
    limiter: LoginAttemptLimiter = app.state.login_limiter
    limiter.max_attempts = new_s.login_max_attempts
    limiter.cooldown_seconds = new_s.login_cooldown_seconds
    logger.info("app config hot-reloaded", extra={"event": "admin.config.reloaded"})


app.state.config = Config(settings)
app.state.templates = templates
app.state.login_limiter = LoginAttemptLimiter(
    max_attempts=settings.login_max_attempts,
    cooldown_seconds=settings.login_cooldown_seconds,
)
app.state.event_rate_limiter = SlidingWindowRateLimiter()
app.state.refresh_config = refresh_app_config

app.include_router(auth.router, tags=["Authentication"])
app.include_router(admin.router, prefix="/admin", tags=["Admin"])
app.include_router(map_router.router, prefix="/api", tags=["Map"])
app.include_router(map_v1_router.router, prefix="/api/v1", tags=["MapV1"])


def _render_map_page(request: Request, *, initial_theme: str, map_mode: str = "land") -> HTMLResponse:
    return cast(
        HTMLResponse,
        templates.TemplateResponse(
            request,
            "index.html",
            {"active_page": "map", "initial_theme": initial_theme, "map_mode": map_mode},
        ),
    )


@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request) -> Response:
    return RedirectResponse(url="/siyu", status_code=307)


@app.get("/file2map", response_class=HTMLResponse, include_in_schema=False)
async def read_national_public_theme(request: Request) -> HTMLResponse:
    return _render_map_page(request, initial_theme="national_public", map_mode="land")


@app.get("/photo2map", response_class=HTMLResponse, include_in_schema=False)
async def read_photo_map_page(request: Request) -> HTMLResponse:
    return _render_map_page(request, initial_theme="national_public", map_mode="photo")


@app.get("/siyu", response_class=HTMLResponse, include_in_schema=False)
async def read_city_owned_theme(request: Request) -> HTMLResponse:
    return _render_map_page(request, initial_theme="city_owned", map_mode="land")


@app.get("/favicon.ico", include_in_schema=False)
async def favicon() -> Response:
    return Response(status_code=204)


@app.get("/README.MD", include_in_schema=False)
async def readme_file() -> FileResponse:
    return FileResponse(os.path.join(BASE_DIR, "README.MD"), media_type="text/markdown; charset=utf-8")


@app.get("/readme", response_class=HTMLResponse, include_in_schema=False)
async def readme_page(request: Request) -> HTMLResponse:
    readme_path = Path(BASE_DIR) / "README.MD"
    try:
        readme_text = readme_path.read_text(encoding="utf-8")
    except OSError:
        readme_text = "README.MD 파일을 불러오지 못했습니다."
    readme_html = render_markdown_to_html(readme_text)
    return cast(
        HTMLResponse,
        templates.TemplateResponse(
            request,
            "readme.html",
            {"active_page": "readme", "readme_html": readme_html},
        ),
    )


@app.get("/health")
async def healthcheck(request: Request, deep: int = 0) -> dict[str, object]:
    request_id = getattr(request.state, "request_id", "-")
    checks = health_service.evaluate_health_checks(deep=deep, request_id=request_id)
    return {"status": "ok", "request_id": request_id, "checks": checks}
