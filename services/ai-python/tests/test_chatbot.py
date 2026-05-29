"""챗봇 mock RAG 테스트 — 키워드 분류·sources·mock 표식·disclaimer."""
from __future__ import annotations

from fastapi.testclient import TestClient

from butler_ai.chatbot import engine
from butler_ai.main import create_app


def test_deposit_question_classified_lease_law() -> None:
    # "보증금"·"전세" 포함 → 임대차법 topic + 가짜 출처 2건
    out = engine.answer_question("전세 보증금을 못 돌려받으면 어떻게 하나요?")
    assert out["topic"] == "LEASE_LAW"
    assert len(out["sources"]) >= 2
    assert out["mock"] is True
    assert "법률 자문이 아닙니다" in out["disclaimer"]


def test_tax_question_classified_tax() -> None:
    out = engine.answer_question("양도소득세와 종부세는 어떻게 계산하나요?")
    assert out["topic"] == "TAX"
    assert out["mock"] is True
    assert out["disclaimer"]


def test_unknown_question_general() -> None:
    out = engine.answer_question("안녕하세요")
    assert out["topic"] == "GENERAL"
    assert out["mock"] is True


def test_explicit_topic_overrides_keywords() -> None:
    # topic 명시 시 키워드 무시하고 그대로 사용
    out = engine.answer_question("세금 질문", topic="LEASE_LAW")
    assert out["topic"] == "LEASE_LAW"


def test_ask_endpoint_deposit() -> None:
    client = TestClient(create_app())
    resp = client.post("/chatbot/ask", json={"question": "보증금 보호 방법"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["topic"] == "LEASE_LAW"
    assert len(body["sources"]) >= 2
    assert body["mock"] is True
    assert "mock" in body["disclaimer"]


def test_ask_endpoint_tax() -> None:
    client = TestClient(create_app())
    resp = client.post("/chatbot/ask", json={"question": "종부세 부담"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["topic"] == "TAX"
    assert body["mock"] is True
    assert body["disclaimer"]
