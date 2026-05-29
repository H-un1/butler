"""ETL 결과 캐시 + 호출 빈도 제한.

- 캐시: Redis. 같은 주소에 대한 enrich 결과를 TTL(기본 6시간) 동안 재사용.
- rate limit: 분당 키별 호출 횟수 제한. 공공데이터 API 호출제한 회피.
"""
from __future__ import annotations

import json
import time
from typing import Protocol

from .models import PropertyEnrichment


CACHE_TTL_SECONDS = 6 * 3600  # 6시간 — 공공데이터는 자주 갱신되지 않음
RATE_LIMIT_PER_MINUTE = 30  # 키별 분당 호출 한도


class CacheBackend(Protocol):
    async def get(self, key: str) -> str | None: ...
    async def set(self, key: str, value: str, ttl_seconds: int) -> None: ...
    async def incr_with_window(self, key: str, window_seconds: int) -> int: ...


class InMemoryCache:
    """단위 테스트용. production은 Redis 어댑터."""

    def __init__(self) -> None:
        self._store: dict[str, tuple[str, float]] = {}
        self._counters: dict[str, list[float]] = {}

    async def get(self, key: str) -> str | None:
        entry = self._store.get(key)
        if not entry:
            return None
        value, expires_at = entry
        if time.monotonic() > expires_at:
            del self._store[key]
            return None
        return value

    async def set(self, key: str, value: str, ttl_seconds: int) -> None:
        self._store[key] = (value, time.monotonic() + ttl_seconds)

    async def incr_with_window(self, key: str, window_seconds: int) -> int:
        now = time.monotonic()
        bucket = self._counters.setdefault(key, [])
        # 윈도우 밖 타임스탬프 제거
        cutoff = now - window_seconds
        while bucket and bucket[0] < cutoff:
            bucket.pop(0)
        bucket.append(now)
        return len(bucket)


def cache_key_for(address: str) -> str:
    return f"butler:etl:enrich:{address.strip()}"


def rate_limit_key_for(client_id: str) -> str:
    return f"butler:etl:ratelimit:{client_id}"


async def get_or_compute(
    cache: CacheBackend,
    address: str,
    fetch_fresh,
    ttl_seconds: int = CACHE_TTL_SECONDS,
) -> tuple[PropertyEnrichment, int | None, bool]:
    """캐시 히트면 (enrichment, ami, True), 미스면 fetch_fresh를 호출."""
    key = cache_key_for(address)
    cached = await cache.get(key)
    if cached:
        payload = json.loads(cached)
        return (
            PropertyEnrichment(**payload["enrichment"]),
            payload.get("ami_score"),
            True,
        )
    enrichment, ami = await fetch_fresh()
    await cache.set(
        key,
        json.dumps({"enrichment": enrichment.model_dump(), "ami_score": ami}),
        ttl_seconds,
    )
    return enrichment, ami, False


async def check_rate_limit(
    cache: CacheBackend,
    client_id: str,
    *,
    per_minute: int = RATE_LIMIT_PER_MINUTE,
) -> bool:
    """True면 통과, False면 제한 초과."""
    count = await cache.incr_with_window(rate_limit_key_for(client_id), 60)
    return count <= per_minute
