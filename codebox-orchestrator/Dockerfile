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

# Create non-root user
RUN groupadd -r codebox && useradd -r -g codebox -d /app -s /sbin/nologin codebox

# Create data directory for runtime files
RUN mkdir -p /app/data && chown -R codebox:codebox /app/data

# Docker socket access: add user to a docker group so the socket is accessible.
# The actual GID is mapped at runtime via docker run --group-add.
RUN groupadd -f docker && usermod -aG docker codebox

USER codebox

EXPOSE 9090 50051

CMD ["python", "-m", "codebox_orchestrator"]
