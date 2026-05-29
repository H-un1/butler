"""3개 어댑터를 묶어 자산 enrich을 수행 — Redis 캐시 + rate limit은 cache.py."""
from __future__ import annotations

import asyncio
from datetime import date

from .adapters import (
    AdapterKeyMissingError,
    BldRgstAdapter,
    KaptAdapter,
    MolitAdapter,
)
from .ami import compute_ami_provisional
from .models import BuildingRegistry, ComplexInfo, MarketPrice, PropertyEnrichment


class EtlService:
    def __init__(
        self,
        molit: MolitAdapter,
        bld: BldRgstAdapter,
        kapt: KaptAdapter,
    ) -> None:
        self._molit = molit
        self._bld = bld
        self._kapt = kapt

    async def enrich(self, address: str) -> tuple[PropertyEnrichment, int | None]:
        """3개 어댑터를 병렬 호출하고 AMI까지 산출. (enrichment, ami_score)."""
        market_t = asyncio.create_task(self._safe_market(address))
        bld_t = asyncio.create_task(self._safe_building(address))
        kapt_t = asyncio.create_task(self._safe_complex(address))

        market, building, complex_info = await asyncio.gather(market_t, bld_t, kapt_t)

        enrichment = PropertyEnrichment(
            address=address,
            market_price=market,
            building=building,
            complex=complex_info,
        )
        ami = compute_ami_provisional(
            building=building,
            complex_info=complex_info,
            market=market,
            today=date.today(),
        )
        return enrichment, ami

    async def _safe_market(self, address: str) -> MarketPrice:
        try:
            return await self._molit.fetch_market_price(address)
        except (AdapterKeyMissingError, NotImplementedError):
            return MarketPrice()

    async def _safe_building(self, address: str) -> BuildingRegistry:
        try:
            return await self._bld.fetch_building(address)
        except (AdapterKeyMissingError, NotImplementedError):
            return BuildingRegistry()

    async def _safe_complex(self, address: str) -> ComplexInfo:
        try:
            return await self._kapt.fetch_complex(address)
        except (AdapterKeyMissingError, NotImplementedError):
            return ComplexInfo()
