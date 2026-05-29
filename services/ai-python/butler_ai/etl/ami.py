"""AMI (자산관리지수) 산출.

⚠️ 가중치는 NEEDS CLARIFICATION (PRD 01 §7). 임시 가중치를 사용하고, 결정되면 갱신한다.
공식 가중치 결정 전에는 AMI를 "잠정" 점수로 명시한다.
"""
from __future__ import annotations

from datetime import date

from .models import BuildingRegistry, ComplexInfo, MarketPrice


# 임시 가중치 — 노후도 0.4, 세대수 0.2, 주차 0.2, 시세 안정성 0.2
# 공식 가중치는 PRD 01 §7 NEEDS CLARIFICATION 해소 후 교체.
_W_AGE = 0.4
_W_HOUSEHOLDS = 0.2
_W_PARKING = 0.2
_W_PRICE = 0.2


def compute_ami_provisional(
    *,
    building: BuildingRegistry,
    complex_info: ComplexInfo,
    market: MarketPrice,
    today: date | None = None,
) -> int | None:
    """0~100 점수로 AMI를 산출 (잠정). 입력이 부족하면 None."""

    today = today or date.today()
    parts: list[tuple[float, float]] = []  # (weight, score in 0..1)

    if building.built_year:
        age = max(0, today.year - building.built_year)
        # 30년 신축 = 1.0, 60년 노후 = 0.0 선형 (단순 모델)
        age_score = max(0.0, min(1.0, (60 - age) / 30))
        parts.append((_W_AGE, age_score))

    if complex_info.households:
        # 100세대 미만 0.3, 500세대 이상 1.0 — 관리 효율 가정
        h = complex_info.households
        score = max(0.0, min(1.0, (h - 100) / 400))
        parts.append((_W_HOUSEHOLDS, score))

    if building.parking_per_household is not None:
        p = building.parking_per_household
        # 세대당 0.5 = 0.0, 1.5 = 1.0
        score = max(0.0, min(1.0, (p - 0.5)))
        parts.append((_W_PARKING, score))

    if market.sample_count > 0 and market.avg_last_12m and market.latest_price:
        # 가격 변동성 = 평균 대비 최근가의 편차. 작을수록 안정 (높은 점수).
        deviation = abs(market.latest_price - market.avg_last_12m) / market.avg_last_12m
        score = max(0.0, 1.0 - deviation * 5)
        parts.append((_W_PRICE, score))

    if not parts:
        return None

    weight_sum = sum(w for w, _ in parts)
    weighted = sum(w * s for w, s in parts)
    normalized = weighted / weight_sum
    return round(normalized * 100)
