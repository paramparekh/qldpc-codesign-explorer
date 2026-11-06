FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    QLDPC_EXPERIMENT_DB=/data/experiments.sqlite3

WORKDIR /service
COPY backend/pyproject.toml ./
COPY backend/app ./app
RUN python -m pip install .

EXPOSE 8000
CMD ["sh", "-c", "exec python -m uvicorn app.main:app --host 0.0.0.0 --port \"${PORT:-8000}\" --workers 1"]
