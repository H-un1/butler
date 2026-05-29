# 버틀러 — AI 백엔드 (ai-python, FastAPI)

FROM python:3.13-slim AS runtime
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates dumb-init \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -m -u 10002 butler

COPY pyproject.toml ./
COPY butler_ai ./butler_ai

RUN pip install --no-cache-dir .

USER butler
ENV PYTHONUNBUFFERED=1 \
    PORT=8000
EXPOSE 8000

ENTRYPOINT ["dumb-init", "--"]
CMD ["uvicorn", "butler_ai.main:app", "--host", "0.0.0.0", "--port", "8000"]
