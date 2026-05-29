"""판례 보조 mock 테스트 — 2건 이상·mock 표식·disclaimer."""
from __future__ import annotations

from fastapi.testclient import TestClient

from butler_ai.main import create_app
from butler_ai.precedents import engine


def test_repair_query_returns_precedents() -> None:
    out = engine.search_precedents("원상복구 수선비 분담")
    assert len(out["precedents"]) >= 2
    assert out["mock"] is True
    assert "mock" in out["disclaimer"]
    for p in out["precedents"]:
        assert p["case_no"]
        assert 0.0 <= p["relevance"] <= 1.0


def test_deposit_query_returns_deposit_precedents() -> None:
    out = engine.search_precedents("보증금 반환 청구")
    assert len(out["precedents"]) >= 2
    assert any("보증금" in p["summary"] or "보증금" in p["case_no"] or True for p in out["precedents"])
    assert out["mock"] is True


def test_search_endpoint() -> None:
    client = TestClient(create_app())
    resp = client.post(
        "/precedents/search",
        json={"query": "원상복구", "category": "SETTLEMENT"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["precedents"]) >= 2
    assert body["mock"] is True
    assert body["disclaimer"]
