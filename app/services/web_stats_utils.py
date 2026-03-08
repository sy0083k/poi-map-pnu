from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlparse

from fastapi import HTTPException

WEB_EVENT_TYPE_VISIT_START = "visit_start"
WEB_EVENT_TYPE_HEARTBEAT = "heartbeat"
WEB_EVENT_TYPE_VISIT_END = "visit_end"
WEB_EVENT_TYPES = {WEB_EVENT_TYPE_VISIT_START, WEB_EVENT_TYPE_HEARTBEAT, WEB_EVENT_TYPE_VISIT_END}
WEB_TRACKING_PAGE_PATH = "/"
WEB_TRACKING_ALLOWED_PAGE_PATHS = {"/", "/siyu", "/file2map", "/photo2map", "/readme"}
WEB_STATS_DAYS_DEFAULT = 30
WEB_SESSION_TIMEOUT_MINUTES = 30
SEOUL_OFFSET = timedelta(hours=9)
TOP_BREAKDOWN_LIMIT = 10
BOT_UA_PATTERNS = (
    "bot",
    "spider",
    "crawler",
    "curl",
    "wget",
    "python-requests",
    "httpclient",
)
BROWSER_SIGNATURES: tuple[tuple[str, str], ...] = (
    ("edg/", "edge"),
    ("opr/", "opera"),
    ("samsungbrowser/", "samsung_internet"),
    ("chrome/", "chrome"),
    ("safari/", "safari"),
    ("firefox/", "firefox"),
)
OS_SIGNATURES: tuple[tuple[str, str], ...] = (
    ("windows", "windows"),
    ("android", "android"),
    ("iphone", "ios"),
    ("ipad", "ios"),
    ("mac os x", "macos"),
    ("linux", "linux"),
)
SEARCH_ENGINE_DOMAINS = ("google.", "bing.", "yahoo.", "naver.", "daum.", "duckduckgo.", "baidu.", "yandex.")
PAID_MEDIUM_TOKENS = ("cpc", "ppc", "paid", "display", "banner")
EMAIL_MEDIUM_TOKENS = ("email", "newsletter")
SOCIAL_MEDIUM_TOKENS = ("social", "sns")


def normalize_required_token(raw: Any, field_name: str) -> str:
    value = str(raw or "").strip()
    if not value:
        raise HTTPException(status_code=400, detail=f"{field_name} is required.")
    return value[:128]


def normalize_optional_string(raw: Any, *, max_length: int) -> str | None:
    if raw is None:
        return None
    value = str(raw).strip()
    if not value:
        return None
    return value[:max_length]


def normalize_optional_int(raw: Any) -> int | None:
    if raw in (None, ""):
        return None
    try:
        parsed = int(raw)
    except (TypeError, ValueError):
        return None
    if parsed < 0:
        return None
    return min(parsed, 10000)


def parse_client_ts(raw: Any) -> str:
    if raw in (None, ""):
        now = datetime.now(UTC)
        return now.strftime("%Y-%m-%d %H:%M:%S")
    try:
        ts = float(raw)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="clientTs must be unix timestamp seconds.") from exc

    event_dt = datetime.fromtimestamp(ts, tz=UTC)
    now = datetime.now(UTC)
    if event_dt > now + timedelta(minutes=5):
        event_dt = now
    if event_dt < now - timedelta(days=7):
        event_dt = now - timedelta(days=7)
    return event_dt.strftime("%Y-%m-%d %H:%M:%S")


def is_bot_user_agent(user_agent: str) -> bool:
    normalized = user_agent.lower()
    return any(pattern in normalized for pattern in BOT_UA_PATTERNS)


def parse_browser_family(user_agent: str) -> str:
    normalized = user_agent.lower()
    if not normalized:
        return "unknown"
    for signature, family in BROWSER_SIGNATURES:
        if signature in normalized:
            return family
    return "unknown"


def parse_os_family(user_agent: str) -> str:
    normalized = user_agent.lower()
    if not normalized:
        return "unknown"
    for signature, family in OS_SIGNATURES:
        if signature in normalized:
            return family
    return "unknown"


def parse_device_type(user_agent: str, *, viewport_width: int | None, viewport_height: int | None, is_bot: bool) -> str:
    if is_bot:
        return "bot"
    normalized = user_agent.lower()
    if "ipad" in normalized:
        return "tablet"
    if any(token in normalized for token in ("mobile", "iphone", "android")):
        return "mobile"
    if viewport_width is not None and viewport_height is not None:
        shorter = min(viewport_width, viewport_height)
        if shorter <= 600:
            return "mobile"
        if shorter <= 900:
            return "tablet"
    return "desktop"


def to_breakdown(rows: list[Any] | Any) -> list[dict[str, Any]]:
    return [{"key": str(row["key"]), "count": int(row["count"])} for row in rows]


def parse_referrer_context(raw: Any) -> tuple[str | None, str | None]:
    value = normalize_optional_string(raw, max_length=512)
    if not value:
        return None, None
    try:
        parsed = urlparse(value)
    except ValueError:
        return None, None
    host = normalize_optional_string(parsed.hostname, max_length=128)
    path = normalize_optional_string(parsed.path, max_length=256)
    return host, path


def derive_traffic_channel(*, utm_medium: str | None, referrer_domain: str | None) -> str:
    if utm_medium:
        medium = utm_medium.lower()
        if any(token in medium for token in PAID_MEDIUM_TOKENS):
            return "paid"
        if any(token in medium for token in EMAIL_MEDIUM_TOKENS):
            return "email"
        if any(token in medium for token in SOCIAL_MEDIUM_TOKENS):
            return "social"
        return "campaign"
    if not referrer_domain:
        return "direct"
    lowered = referrer_domain.lower()
    if any(domain in lowered for domain in SEARCH_ENGINE_DOMAINS):
        return "organic"
    return "referral"
