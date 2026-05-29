"""등기부 OCR mock 테스트 — 주민번호 마스킹·안전등급 룰·mock 표식.

🔒 핵심: 결과 어디에도 13자리 주민번호 평문이 등장하지 않아야 한다.
"""
from __future__ import annotations

import re

from fastapi.testclient import TestClient

from butler_ai.main import create_app
from butler_ai.ocr import engine

# 13자리 연속 숫자(주민번호 평문) 탐지용 — 결과에 절대 없어야 함
_RRN_PLAINTEXT = re.compile(r"\d{6}[-]?\d{7}")


def _assert_no_rrn(payload: object) -> None:
    """직렬화한 전체 응답에 주민번호 평문이 없음을 단언."""
    text = str(payload)
    assert _RRN_PLAINTEXT.search(text) is None, "주민번호 평문이 응답에 노출됨"


def test_rrn_always_masked() -> None:
    out = engine.parse_registry(market_price=300_000_000)
    assert out["rrn_masked"] is True
    assert out["owner_masked"] == "######-*******"
    for right in out["rights"]:
        assert right["holder_masked"] == "######-*******"
    # 결과 어디에도 13자리 숫자 없음
    _assert_no_rrn(out)


def test_danger_when_debt_ratio_high() -> None:
    # total_debt 180,000,000 기준 ratio ~0.85 → DANGER
    # 180,000,000 / price = 0.85 → price ≈ 211,764,705
    out = engine.parse_registry(market_price=211_764_705)
    ratio = out["total_debt"] / 211_764_705
    assert round(ratio, 2) == 0.85
    assert out["safety_grade"] == "DANGER"


def test_safe_when_debt_ratio_low() -> None:
    # ratio 0.5 → SAFE. 180,000,000 / 0.5 = 360,000,000
    out = engine.parse_registry(market_price=360_000_000)
    ratio = out["total_debt"] / 360_000_000
    assert ratio == 0.5
    assert out["safety_grade"] == "SAFE"


def test_caution_when_no_market_price() -> None:
    out = engine.parse_registry(market_price=None)
    assert out["safety_grade"] == "CAUTION"


def test_caution_boundary() -> None:
    # ratio 0.7 → CAUTION (0.6 이상 0.8 미만). 180M / 0.7 ≈ 257,142,857
    out = engine.parse_registry(market_price=257_142_857)
    assert out["safety_grade"] == "CAUTION"


def test_raw_text_used_as_basis_not_real_ocr() -> None:
    out = engine.parse_registry(raw_text="등기부 텍스트 샘플", market_price=300_000_000)
    assert "raw_text" in out["safety_reason"]
    _assert_no_rrn(out)


def test_registry_endpoint() -> None:
    client = TestClient(create_app())
    resp = client.post(
        "/ocr/registry",
        json={"document_ref": "doc-123", "market_price": 211_764_705},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["mock"] is True
    assert body["rrn_masked"] is True
    assert body["safety_grade"] == "DANGER"
    assert body["disclaimer"]
    _assert_no_rrn(body)
