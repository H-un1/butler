"""AI 결함분석 보조.

⚠️ NEEDS CLARIFICATION (PRD 01 §7): 자체 학습 vs 외부 비전 API.
M4는 인터페이스만 정의하고, 키 없으면 분석을 생략 (점검자 입력 등급은 항상 사용).
"""
from __future__ import annotations

from typing import Protocol

from .models import ItemInput


class DefectAnalyzer(Protocol):
    async def suggest_grade(self, item: ItemInput) -> str | None: ...


class NullDefectAnalyzer:
    """결함분석 미설정. suggest_grade는 항상 None — 점검자 입력 그대로 사용."""

    async def suggest_grade(self, item: ItemInput) -> str | None:
        return None


class HttpDefectAnalyzer:
    """외부 비전 API 호출. 키 발급 후 구현."""

    def __init__(self, endpoint: str, api_key: str) -> None:
        if not api_key:
            raise RuntimeError("결함분석 API 키 누락")
        self._endpoint = endpoint
        self._api_key = api_key

    async def suggest_grade(self, item: ItemInput) -> str | None:
        raise NotImplementedError(
            "HttpDefectAnalyzer.suggest_grade 실 호출은 비전 API 선정 후 구현"
        )
