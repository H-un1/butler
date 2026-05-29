"""챗봇 mock 엔진 — 키워드 규칙 기반 고정 답변.

⚠️ 외부 LLM/RAG/임베딩 API를 절대 호출하지 않는다(실 호출 0).
질문 텍스트의 키워드만 보고 결정론적으로 topic을 분류하고 고정 답변을 돌려준다.
모든 답변은 mock 데모이며 법률·세무 자문이 아니다(disclaimer).
"""
from __future__ import annotations

from typing import Any, Optional

# 모든 응답에 붙는 한국어 면책 문구
DISCLAIMER = "본 답변은 mock 데모이며 법률 자문이 아닙니다."

# 주제별 키워드 — 질문에 하나라도 포함되면 해당 주제로 분류
LEASE_LAW_KEYWORDS = ("보증금", "전세", "월세", "임대차", "갱신", "묵시적", "전입신고", "확정일자")
TAX_KEYWORDS = ("세금", "종부세", "종합부동산세", "양도", "양도소득세", "취득세", "재산세", "부가세")


def _classify(question: str, topic: Optional[str]) -> str:
    """topic이 명시되면 그대로, 아니면 키워드로 자동 분류."""
    if topic:
        return topic
    if any(kw in question for kw in LEASE_LAW_KEYWORDS):
        return "LEASE_LAW"
    if any(kw in question for kw in TAX_KEYWORDS):
        return "TAX"
    return "GENERAL"


# 주제별 고정 답변 + 가짜 출처 (mock RAG)
_LEASE_LAW = {
    "answer": (
        "주택임대차보호법상 임차인은 대항력(전입신고)과 우선변제권(확정일자)을 갖추면 "
        "보증금을 일정 한도까지 우선 보호받습니다. 전세 보증금 반환이 지연되면 임차권등기명령을 "
        "신청해 대항력을 유지한 채 이사할 수 있습니다. 계약갱신요구권은 1회(2년) 행사할 수 있습니다."
    ),
    "sources": [
        {
            "title": "주택임대차보호법 제3조(대항력 등)",
            "snippet": "임차인이 주택의 인도와 주민등록을 마친 때에는 그 다음 날부터 제3자에 대하여 효력이 생긴다.",
        },
        {
            "title": "주택임대차보호법 제3조의3(임차권등기명령)",
            "snippet": "임대차가 끝난 후 보증금을 반환받지 못한 임차인은 임차권등기명령을 신청할 수 있다.",
        },
    ],
}

_TAX = {
    "answer": (
        "주택 보유 시 매년 재산세와 종합부동산세(과세기준 초과 시)가 부과되며, 매도 시에는 "
        "보유기간·1세대1주택 여부에 따라 양도소득세가 달라집니다. 1세대1주택 비과세·장기보유특별공제 "
        "요건을 충족하는지 확인하면 세부담을 줄일 수 있습니다."
    ),
    "sources": [
        {
            "title": "소득세법 제89조(비과세 양도소득)",
            "snippet": "1세대가 1주택을 보유기간 요건 등을 충족하여 양도하는 경우 양도소득세를 비과세한다.",
        },
        {
            "title": "종합부동산세법 제8조(과세표준)",
            "snippet": "주택분 종합부동산세의 과세표준은 공시가격 합계액에서 공제금액을 뺀 금액으로 한다.",
        },
    ],
}

_GENERAL = {
    "answer": (
        "임대차·세무 관련 일반 안내입니다. 구체적인 사안은 보증금/전세(임대차법) 또는 "
        "세금/양도(세무) 키워드를 포함해 다시 질문해 주세요. 정확한 판단이 필요하면 "
        "전문가(변호사·세무사) 상담을 권장합니다."
    ),
    "sources": [],
}

_ANSWER_TABLE: dict[str, dict[str, Any]] = {
    "LEASE_LAW": _LEASE_LAW,
    "TAX": _TAX,
    "GENERAL": _GENERAL,
}


def answer_question(question: str, topic: Optional[str] = None) -> dict[str, Any]:
    """질문을 분류하고 고정 답변을 돌려준다 (외부 호출 없음)."""
    resolved = _classify(question, topic)
    # 분류 결과가 테이블에 없으면 일반 안내로 폴백
    payload = _ANSWER_TABLE.get(resolved, _GENERAL)
    return {
        "answer": payload["answer"],
        "topic": resolved,
        "sources": [dict(s) for s in payload["sources"]],
        "mock": True,
        "disclaimer": DISCLAIMER,
    }
