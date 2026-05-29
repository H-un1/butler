"""FastAPI 라우터 — POST /etl/enrich."""
from __future__ import annotations

from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from ..config import Settings, load_settings
from .adapters import (
    AdapterKeyMissingError,
    HttpBldRgstAdapter,
    HttpKaptAdapter,
    HttpMolitAdapter,
)
from .service import EtlService


class EnrichRequest(BaseModel):
    address: str


class EnrichResponse(BaseModel):
    enrichment: dict[str, object]
    ami_score: int | None


router = APIRouter(prefix="/etl", tags=["etl"])


def _settings() -> Settings:
    return load_settings()


async def _get_service(
    settings: Annotated[Settings, Depends(_settings)],
) -> EtlService:
    # 키가 모두 비어 있으면 503으로 즉시 거절 — 더미 응답 금지.
    if not (settings.MOLIT_API_KEY and settings.BLDRGST_API_KEY and settings.KAPT_API_KEY):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="공공데이터 API 키 미설정 — MOLIT_API_KEY/BLDRGST_API_KEY/KAPT_API_KEY 발급 후 .env에 설정",
        )
    client = httpx.AsyncClient(timeout=httpx.Timeout(10.0))
    try:
        molit = HttpMolitAdapter(settings.MOLIT_API_KEY, client)
        bld = HttpBldRgstAdapter(settings.BLDRGST_API_KEY, client)
        kapt = HttpKaptAdapter(settings.KAPT_API_KEY, client)
    except AdapterKeyMissingError as exc:
        await client.aclose()
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return EtlService(molit, bld, kapt)


@router.post("/enrich", response_model=EnrichResponse)
async def enrich(
    body: EnrichRequest,
    service: Annotated[EtlService, Depends(_get_service)],
) -> EnrichResponse:
    enrichment, ami = await service.enrich(body.address)
    return EnrichResponse(
        enrichment=enrichment.model_dump(),
        ami_score=ami,
    )
