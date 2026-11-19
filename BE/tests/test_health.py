from app.middleware import resolve_request_id
from app.routers.health import liveness
from starlette.datastructures import Headers


def test_liveness_returns_ok() -> None:
    response = liveness()

    assert response.status == "ok"


def test_request_context_preserves_request_id() -> None:
    request_id = resolve_request_id(Headers({"X-Request-ID": "test-request"}))

    assert request_id == "test-request"
