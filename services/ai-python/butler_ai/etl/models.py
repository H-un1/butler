"""ETL 결과 정규화 모델 — api-node로 넘어가 Property에 매핑된다."""
from __future__ import annotations

from pydantic import BaseModel, Field


class MarketPrice(BaseModel):
    """국토부 실거래가 — 최근 N건 집계."""

    latest_price: int | None = None
    latest_deal_date: str | None = None
    avg_last_12m: int | None = None
    sample_count: int = 0


class BuildingRegistry(BaseModel):
    """건축물대장 — 준공·층·면적·주차."""

    built_year: int | None = None
    floors_above: int | None = None
    floors_below: int | None = None
    area_m2: float | None = None
    parking_per_household: float | None = None


class ComplexInfo(BaseModel):
    """K-APT 단지정보 — 세대수·관리비·주차."""

    households: int | None = None
    mgmt_fee_monthly: int | None = None
    brand: str | None = None


class PropertyEnrichment(BaseModel):
    """3개 공공데이터를 합친 자산 enrich 결과."""

    address: str
    market_price: MarketPrice = Field(default_factory=MarketPrice)
    building: BuildingRegistry = Field(default_factory=BuildingRegistry)
    complex: ComplexInfo = Field(default_factory=ComplexInfo)
