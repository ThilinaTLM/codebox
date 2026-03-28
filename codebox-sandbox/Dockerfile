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
RUN devbox install

# Create a wrapper so `devbox` works from any directory (agent runs from /workspace).
# -c is a per-subcommand flag, so inject it after the subcommand name.
# Commands like search/version/help don't need or support -c.
RUN mv /usr/local/bin/devbox /usr/local/bin/devbox-real \
    && printf '#!/bin/bash\ncase "$1" in\n  add|rm|install|shell|shellenv|run|update|list|info|services|generate)\n    cmd="$1"; shift; exec devbox-real "$cmd" -c /app "$@" ;;\n  *)\n    exec devbox-real "$@" ;;\nesac\n' > /usr/local/bin/devbox \
    && chmod +x /usr/local/bin/devbox

# Install codebox-agent (foundation library)
COPY codebox-agent/pyproject.toml codebox-agent/uv.lock codebox-agent/README.md /tmp/codebox-agent/
COPY codebox-agent/src/ /tmp/codebox-agent/src/

# Install codebox-sandbox (container runner)
COPY codebox-sandbox/pyproject.toml codebox-sandbox/uv.lock codebox-sandbox/README.md /tmp/codebox-sandbox/
COPY codebox-sandbox/src/ /tmp/codebox-sandbox/src/

RUN pip install uv && uv pip install --system /tmp/codebox-agent /tmp/codebox-sandbox \
    && rm -rf /tmp/codebox-agent /tmp/codebox-sandbox

RUN mkdir -p /workspace /app/codebox

LABEL codebox-sandbox="true"

# Entrypoint sources full devbox shell environment (GOPATH, GOROOT, NODE_PATH, etc.)
# so the daemon and all agent subprocess commands inherit it.
COPY codebox-sandbox/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ENTRYPOINT ["bash", "/app/entrypoint.sh"]
CMD ["python", "-m", "codebox_sandbox"]
