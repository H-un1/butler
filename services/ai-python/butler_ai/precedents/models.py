"""판례 보조 입력/출력 모델 — mock 판례 검색."""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class PrecedentItem(BaseModel):
    """판례 한 건 (전부 가짜 mock 데이터)."""

    case_no: str  # 사건번호
    court: str  # 법원
    summary: str  # 요지
    relevance: float  # 질의 관련도 0.0~1.0


class PrecedentRequest(BaseModel):
    query: str
    category: Optional[str] = None


class PrecedentResult(BaseModel):
    precedents: list[PrecedentItem]
    mock: bool  # 항상 True
    disclaimer: str
