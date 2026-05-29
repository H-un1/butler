"""챗봇 입력/출력 모델 — mock RAG 상담."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel

# 상담 주제 — Literal로 유효성 강제. None이면 엔진이 키워드로 자동 분류한다.
ChatTopic = Literal["LEASE_LAW", "TAX", "GENERAL"]


class ChatSource(BaseModel):
    """답변 근거(가짜 출처) — mock RAG가 인용하는 형태."""

    title: str
    snippet: str


class ChatAskRequest(BaseModel):
    question: str
    topic: Optional[ChatTopic] = None


class ChatAnswer(BaseModel):
    answer: str
    topic: str
    sources: list[ChatSource]
    mock: bool  # 항상 True — 외부 LLM 호출 없음을 표식
    disclaimer: str
