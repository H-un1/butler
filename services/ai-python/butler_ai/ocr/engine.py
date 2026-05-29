"""등기부 OCR mock 엔진 — 고정/규칙 파싱 + 깡통전세 안전등급.

⚠️ 외부 OCR/비전 모델/네트워크를 절대 호출하지 않는다(실 호출 0).
document_ref/raw_text가 있으면 그걸 '근거'로 가짜 파싱 결과를 만들 뿐 실제 OCR이 아니다.

🔒 주민등록번호 등 고유식별정보는 절대 평문으로 반환·로그·저장하지 않는다.
   소유자/권리자 식별정보는 항상 RRN_MASK("######-*******") 형태로만 노출한다.
"""
from __future__ import annotations

from typing import Any, Optional

# 주민번호 마스킹 표준형 — 13자리 평문이 코드 어디에도 등장하지 않도록 이 상수만 사용
RRN_MASK = "######-*******"

DISCLAIMER = "본 진단은 mock 데모이며 법적 효력이 없습니다. 실제 등기부 열람·전문가 확인이 필요합니다."

# 안전등급 임계값 (근저당 합 / 시세)
DANGER_THRESHOLD = 0.8  # 이상이면 DANGER
CAUTION_THRESHOLD = 0.6  # 이상이면 CAUTION


def _safety(total_debt: int, market_price: Optional[int]) -> tuple[str, str]:
    """깡통전세 안전등급 룰. 시세가 없으면 판정 불가로 CAUTION."""
    if market_price is None or market_price <= 0:
        return "CAUTION", "시세 정보가 없어 채권 대비 안전성을 판정할 수 없습니다."
    ratio = total_debt / market_price
    pct = round(ratio * 100, 1)
    if ratio >= DANGER_THRESHOLD:
        return "DANGER", f"근저당 합이 시세의 {pct}%로 위험 수준입니다(임계 80%↑). 깡통전세 위험이 높습니다."
    if ratio >= CAUTION_THRESHOLD:
        return "CAUTION", f"근저당 합이 시세의 {pct}%로 주의 수준입니다(임계 60%↑). 보증금 보호 여부를 확인하세요."
    return "SAFE", f"근저당 합이 시세의 {pct}%로 비교적 안전한 수준입니다."


def parse_registry(
    *,
    document_ref: Optional[str] = None,
    raw_text: Optional[str] = None,
    market_price: Optional[int] = None,
) -> dict[str, Any]:
    """등기부를 mock 파싱하고 안전등급을 산출한다 (외부 호출 없음).

    raw_text/document_ref는 '어떤 문서를 봤는지'를 reason/address에 반영하는 용도일 뿐
    실제 텍스트 인식을 수행하지 않는다. 권리/채권 구조는 고정 mock 값이다.
    """
    # 근거 표기 — 실제 추출이 아님을 명확히
    if raw_text:
        source_note = "제출된 raw_text 기반 mock 파싱"
    elif document_ref:
        source_note = f"문서참조({document_ref}) 기반 mock 파싱"
    else:
        source_note = "샘플 등기부 기반 mock 파싱"

    # 고정 mock 권리 구조 — 식별정보는 전부 마스킹
    rights = [
        {"type": "소유권", "holder_masked": RRN_MASK, "amount": 0},
        {"type": "근저당권", "holder_masked": RRN_MASK, "amount": 180_000_000},
    ]
    total_debt = sum(r["amount"] for r in rights)

    grade, reason = _safety(total_debt, market_price)

    return {
        "owner_masked": RRN_MASK,
        "address": "서울특별시 ○○구 ○○로 123 (mock)",
        "rights": rights,
        "total_debt": total_debt,
        "safety_grade": grade,
        "safety_reason": f"{reason} ({source_note})",
        "rrn_masked": True,
        "mock": True,
        "disclaimer": DISCLAIMER,
    }
