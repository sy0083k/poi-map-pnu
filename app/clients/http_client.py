import logging
import time
import xml.etree.ElementTree as ET
from typing import Any

import requests

from app.logging_utils import RequestIdFilter

logger = logging.getLogger(__name__)
logger.addFilter(RequestIdFilter())


class NonRetryableHTTPError(RuntimeError):
    """Raised when retrying will not fix the HTTP error."""


def _parse_service_exception(xml_text: str) -> tuple[str, str]:
    if "<ServiceException" not in xml_text:
        return "", ""
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return "", ""
    for node in root.iter():
        if node.tag.endswith("ServiceException"):
            code = str(node.attrib.get("code", "")).strip()
            message = str(node.text or "").strip()
            return code, message
    return "", ""


def get_json_with_retry(
    url: str,
    *,
    timeout_s: float,
    retries: int,
    backoff_s: float,
    request_id: str = "-",
) -> dict[str, Any]:
    """GET JSON with timeout/retry/backoff policy."""
    last_error: Exception | None = None

    for attempt in range(1, retries + 1):
        try:
            response = requests.get(url, timeout=timeout_s)
            if 400 <= response.status_code < 500 and response.status_code != 429:
                raise NonRetryableHTTPError(f"non-retryable status: {response.status_code}")
            response.raise_for_status()
            try:
                return response.json()
            except ValueError as exc:
                content_type = response.headers.get("content-type", "")
                preview = response.text[:120].replace("\n", " ").replace("\r", " ")
                service_exception_code = ""
                service_exception_message = ""
                if "xml" in content_type.lower():
                    service_exception_code, service_exception_message = _parse_service_exception(response.text)
                raise NonRetryableHTTPError(
                    "non-json response: "
                    f"status={response.status_code}, content_type={content_type}, body={preview}, "
                    f"service_exception_code={service_exception_code}, "
                    f"service_exception_message={service_exception_message}"
                ) from exc
        except NonRetryableHTTPError:
            raise
        except Exception as exc:
            last_error = exc
            logger.warning(
                "http get failed (attempt=%s/%s): %s",
                attempt,
                retries,
                str(exc),
                extra={"request_id": request_id},
            )
            if attempt < retries:
                time.sleep(backoff_s * attempt)

    if last_error:
        raise last_error
    raise RuntimeError("HTTP request failed without explicit exception")


def get_binary_with_retry(
    url: str,
    *,
    timeout_s: float,
    retries: int,
    backoff_s: float,
    request_id: str = "-",
) -> tuple[bytes, str]:
    """GET binary payload with timeout/retry/backoff policy."""
    last_error: Exception | None = None

    for attempt in range(1, retries + 1):
        try:
            response = requests.get(url, timeout=timeout_s)
            if 400 <= response.status_code < 500 and response.status_code != 429:
                raise NonRetryableHTTPError(f"non-retryable status: {response.status_code}")
            response.raise_for_status()
            content_type = str(response.headers.get("content-type", "")).strip() or "application/octet-stream"
            return response.content, content_type
        except NonRetryableHTTPError:
            raise
        except Exception as exc:
            last_error = exc
            logger.warning(
                "http get failed (attempt=%s/%s): %s",
                attempt,
                retries,
                str(exc),
                extra={"request_id": request_id},
            )
            if attempt < retries:
                time.sleep(backoff_s * attempt)

    if last_error:
        raise last_error
    raise RuntimeError("HTTP request failed without explicit exception")
