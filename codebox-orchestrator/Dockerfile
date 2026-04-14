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

# Docker socket access: create the docker group with the same GID as the host
# so the mounted /var/run/docker.sock is accessible without --group-add.
# Override at build time with --build-arg DOCKER_GID=<host-gid> if different.
ARG DOCKER_GID=988
RUN groupadd -g "${DOCKER_GID}" -f docker && usermod -aG docker codebox

USER codebox

EXPOSE 9090 50051

CMD ["python", "-m", "codebox_orchestrator"]
