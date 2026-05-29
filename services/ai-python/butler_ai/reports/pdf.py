"""PDF 생성 — reportlab + Pretendard 폰트 임베드로 한글 출력.

기존 표준 라이브러리 PDF 1.4 빌더는 Helvetica만 사용해 한글이 `?`로 깨졌다.
이 모듈은 reportlab Canvas로 Pretendard TTF/OTF를 임베드해 한글이 정상 표시되게 한다.

호출자 계약(routes.py)은 유지:
    render_text_pages(req) -> str
    write_minimal_pdf(text, output_path) -> Path
"""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from threading import Lock

from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas

from .models import ReportRequest


FONT_DIR = Path(__file__).resolve().parent / "fonts"
# reportlab.pdfbase.ttfonts.TTFont 은 TrueType outlines 전용 — Pretendard OTF(PostScript)는
# 미지원이라 release zip의 static/alternative TTF 빌드를 사용한다.
FONT_REGULAR_PATH = FONT_DIR / "Pretendard-Regular.ttf"
FONT_BOLD_PATH = FONT_DIR / "Pretendard-Bold.ttf"

FONT_REGULAR = "Pretendard"
FONT_BOLD = "Pretendard-Bold"

_FONT_LOCK = Lock()
_FONTS_REGISTERED = False


def _register_fonts() -> None:
    """Pretendard TTF/OTF를 reportlab에 등록. 이미 등록되어 있으면 skip.

    폰트 파일이 없거나 등록 실패 시 명확한 예외 메시지로 안내한다.
    """
    global _FONTS_REGISTERED
    with _FONT_LOCK:
        if _FONTS_REGISTERED:
            return
        for label, path in (
            (FONT_REGULAR, FONT_REGULAR_PATH),
            (FONT_BOLD, FONT_BOLD_PATH),
        ):
            if not path.exists():
                raise RuntimeError(
                    f"Pretendard 폰트 파일이 없습니다: {path}. "
                    "services/ai-python/butler_ai/reports/fonts/ 에 "
                    "Pretendard-Regular.ttf + Pretendard-Bold.ttf 를 배치하세요."
                )
            try:
                pdfmetrics.registerFont(TTFont(label, str(path)))
            except Exception as exc:  # noqa: BLE001 — reportlab 내부 예외 다양
                raise RuntimeError(
                    f"Pretendard 폰트 등록 실패({label}, {path}): {exc}"
                ) from exc
        _FONTS_REGISTERED = True


def render_text_pages(req: ReportRequest) -> str:
    """리포트 본문(텍스트). 라우트에서 호출되는 기존 인터페이스 유지."""
    lines: list[str] = []
    lines.append("버틀러 점검 리포트")
    lines.append(f"Inspection ID: {req.inspection_id}")
    lines.append(f"Property ID:   {req.property_id}")
    lines.append(f"Generated at:  {datetime.now(timezone.utc).isoformat()}")
    lines.append(f"Items:         총 {len(req.items)}개")
    defects = sum(1 for it in req.items if it.marked_defect)
    lines.append(f"Marked defect: {defects}개")
    lines.append("")
    lines.append("--- 점검 항목 ---")
    for idx, it in enumerate(req.items, start=1):
        lines.append(
            f"{idx:02d}. [{it.grade}] {it.area} / {it.checklist_key}"
            + (" ※ 결함" if it.marked_defect else "")
        )
        if it.note:
            lines.append(f"    note: {it.note}")
    return "\n".join(lines)


def _wrap_line(canvas: Canvas, text: str, font_name: str, font_size: float, max_width: float) -> list[str]:
    """주어진 폰트/크기로 max_width(pt)에 맞춰 줄바꿈한 라인 리스트 반환."""
    if not text:
        return [""]
    out: list[str] = []
    cur = ""
    for ch in text:
        candidate = cur + ch
        width = canvas.stringWidth(candidate, font_name, font_size)
        if width <= max_width:
            cur = candidate
        else:
            if cur:
                out.append(cur)
            cur = ch
    if cur:
        out.append(cur)
    return out or [""]


def write_minimal_pdf(text: str, output_path: Path) -> Path:
    """reportlab + Pretendard 임베드 PDF 생성.

    첫 줄("버틀러 점검 리포트")은 Bold 20pt, 그 다음 메타 5줄(Regular 11pt),
    빈 줄 뒤 헤딩("--- 점검 항목 ---") Bold 14pt, 나머지 항목 Regular 11pt.
    A4, 좌우 여백 50pt. 페이지가 모자라면 새 페이지로 넘김.
    """
    _register_fonts()

    output_path.parent.mkdir(parents=True, exist_ok=True)

    page_w, page_h = A4
    margin_x = 50.0
    margin_top = 50.0
    margin_bottom = 50.0
    max_text_width = page_w - margin_x * 2

    canvas = Canvas(str(output_path), pagesize=A4)
    canvas.setTitle("Butler Inspection Report")

    # 입력 텍스트를 라인 단위로 받아 폰트/크기를 라벨링한 (text, font, size) 시퀀스로 변환
    raw_lines = text.split("\n")
    styled: list[tuple[str, str, float]] = []
    for i, line in enumerate(raw_lines):
        stripped = line.strip()
        if i == 0:
            styled.append((line, FONT_BOLD, 20.0))
        elif stripped.startswith("---") and stripped.endswith("---"):
            styled.append((line, FONT_BOLD, 14.0))
        else:
            styled.append((line, FONT_REGULAR, 11.0))

    y = page_h - margin_top
    for raw_text, font_name, font_size in styled:
        # 폰트별 줄 간격: 헤딩 폰트는 살짝 더 넉넉히
        line_height = font_size * 1.4
        wrapped = _wrap_line(canvas, raw_text, font_name, font_size, max_text_width)
        for chunk in wrapped:
            if y - line_height < margin_bottom:
                canvas.showPage()
                y = page_h - margin_top
            canvas.setFont(font_name, font_size)
            canvas.drawString(margin_x, y - font_size, chunk)
            y -= line_height

    canvas.save()
    return output_path
