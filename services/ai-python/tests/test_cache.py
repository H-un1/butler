"""캐시 + rate limit 단위 테스트."""
from __future__ import annotations

from butler_ai.etl.cache import (
    InMemoryCache,
    cache_key_for,
    check_rate_limit,
    get_or_compute,
    rate_limit_key_for,
)
from butler_ai.etl.models import BuildingRegistry, ComplexInfo, MarketPrice, PropertyEnrichment


async def test_cache_miss_then_hit() -> None:
    cache = InMemoryCache()
    calls = 0

    async def compute() -> tuple[PropertyEnrichment, int | None]:
        nonlocal calls
        calls += 1
        return (
            PropertyEnrichment(
                address="강서구",
                market_price=MarketPrice(latest_price=1),
                building=BuildingRegistry(built_year=2020),
                complex=ComplexInfo(households=300),
            ),
            42,
        )

    # 첫 호출 → miss
    enr1, ami1, hit1 = await get_or_compute(cache, "강서구", compute, ttl_seconds=10)
    assert calls == 1 and hit1 is False and ami1 == 42

    # 두 번째 호출 → hit, compute는 다시 호출되지 않음
    enr2, ami2, hit2 = await get_or_compute(cache, "강서구", compute, ttl_seconds=10)
    assert calls == 1 and hit2 is True
    assert enr1 == enr2 and ami1 == ami2


async def test_cache_key_is_address_specific() -> None:
    assert cache_key_for("강서구") != cache_key_for("강남구")
    # whitespace는 trim해서 안정적 키
    assert cache_key_for(" 강서구 ") == cache_key_for("강서구")


async def test_rate_limit_blocks_after_threshold() -> None:
    cache = InMemoryCache()
    client = "test-client"
    for _ in range(30):
        assert await check_rate_limit(cache, client, per_minute=30) is True
    # 31번째 호출은 차단
    assert await check_rate_limit(cache, client, per_minute=30) is False


async def test_rate_limit_keys_are_isolated_per_client() -> None:
    cache = InMemoryCache()
    for _ in range(30):
        await check_rate_limit(cache, "alice", per_minute=30)
    # bob은 영향 없음
    assert await check_rate_limit(cache, "bob", per_minute=30) is True


def test_rate_limit_key_format() -> None:
    assert rate_limit_key_for("alice") == "butler:etl:ratelimit:alice"
