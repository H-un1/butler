"""FastAPI 라우터 — POST /precedents/search (mock 판례 검색)."""
from __future__ import annotations

from fastapi import APIRouter

from . import engine
from .models import PrecedentRequest, PrecedentResult

router = APIRouter(prefix="/precedents", tags=["precedents"])


@router.post("/search", response_model=PrecedentResult)
async def search(body: PrecedentRequest) -> PrecedentResult:
    """쿼리/카테고리로 고정 판례를 반환한다 (외부 검색 호출 없음)."""
    result = engine.search_precedents(body.query, body.category)
    return PrecedentResult(**result)
