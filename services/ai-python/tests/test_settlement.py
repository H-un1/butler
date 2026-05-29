"""정산 룰엔진 단위/라우트 테스트 — api-node TS 구현과 parity 검증."""
from __future__ import annotations

import math

from fastapi.testclient import TestClient

from butler_ai.main import create_app
from butler_ai.settlement import rules


def _line(**overrides):
    """기본 라인 입력 — 필요한 필드만 override."""
    base = {
        "checklist_key": "x.y",
        "area": "living",
        "category": "ETC",
        "grade": "A",
        "marked_defect": False,
        "repair_cost": 0,
        "years_used": 0.0,
    }
    base.update(overrides)
    return base


def test_wallpaper_grade_f_marked() -> None:
    # 도배 grade F, marked True, cost 1,000,000, years 3 → residual 0.5
    r = rules.compute_line(
        **_line(
            category="WALLPAPER",
            grade="F",
            marked_defect=True,
            repair_cost=1_000_000,
            years_used=3,
        )
    )
    assert r["residual_ratio"] == 0.5
    # 1,000,000 × 0.7 × 1.0 × 0.5 = 350,000
    assert r["tenant_share"] == 350_000
    assert r["landlord_share"] == 650_000
    assert r["eligible"] is True


def test_plumbing_grade_d_marked() -> None:
    # 배관 grade D, marked True, cost 2,000,000, years 5 → residual (15-5)/15
    r = rules.compute_line(
        **_line(
            category="PLUMBING",
            grade="D",
            marked_defect=True,
            repair_cost=2_000_000,
            years_used=5,
        )
    )
    expected_residual = (15 - 5) / 15
    # 공식대로 계산해 단언 (js_round == Math.round)
    expected_tenant = math.floor(2_000_000 * 0.1 * 1.0 * expected_residual + 0.5)
    assert expected_tenant == 133_333
    assert r["tenant_share"] == 133_333
    assert r["landlord_share"] == 2_000_000 - 133_333  # 1,866,667
    assert r["residual_ratio"] == round(expected_residual, 4)


def test_grade_a_normal_wear_not_eligible() -> None:
    # grade A 통상마모(marked False) → eligible False, tenant 0, landlord = cost
    r = rules.compute_line(
        **_line(
            category="WALLPAPER",
            grade="A",
            marked_defect=False,
            repair_cost=500_000,
            years_used=1,
        )
    )
    assert r["eligible"] is False
    assert r["tenant_share"] == 0
    assert r["landlord_share"] == 500_000


def test_years_used_exceeds_durability_residual_zero() -> None:
    # years_used >= durability → residual 0 → tenant_share 0
    r = rules.compute_line(
        **_line(
            category="WALLPAPER",  # durability 6
            grade="F",
            marked_defect=True,
            repair_cost=1_000_000,
            years_used=6,
        )
    )
    assert r["residual_ratio"] == 0.0
    assert r["tenant_share"] == 0
    assert r["landlord_share"] == 1_000_000

    # 초과 사용도 0으로 클램프
    r2 = rules.compute_line(
        **_line(
            category="FLOORING",  # durability 8
            grade="D",
            marked_defect=True,
            repair_cost=1_000_000,
            years_used=20,
        )
    )
    assert r2["residual_ratio"] == 0.0
    assert r2["tenant_share"] == 0


def test_aggregate_totals() -> None:
    lines = [
        _line(
            category="WALLPAPER",
            grade="F",
            marked_defect=True,
            repair_cost=1_000_000,
            years_used=3,
        ),
        _line(
            category="PLUMBING",
            grade="D",
            marked_defect=True,
            repair_cost=2_000_000,
            years_used=5,
        ),
        _line(
            category="WALLPAPER",
            grade="A",
            marked_defect=False,
            repair_cost=500_000,
            years_used=1,
        ),
    ]
    out = rules.compute_settlement(lines)
    assert out["total_cost"] == 3_500_000
    # 집계는 라인 합과 정확히 일치
    assert out["tenant_total"] == sum(line["tenant_share"] for line in out["lines"])
    assert out["landlord_total"] == sum(
        line["landlord_share"] for line in out["lines"]
    )
    assert out["tenant_total"] + out["landlord_total"] == out["total_cost"]
    assert out["tenant_total"] == 350_000 + 133_333  # 483,333


def test_basis_snapshot_structure() -> None:
    basis = rules.basis_snapshot()
    assert basis["rule_version"] == "lh-rule-2026.05-provisional"
    assert basis["durability_table"]["WALLPAPER"] == 6
    assert basis["fault_table"]["PLUMBING"] == 0.1
    assert "AI 추론 아님" in basis["computed_note"]
    assert "tenant_share" in basis["formula"]


def test_js_round_half_up() -> None:
    # 파이썬 기본 round는 은행가 반올림(2.5→2)이지만 js_round는 올림(2.5→3)
    assert rules.js_round(2.5) == 3
    assert rules.js_round(0.5) == 1
    assert rules.js_round(133_333.33) == 133_333


def test_compute_endpoint() -> None:
    app = create_app()
    client = TestClient(app)
    resp = client.post(
        "/settlement/compute",
        json={
            "lines": [
                {
                    "checklist_key": "wall.tear",
                    "area": "living",
                    "category": "WALLPAPER",
                    "grade": "F",
                    "marked_defect": True,
                    "repair_cost": 1_000_000,
                    "years_used": 3,
                }
            ]
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["rule_version"] == "lh-rule-2026.05-provisional"
    assert body["total_cost"] == 1_000_000
    assert body["tenant_total"] == 350_000
    assert body["landlord_total"] == 650_000
    assert len(body["lines"]) == 1
    line = body["lines"][0]
    assert line["tenant_share"] == 350_000
    assert line["residual_ratio"] == 0.5
    assert line["eligible"] is True
    assert "basis" in body
    assert body["basis"]["rule_version"] == "lh-rule-2026.05-provisional"


def test_compute_endpoint_rejects_invalid_category() -> None:
    app = create_app()
    client = TestClient(app)
    resp = client.post(
        "/settlement/compute",
        json={
            "lines": [
                {
                    "checklist_key": "x.y",
                    "area": "living",
                    "category": "INVALID",
                    "grade": "A",
                    "marked_defect": False,
                    "repair_cost": 0,
                    "years_used": 0,
                }
            ]
        },
    )
    assert resp.status_code == 422
