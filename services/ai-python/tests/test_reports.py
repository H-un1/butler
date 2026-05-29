"""PDF 생성 + 저장 + 라우트 테스트."""
from __future__ import annotations

import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from butler_ai.main import create_app
from butler_ai.reports.models import ItemInput, ReportRequest
from butler_ai.reports.pdf import render_text_pages, write_minimal_pdf
from butler_ai.reports.storage import LocalDevStorage


def _sample_req() -> ReportRequest:
    return ReportRequest(
        inspection_id="insp_test",
        property_id="prop_test",
        items=[
            ItemInput(area="bath", checklist_key="bath.leak", grade="B", marked_defect=True, note="caulk"),
            ItemInput(area="living", checklist_key="living.floor", grade="A"),
        ],
    )


def test_render_text_contains_summary() -> None:
    req = _sample_req()
    text = render_text_pages(req)
    assert "버틀러 점검 리포트" in text
    assert "insp_test" in text
    assert "Items:         총 2개" in text
    assert "Marked defect: 1개" in text


def test_write_minimal_pdf_creates_valid_file(tmp_path: Path) -> None:
    out = tmp_path / "out.pdf"
    write_minimal_pdf(render_text_pages(_sample_req()), out)
    data = out.read_bytes()
    assert data.startswith(b"%PDF-")
    assert b"%%EOF" in data
    # Pretendard 폰트가 임베드되면 파일이 충분히 커진다(>5KB).
    assert out.stat().st_size > 5_000


async def test_local_dev_storage_writes_to_disk(tmp_path: Path) -> None:
    storage = LocalDevStorage(tmp_path)
    url = await storage.save(inspection_id="insp_X", content=b"%PDF-1.4 fake\n%%EOF\n")
    assert url.startswith("file://")
    assert (tmp_path / "insp_X.pdf").exists()


def test_reports_pdf_endpoint_in_dev_writes_local(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    # AWS 자격증명 제거 → dev fallback (LocalDevStorage)
    monkeypatch.delenv("AWS_S3_BUCKET", raising=False)
    monkeypatch.delenv("AWS_ACCESS_KEY_ID", raising=False)
    monkeypatch.delenv("AWS_SECRET_ACCESS_KEY", raising=False)
    monkeypatch.setenv("BUTLER_REPORT_DIR", str(tmp_path))
    monkeypatch.setenv("NODE_ENV", "development")

    app = create_app()
    client = TestClient(app)
    r = client.post(
        "/reports/pdf",
        json={
            "inspection_id": "insp_route",
            "property_id": "prop_route",
            "items": [
                {"area": "bath", "checklist_key": "bath.leak", "grade": "B", "marked_defect": True}
            ],
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["pdf_url"].startswith("file://")
    assert body["item_count"] == 1
    assert body["defect_count"] == 1
    assert (tmp_path / "insp_route.pdf").exists()


def test_get_pdf_endpoint_returns_file(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setenv("BUTLER_REPORT_DIR", str(tmp_path))
    monkeypatch.setenv("NODE_ENV", "development")

    # LocalDevStorage 와 동일한 위치(BUTLER_REPORT_DIR/<id>.pdf)에 가짜 PDF 작성.
    # pdf.py(한글 폰트) 의존을 피하기 위해 POST 경로 대신 직접 파일을 만든다.
    fake_pdf = b"%PDF-1.4\n%fake test pdf\n%%EOF\n"
    (tmp_path / "insp_get.pdf").write_bytes(fake_pdf)

    app = create_app()
    client = TestClient(app)
    r = client.get("/reports/pdf/insp_get")
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content.startswith(b"%PDF-")
    assert r.headers.get("cache-control") == "private, no-store"


def test_get_pdf_endpoint_missing_returns_404(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.delenv("AWS_S3_BUCKET", raising=False)
    monkeypatch.delenv("AWS_ACCESS_KEY_ID", raising=False)
    monkeypatch.delenv("AWS_SECRET_ACCESS_KEY", raising=False)
    monkeypatch.setenv("BUTLER_REPORT_DIR", str(tmp_path))
    monkeypatch.setenv("NODE_ENV", "development")

    app = create_app()
    client = TestClient(app)
    r = client.get("/reports/pdf/insp_does_not_exist")
    assert r.status_code == 404
    assert r.json()["detail"] == "PDF 파일을 찾을 수 없습니다"


def test_reports_pdf_endpoint_in_production_without_aws_returns_503(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("AWS_S3_BUCKET", raising=False)
    monkeypatch.delenv("AWS_ACCESS_KEY_ID", raising=False)
    monkeypatch.delenv("AWS_SECRET_ACCESS_KEY", raising=False)
    monkeypatch.setenv("NODE_ENV", "production")

    app = create_app()
    client = TestClient(app)
    r = client.post(
        "/reports/pdf",
        json={
            "inspection_id": "insp_p",
            "property_id": "prop_p",
            "items": [],
        },
    )
    assert r.status_code == 503
