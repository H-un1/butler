"""판례 보조 mock 엔진 — 쿼리/카테고리 키워드로 고정 판례 반환.

⚠️ 외부 판례 검색 API/모델을 절대 호출하지 않는다(실 호출 0).
case_no·요약은 전부 가짜(mock) 데이터이며 실제 판례가 아니다.
"""
from __future__ import annotations

from typing import Any, Optional

DISCLAIMER = "본 판례 검색은 mock 데모이며 실제 판례가 아닙니다. 법률 자문으로 사용할 수 없습니다."

# 원상복구/수선비 정산 보조용 고정 판례 (가짜)
_REPAIR_PRECEDENTS = [
    {
        "case_no": "대법원 2020다123456",
        "court": "대법원",
        "summary": "임차인의 원상복구 의무는 통상의 손모(자연 마모)에는 미치지 않으며, 통상 손모분의 비용은 임대인이 부담한다.",
        "relevance": 0.95,
    },
    {
        "case_no": "서울중앙지방법원 2019가단654321",
        "court": "서울중앙지방법원",
        "summary": "도배·장판 등 소모성 항목은 사용연수에 따른 감가를 반영해 임차인 부담분을 산정함이 타당하다.",
        "relevance": 0.88,
    },
    {
        "case_no": "대법원 2018다987654",
        "court": "대법원",
        "summary": "임차인의 고의·과실로 인한 훼손은 통상 손모와 구분되어 원상복구 비용을 임차인이 부담한다.",
        "relevance": 0.82,
    },
]

# 보증금 반환 관련 고정 판례 (가짜)
_DEPOSIT_PRECEDENTS = [
    {
        "case_no": "대법원 2021다112233",
        "court": "대법원",
        "summary": "임대차 종료 후 보증금 반환과 목적물 인도는 동시이행 관계에 있다.",
        "relevance": 0.9,
    },
    {
        "case_no": "수원지방법원 2020가합445566",
        "court": "수원지방법원",
        "summary": "임차인이 임차권등기를 마친 경우 이사 후에도 대항력과 우선변제권이 유지된다.",
        "relevance": 0.85,
    },
]


def search_precedents(query: str, category: Optional[str] = None) -> dict[str, Any]:
    """쿼리/카테고리 키워드로 고정 판례 묶음을 고른다 (외부 호출 없음).

    보증금/반환 키워드 → 보증금 판례, 그 외(원상복구·수선비 등) → 수선 판례.
    어느 경우든 2건 이상을 반환한다.
    """
    haystack = f"{query} {category or ''}"
    if any(kw in haystack for kw in ("보증금", "반환", "임차권등기")):
        chosen = _DEPOSIT_PRECEDENTS
    else:
        chosen = _REPAIR_PRECEDENTS

    return {
        "precedents": [dict(p) for p in chosen],
        "mock": True,
        "disclaimer": DISCLAIMER,
    }
