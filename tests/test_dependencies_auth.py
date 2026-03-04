from fastapi import FastAPI
from starlette.requests import Request

from app.dependencies import is_authenticated


def _build_request(session: dict[str, str], *, admin_id: str = "admin", namespace: str = "poi_map_pnu") -> Request:
    app = FastAPI()
    app.state.config = type(
        "Config",
        (),
        {
            "ADMIN_ID": admin_id,
            "SESSION_NAMESPACE": namespace,
        },
    )()
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/admin",
        "headers": [],
        "query_string": b"",
        "client": ("127.0.0.1", 50000),
        "server": ("testserver", 80),
        "scheme": "http",
        "root_path": "",
        "app": app,
        "session": session,
    }

    async def receive() -> dict[str, object]:
        return {"type": "http.request", "body": b"", "more_body": False}

    return Request(scope, receive)


def test_is_authenticated_requires_user_and_namespace_match() -> None:
    req = _build_request({"user": "admin", "session_namespace": "poi_map_pnu"})
    assert is_authenticated(req) is True


def test_is_authenticated_rejects_namespace_mismatch() -> None:
    req = _build_request({"user": "admin", "session_namespace": "idle_public_property"})
    assert is_authenticated(req) is False

