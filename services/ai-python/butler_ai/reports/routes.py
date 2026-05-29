"""FastAPI 라우터 — POST /reports/pdf."""
from __future__ import annotations

import contextlib
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse

from ..config import Settings, load_settings
from .defect_ai import NullDefectAnalyzer
from .models import ReportRequest, ReportResponse
from .pdf import render_text_pages, write_minimal_pdf
from .storage import LocalDevStorage, ReportStorage, S3SignedUrlStorage


router = APIRouter(prefix="/reports", tags=["reports"])


def _settings() -> Settings:
    return load_settings()


def _build_storage(settings: Settings) -> ReportStorage:
    aws_bucket = os.getenv("AWS_S3_BUCKET", "")
    aws_key = os.getenv("AWS_ACCESS_KEY_ID", "")
    aws_secret = os.getenv("AWS_SECRET_ACCESS_KEY", "")
    aws_region = os.getenv("AWS_REGION", "ap-northeast-2")

    if aws_bucket and aws_key and aws_secret:
        return S3SignedUrlStorage(aws_bucket, aws_region, aws_key, aws_secret)

    if settings.NODE_ENV != "production":
        base = Path(os.getenv("BUTLER_REPORT_DIR", str(Path(tempfile.gettempdir()) / "butler-reports")))
        return LocalDevStorage(base)

    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="AWS S3 자격증명 미설정 — production 모드에서 PDF 저장 불가",
    )


@router.post("/pdf", response_model=ReportResponse)
async def generate_pdf(
    body: ReportRequest,
    settings: Annotated[Settings, Depends(_settings)],
) -> ReportResponse:
    storage = _build_storage(settings)
    _analyzer = NullDefectAnalyzer()  # AI 결함분석은 키 발급 후 활성화

    text = render_text_pages(body)
    fd, tmp_path = tempfile.mkstemp(suffix=".pdf")
    os.close(fd)  # Windows: 핸들을 닫아야 unlink 가능
    tmp = Path(tmp_path)
    try:
        write_minimal_pdf(text, tmp)
        content = tmp.read_bytes()
    finally:
        with contextlib.suppress(OSError):
            tmp.unlink()

    url = await storage.save(inspection_id=body.inspection_id, content=content)
    return ReportResponse(
        pdf_url=url,
        generated_at=datetime.now(timezone.utc).isoformat(),
        item_count=len(body.items),
        defect_count=sum(1 for it in body.items if it.marked_defect),
    )


@router.get("/pdf/{inspection_id}")
async def get_pdf(inspection_id: str) -> FileResponse:
    """저장된 PDF를 스트리밍. LocalDevStorage가 쓰는 BUTLER_REPORT_DIR/<id>.pdf를 조회."""
    base = Path(
        os.getenv(
            "BUTLER_REPORT_DIR",
            str(Path(tempfile.gettempdir()) / "butler-reports"),
        )
    )
    target = base / f"{inspection_id}.pdf"
    if not target.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="PDF 파일을 찾을 수 없습니다",
        )
    return FileResponse(
        path=str(target),
        media_type="application/pdf",
        filename=f"butler-report-{inspection_id}.pdf",
        headers={"Cache-Control": "private, no-store"},
    )
