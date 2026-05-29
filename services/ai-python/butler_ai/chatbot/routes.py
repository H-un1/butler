"""FastAPI 라우터 — POST /chatbot/ask (mock RAG 상담)."""
from __future__ import annotations

from fastapi import APIRouter

from . import engine
from .models import ChatAnswer, ChatAskRequest

router = APIRouter(prefix="/chatbot", tags=["chatbot"])


@router.post("/ask", response_model=ChatAnswer)
async def ask(body: ChatAskRequest) -> ChatAnswer:
    """질문을 키워드 규칙으로 분류해 고정 답변을 반환한다 (외부 LLM 호출 없음)."""
    result = engine.answer_question(body.question, body.topic)
    return ChatAnswer(**result)
