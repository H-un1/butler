"""수선비 정산 룰엔진 (룰베이스 — 본체).

분담비율은 AI 임의추론이 아니라 아래 3가지 룰의 결정론적 계산으로 산출한다:
  1) LH 부담기준표  — 항목 카테고리별 임차인 귀책(부담) 기본 비율
  2) 표준 내구연수   — 카테고리별 표준 수명(년)
  3) 감가상각        — 사용연수가 길수록 임차인 원상복구 부담을 잔존가치 비율로 감액

⚠️ 아래 상수표는 잠정값이다 (RECOVERY.md). 정식 LH 기준 확정 시 RULE_VERSION을
   올리고 표를 갱신한다. api-node(services/api-node/src/settlement/rules.ts)의 표와
   반드시 일치해야 한다 (parity).
"""
from __future__ import annotations

import math
from typing import Any

RULE_VERSION = "lh-rule-2026.05-provisional"

# 표준 내구연수(년) — 카테고리별
STANDARD_DURABILITY_YEARS: dict[str, int] = {
    "WALLPAPER": 6,
    "FLOORING": 8,
    "PAINT": 5,
    "PLUMBING": 15,
    "APPLIANCE": 7,
    "FIXTURE": 10,
    "ETC": 10,
}

# LH 부담기준표 — 임차인 귀책(부담) 기본 비율 (0.0 = 전적 임대인, 1.0 = 전적 임차인)
# 노후·구조성 항목일수록 임대인 부담이 크다.
TENANT_FAULT_RATIO: dict[str, float] = {
    "WALLPAPER": 0.7,
    "FLOORING": 0.6,
    "PAINT": 0.5,
    "PLUMBING": 0.1,
    "APPLIANCE": 0.2,
    "FIXTURE": 0.3,
    "ETC": 0.5,
}

# 등급별 손상 가중 — A~C는 통상 마모(정산 제외 가능), D~F는 손상으로 가중.
# 임차인 귀책분에 곱해지는 심각도 계수.
GRADE_SEVERITY: dict[str, float] = {
    "A": 0,
    "B": 0,
    "C": 0.5,
    "D": 1.0,
    "E": 1.0,
    "F": 1.0,
}


def js_round(x: float) -> int:
    """JS Math.round와 동일한 반올림 (0.5는 항상 올림, 음수 없음 전제).

    파이썬 내장 round()는 은행가 반올림(round-half-to-even)이라
    api-node의 Math.round와 값이 어긋날 수 있다. parity를 위해 사용.
    """
    return math.floor(x + 0.5)


def residual_ratio(durability: float, years_used: float) -> float:
    """잔존가치(감가상각) — 사용연수가 내구연수에 가까울수록 임차인 부담 감액.

    residual = max(0, min(1, (durability - years_used) / durability))
    durability <= 0 이면 0.
    """
    if durability <= 0:
        return 0.0
    r = (durability - years_used) / durability
    return max(0.0, min(1.0, r))


def compute_line(
    *,
    checklist_key: str,
    area: str,
    category: str,
    grade: str,
    marked_defect: bool,
    repair_cost: int,
    years_used: float,
) -> dict[str, Any]:
    """한 라인의 임차인 부담액 계산.

    tenant_share = repair_cost × tenant_fault_ratio × grade_severity × residual_ratio
    정산 대상은 결함 마킹(marked_defect) 또는 등급 C 이하(severity > 0)인 항목.
    """
    durability_years = STANDARD_DURABILITY_YEARS[category]
    fault_ratio = TENANT_FAULT_RATIO[category]
    severity = GRADE_SEVERITY[grade]
    residual = residual_ratio(durability_years, years_used)

    # 통상 마모(A/B, 결함 미마킹)는 임대인 부담(임차인 0) — 원상복구 의무 아님
    eligible = marked_defect or severity > 0
    cost = max(0, js_round(repair_cost))

    tenant_share = 0
    if eligible and cost > 0:
        tenant_share = js_round(cost * fault_ratio * severity * residual)
    # 임차인 부담이 총액을 넘지 않도록 클램프
    tenant_share = max(0, min(cost, tenant_share))
    landlord_share = cost - tenant_share

    return {
        "checklist_key": checklist_key,
        "area": area,
        "category": category,
        "grade": grade,
        "marked_defect": marked_defect,
        "repair_cost": cost,
        "years_used": years_used,
        "durability_years": durability_years,
        "tenant_fault_ratio": fault_ratio,
        "grade_severity": severity,
        # residual은 응답엔 소수 4자리, 계산엔 풀 정밀도 사용
        "residual_ratio": round(residual, 4),
        "tenant_share": tenant_share,
        "landlord_share": landlord_share,
        "eligible": eligible,
    }


def basis_snapshot() -> dict[str, Any]:
    """정산 근거 스냅샷 — 응답에 그대로 담아 투명성 확보."""
    return {
        "rule_version": RULE_VERSION,
        "durability_table": dict(STANDARD_DURABILITY_YEARS),
        "fault_table": dict(TENANT_FAULT_RATIO),
        "formula": (
            "tenant_share = repair_cost × tenant_fault_ratio × grade_severity × "
            "residual_ratio; residual_ratio = max(0,(durability−years_used)/durability)"
        ),
        "computed_note": (
            "LH 부담기준표·표준 내구연수·감가상각 기반 룰 산출 (AI 추론 아님). "
            "잠정 상수표."
        ),
    }


def compute_settlement(lines: list[dict[str, Any]]) -> dict[str, Any]:
    """여러 라인을 계산하고 집계한다."""
    results = [compute_line(**line) for line in lines]
    total_cost = sum(line["repair_cost"] for line in results)
    tenant_total = sum(line["tenant_share"] for line in results)
    landlord_total = sum(line["landlord_share"] for line in results)

    return {
        "rule_version": RULE_VERSION,
        "lines": results,
        "total_cost": total_cost,
        "tenant_total": tenant_total,
        "landlord_total": landlord_total,
        "basis": basis_snapshot(),
    }
