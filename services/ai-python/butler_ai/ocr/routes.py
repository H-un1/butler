"""FastAPI 라우터 — POST /ocr/registry (mock 등기부 OCR + 안전등급)."""
from __future__ import annotations

from fastapi import APIRouter

from . import engine
from .models import OcrRegistryRequest, OcrRegistryResult

router = APIRouter(prefix="/ocr", tags=["ocr"])


@router.post("/registry", response_model=OcrRegistryResult)
async def registry(body: OcrRegistryRequest) -> OcrRegistryResult:
    """등기부를 mock 파싱하고 깡통전세 안전등급을 반환한다 (외부 OCR 호출 없음, 주민번호 마스킹)."""
    result = engine.parse_registry(
        document_ref=body.document_ref,
        raw_text=body.raw_text,
        market_price=body.market_price,
    )
    return OcrRegistryResult(**result)
