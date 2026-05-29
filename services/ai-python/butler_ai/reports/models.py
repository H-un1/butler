"""리포트 입력/출력 모델."""
from __future__ import annotations

from pydantic import BaseModel


class ItemInput(BaseModel):
    area: str
    checklist_key: str
    grade: str  # A~F
    note: str | None = None
    marked_defect: bool = False
    photo_urls: list[str] = []


class ReportRequest(BaseModel):
    inspection_id: str
    property_id: str
    items: list[ItemInput]


class ReportResponse(BaseModel):
    pdf_url: str
    generated_at: str
    item_count: int
    defect_count: int
