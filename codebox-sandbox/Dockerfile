FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates xz-utils bash git \
    && rm -rf /var/lib/apt/lists/*

# Install Nix in single-user / no-daemon mode (no systemd in containers)
# then install devbox
RUN curl -fsSL https://install.determinate.systems/nix | \
    bash -s -- install linux --init none --no-confirm \
    && . /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh \
    && curl -fsSL https://get.jetify.com/devbox | bash -s -- -f

WORKDIR /app

# Copy devbox config and install packages
COPY codebox-sandbox/devbox.json ./
ENV PATH="/nix/var/nix/profiles/default/bin:${PATH}"
ENV DEVBOX_PROJECT_DIR="/app"
RUN devbox install

# Install codebox-core
COPY codebox-core/pyproject.toml codebox-core/README.md /tmp/codebox-core/
COPY codebox-core/src/ /tmp/codebox-core/src/
RUN pip install uv && uv pip install --system /tmp/codebox-core && rm -rf /tmp/codebox-core

RUN mkdir -p /workspace

LABEL codebox-sandbox="true"

# Entrypoint sources full devbox shell environment (GOPATH, GOROOT, NODE_PATH, etc.)
# so the daemon and all agent subprocess commands inherit it.
COPY codebox-sandbox/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ENTRYPOINT ["bash", "/app/entrypoint.sh"]
CMD ["python", "-m", "codebox_daemon"]
