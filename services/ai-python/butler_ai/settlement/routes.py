"""FastAPI 라우터 — POST /settlement/compute.

수선비 정산 룰엔진의 정식 호스트. api-node TS 구현과 숫자 parity를 보장한다.
"""
from __future__ import annotations

from fastapi import APIRouter

from . import rules
from .models import (
    SettlementComputeRequest,
    SettlementComputeResponse,
    SettlementLineResult,
)

router = APIRouter(prefix="/settlement", tags=["settlement"])


@router.post("/compute", response_model=SettlementComputeResponse)
async def compute(body: SettlementComputeRequest) -> SettlementComputeResponse:
    """라인별 임차인/임대인 분담액을 룰베이스로 산출하고 집계한다."""
    computed = rules.compute_settlement(
        [line.model_dump() for line in body.lines]
    )
    return SettlementComputeResponse(
        rule_version=computed["rule_version"],
        lines=[SettlementLineResult(**line) for line in computed["lines"]],
        total_cost=computed["total_cost"],
        tenant_total=computed["tenant_total"],
        landlord_total=computed["landlord_total"],
        basis=computed["basis"],
    )
