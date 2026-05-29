"""ETL 어댑터/서비스/라우트 테스트.

키 없이도 동작해야 하는 것:
- AMI 산출 단위 테스트 (모델만)
- service의 graceful degradation (각 어댑터가 None/기본값 반환 시 enrichment는 빈 모델로)
- routes 503 응답 (키 없을 때 더미 응답 금지 강제 확인)
"""
from __future__ import annotations

from datetime import date

import pytest
from fastapi.testclient import TestClient

from butler_ai.config import Settings
from butler_ai.etl.adapters import (
    AdapterKeyMissingError,
    HttpBldRgstAdapter,
    HttpKaptAdapter,
    HttpMolitAdapter,
)
from butler_ai.etl.ami import compute_ami_provisional
from butler_ai.etl.models import BuildingRegistry, ComplexInfo, MarketPrice
from butler_ai.etl.service import EtlService
from butler_ai.main import create_app


class _StubMolit:
    async def fetch_market_price(self, address: str) -> MarketPrice:
        return MarketPrice(
            latest_price=920_000_000,
            latest_deal_date="2026-04-30",
            avg_last_12m=900_000_000,
            sample_count=12,
        )


class _StubBld:
    async def fetch_building(self, address: str) -> BuildingRegistry:
        return BuildingRegistry(
            built_year=2015,
            floors_above=20,
            floors_below=2,
            area_m2=84.9,
            parking_per_household=1.2,
        )


class _StubKapt:
    async def fetch_complex(self, address: str) -> ComplexInfo:
        return ComplexInfo(households=600, mgmt_fee_monthly=230_000, brand="항공아파트")


class _BrokenAdapter:
    async def fetch_market_price(self, address: str) -> MarketPrice:
        raise NotImplementedError()

    async def fetch_building(self, address: str) -> BuildingRegistry:
        raise NotImplementedError()

    async def fetch_complex(self, address: str) -> ComplexInfo:
        raise NotImplementedError()


# === Adapter key guard ===

def test_adapter_raises_when_key_missing() -> None:
    import httpx

    client = httpx.AsyncClient()
    with pytest.raises(AdapterKeyMissingError):
        HttpMolitAdapter("", client)
    with pytest.raises(AdapterKeyMissingError):
        HttpBldRgstAdapter("", client)
    with pytest.raises(AdapterKeyMissingError):
        HttpKaptAdapter("", client)


# === AMI ===

def test_ami_returns_none_when_all_inputs_empty() -> None:
    score = compute_ami_provisional(
        building=BuildingRegistry(),
        complex_info=ComplexInfo(),
        market=MarketPrice(),
    )
    assert score is None


def test_ami_ranges_0_to_100_with_full_inputs() -> None:
    score = compute_ami_provisional(
        building=BuildingRegistry(built_year=2015, parking_per_household=1.2),
        complex_info=ComplexInfo(households=600),
        market=MarketPrice(latest_price=920_000_000, avg_last_12m=900_000_000, sample_count=12),
        today=date(2026, 5, 28),
    )
    assert score is not None
    assert 0 <= score <= 100


# === Service degradation ===

async def test_service_falls_back_to_empty_when_adapters_broken() -> None:
    broken = _BrokenAdapter()
    service = EtlService(broken, broken, broken)  # type: ignore[arg-type]
    enrichment, ami = await service.enrich("강서구")
    assert enrichment.market_price == MarketPrice()
    assert enrichment.building == BuildingRegistry()
    assert enrichment.complex == ComplexInfo()
    assert ami is None


async def test_service_aggregates_stub_results() -> None:
    service = EtlService(_StubMolit(), _StubBld(), _StubKapt())
    enrichment, ami = await service.enrich("서울시 강서구 화곡로 12")
    assert enrichment.market_price.latest_price == 920_000_000
    assert enrichment.building.built_year == 2015
    assert enrichment.complex.households == 600
    assert ami is not None and ami > 0


# === Routes — 키 없으면 503 (더미 응답 금지 강제) ===

def test_etl_enrich_returns_503_without_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    # 환경에 진짜 키가 들어있더라도 테스트에선 빈 settings로 강제
    monkeypatch.delenv("MOLIT_API_KEY", raising=False)
    monkeypatch.delenv("BLDRGST_API_KEY", raising=False)
    monkeypatch.delenv("KAPT_API_KEY", raising=False)
    # 의존성 캐시 무력화 — load_settings는 매 호출 새 Settings 생성하므로 그대로 사용 가능

    app = create_app()
    # 라우터의 _settings dependency가 빈 키를 보게 강제
    from butler_ai.etl import routes as r

    def empty_settings() -> Settings:
        return Settings(MOLIT_API_KEY="", BLDRGST_API_KEY="", KAPT_API_KEY="")

    app.dependency_overrides[r._settings] = empty_settings

    client = TestClient(app)
    resp = client.post("/etl/enrich", json={"address": "서울시 강서구"})
    assert resp.status_code == 503
    assert "API 키 미설정" in resp.json()["detail"]
