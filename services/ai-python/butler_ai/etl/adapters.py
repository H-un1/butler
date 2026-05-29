"""공공데이터 어댑터 — Protocol + 실 HTTP 구현 + 키 미발급 가드.

⚠️ 04_PROJECT_SPEC "절대 하지 마": 공공데이터 응답을 더미·하드코딩으로 대체 금지.
키가 비면 어댑터는 명시적으로 KeyMissing을 던지고 API 라우터가 503을 반환한다.
"""
from __future__ import annotations

from typing import Protocol

import httpx

from .models import BuildingRegistry, ComplexInfo, MarketPrice


class AdapterKeyMissingError(RuntimeError):
    """API 키가 .env에 설정되지 않음 — 발급 후 재시도."""


class MolitAdapter(Protocol):
    async def fetch_market_price(self, address: str) -> MarketPrice: ...


class BldRgstAdapter(Protocol):
    async def fetch_building(self, address: str) -> BuildingRegistry: ...


class KaptAdapter(Protocol):
    async def fetch_complex(self, address: str) -> ComplexInfo: ...


# 국토부 실거래가 ============================================

class HttpMolitAdapter:
    """국토부 실거래가 OpenAPI (data.go.kr) 호출."""

    BASE_URL = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade"

    def __init__(self, api_key: str, client: httpx.AsyncClient) -> None:
        if not api_key:
            raise AdapterKeyMissingError("MOLIT_API_KEY 미설정")
        self._api_key = api_key
        self._client = client

    async def fetch_market_price(self, address: str) -> MarketPrice:
        # 실제 호출 인터페이스 — 응답 파싱은 공식 spec 확인 후 채운다 (M2 NEEDS CLARIFICATION).
        # 키 발급되면 여기에 실 HTTP 호출 + XML/JSON 파싱.
        raise NotImplementedError(
            "MolitAdapter.fetch_market_price 실 호출은 키 발급 + spec 확인 후 구현"
        )


# 건축물대장 ============================================

class HttpBldRgstAdapter:
    """건축물대장 OpenAPI (data.go.kr)."""

    BASE_URL = "https://apis.data.go.kr/1613000/BldRgstService_v2"

    def __init__(self, api_key: str, client: httpx.AsyncClient) -> None:
        if not api_key:
            raise AdapterKeyMissingError("BLDRGST_API_KEY 미설정")
        self._api_key = api_key
        self._client = client

    async def fetch_building(self, address: str) -> BuildingRegistry:
        raise NotImplementedError(
            "BldRgstAdapter.fetch_building 실 호출은 키 발급 + spec 확인 후 구현"
        )


# K-APT 단지정보 ============================================

class HttpKaptAdapter:
    """K-APT 공동주택관리정보시스템 OpenAPI."""

    BASE_URL = "https://openapi.k-apt.go.kr/openApi"

    def __init__(self, api_key: str, client: httpx.AsyncClient) -> None:
        if not api_key:
            raise AdapterKeyMissingError("KAPT_API_KEY 미설정")
        self._api_key = api_key
        self._client = client

    async def fetch_complex(self, address: str) -> ComplexInfo:
        raise NotImplementedError(
            "KaptAdapter.fetch_complex 실 호출은 키 발급 + spec 확인 후 구현"
        )
