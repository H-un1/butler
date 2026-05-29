"""등기부 OCR 입력/출력 모델 — mock 파싱 + 안전등급."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel

# 깡통전세 안전등급 — 근저당 합/시세 비율로 결정
SafetyGrade = Literal["SAFE", "CAUTION", "DANGER"]


class RegistryRight(BaseModel):
    """등기 권리 한 건 (소유권/근저당 등). 권리자 주민번호는 항상 마스킹."""

    type: str  # 예) "소유권", "근저당권"
    holder_masked: str  # 주민번호/식별정보는 마스킹된 형태만
    amount: int  # 채권최고액 등 (원). 소유권은 0


class OcrRegistryRequest(BaseModel):
    document_ref: Optional[str] = None  # 업로드된 등기부 참조 키
    raw_text: Optional[str] = None  # 사전 추출 텍스트(있으면 근거로 사용, 실 OCR 아님)
    market_price: Optional[int] = None  # 시세(원) — 안전등급 판정에 사용


class OcrRegistryResult(BaseModel):
    owner_masked: str  # 소유자 식별정보 마스킹
    address: str
    rights: list[RegistryRight]
    total_debt: int  # 근저당 채권최고액 합계(원)
    safety_grade: SafetyGrade
    safety_reason: str
    rrn_masked: bool  # 항상 True — 주민번호 평문 미반환 보증 표식
    mock: bool  # 항상 True
    disclaimer: str
