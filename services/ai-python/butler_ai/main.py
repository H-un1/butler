"""FastAPI — M2 ETL/AMI, M4 결함분석/PDF, M5 AI 보조(전부 mock) 추가."""
from fastapi import FastAPI

from .chatbot.routes import router as chatbot_router
from .config import load_settings
from .etl.routes import router as etl_router
from .ocr.routes import router as ocr_router
from .precedents.routes import router as precedents_router
from .reports.routes import router as reports_router
from .settlement.routes import router as settlement_router


def create_app() -> FastAPI:
    settings = load_settings()
    app = FastAPI(
        title="버틀러 AI Backend",
        version="0.1.0",
        description="버틀러 Phase 1 — OCR · AMI · 정산 · ETL",
    )

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {
            "status": "ok",
            "service": "butler/ai-python",
            "env": settings.NODE_ENV,
        }

    app.include_router(etl_router)
    app.include_router(reports_router)
    app.include_router(settlement_router)
    # M5 AI 보조 — 전부 mock (외부 LLM/OCR/검색 호출 없음)
    app.include_router(chatbot_router)
    app.include_router(ocr_router)
    app.include_router(precedents_router)
    return app


app = create_app()
