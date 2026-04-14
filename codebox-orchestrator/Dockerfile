FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY pyproject.toml README.md ./
COPY src/ ./src/

RUN pip install uv && uv pip install --system .

COPY alembic.ini ./
COPY alembic/ ./alembic/

EXPOSE 9090

CMD ["python", "-m", "codebox_orchestrator"]
