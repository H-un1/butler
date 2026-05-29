"""헬스 체크 — M2 ETL 추가 전 셸 검증."""
from fastapi.testclient import TestClient

from butler_ai.main import create_app


def test_health_returns_ok() -> None:
    client = TestClient(create_app())
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["service"] == "butler/ai-python"


def test_app_title_korean() -> None:
    app = create_app()
    assert "버틀러" in app.title
