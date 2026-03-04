import pytest
from _pytest.monkeypatch import MonkeyPatch

from app.clients import http_client


def test_http_client_retries_and_raises(monkeypatch: MonkeyPatch) -> None:
    calls = {"count": 0}

    class DummyResponse:
        status_code = 500

        def raise_for_status(self) -> None:
            raise RuntimeError("boom")

        def json(self) -> dict[str, object]:
            return {}

    def _get(*_args: object, **_kwargs: object) -> DummyResponse:
        calls["count"] += 1
        return DummyResponse()

    monkeypatch.setattr(http_client.requests, "get", _get)

    with pytest.raises(RuntimeError):
        http_client.get_json_with_retry("http://example.com", timeout_s=0.1, retries=2, backoff_s=0)
    assert calls["count"] == 2


def test_http_client_does_not_retry_non_retryable_4xx(monkeypatch: MonkeyPatch) -> None:
    calls = {"count": 0}

    class DummyResponse:
        status_code = 400

        def raise_for_status(self) -> None:
            raise RuntimeError("boom")

        def json(self) -> dict[str, object]:
            return {}

    def _get(*_args: object, **_kwargs: object) -> DummyResponse:
        calls["count"] += 1
        return DummyResponse()

    monkeypatch.setattr(http_client.requests, "get", _get)

    with pytest.raises(http_client.NonRetryableHTTPError):
        http_client.get_json_with_retry("http://example.com", timeout_s=0.1, retries=3, backoff_s=0)
    assert calls["count"] == 1


def test_http_client_does_not_retry_non_json_response(monkeypatch: MonkeyPatch) -> None:
    calls = {"count": 0}

    class DummyResponse:
        status_code = 200
        headers = {"content-type": "text/html"}
        text = "<html>error</html>"

        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, object]:
            raise ValueError("Expecting value: line 1 column 1 (char 0)")

    def _get(*_args: object, **_kwargs: object) -> DummyResponse:
        calls["count"] += 1
        return DummyResponse()

    monkeypatch.setattr(http_client.requests, "get", _get)

    with pytest.raises(http_client.NonRetryableHTTPError):
        http_client.get_json_with_retry("http://example.com", timeout_s=0.1, retries=3, backoff_s=0)
    assert calls["count"] == 1
