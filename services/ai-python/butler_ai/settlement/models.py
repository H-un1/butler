"""정산 입력/출력 모델 — api-node TS 타입과 대응."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

# 카테고리/등급 유효성은 Literal로 강제 (pydantic이 422로 거부)
SettlementCategory = Literal[
    "WALLPAPER",
    "FLOORING",
    "PAINT",
    "PLUMBING",
    "APPLIANCE",
    "FIXTURE",
    "ETC",
]
InspectionGrade = Literal["A", "B", "C", "D", "E", "F"]


class SettlementLineInput(BaseModel):
    checklist_key: str
    area: str
    category: SettlementCategory
    grade: InspectionGrade
    marked_defect: bool
    repair_cost: int  # 원
    years_used: float  # 해당 항목 사용 연수


class SettlementLineResult(SettlementLineInput):
    durability_years: int
    tenant_fault_ratio: float
    grade_severity: float
    residual_ratio: float  # 잔존가치 비율 (감가상각 후, 소수 4자리)
    tenant_share: int
    landlord_share: int
    eligible: bool  # 정산 대상 여부 (손상·결함만)


class SettlementComputeRequest(BaseModel):
    lines: list[SettlementLineInput]


class SettlementComputeResponse(BaseModel):
    rule_version: str
    lines: list[SettlementLineResult]
    total_cost: int
    tenant_total: int
    landlord_total: int
    basis: dict
