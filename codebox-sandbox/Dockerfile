FROM python:3.12-slim

# Keep /var/lib/apt/lists/ populated so agents can `apt install <pkg>` at
# runtime without a mandatory `apt-get update` round-trip. Costs ~40MB.
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates xz-utils bash git

# ── Supply-chain hardening: pin installer versions & verify checksums ──

# Nix: single-user / no-daemon mode (no systemd in containers)
ARG NIX_INSTALLER_VERSION=v3.17.3
ARG NIX_INSTALLER_SHA256=1de1a9ddba23464d037aea82a16ca6cc800e1b06eda67c8007560ab6c56afdb7
RUN curl -fsSL -o /tmp/nix-installer.sh \
        "https://install.determinate.systems/nix/tag/${NIX_INSTALLER_VERSION}" \
    && echo "${NIX_INSTALLER_SHA256}  /tmp/nix-installer.sh" | sha256sum -c - \
    && bash /tmp/nix-installer.sh install linux --init none --no-confirm \
    && rm /tmp/nix-installer.sh

# Devbox: install a pinned release from GitHub
ARG DEVBOX_VERSION=0.17.1
ARG TARGETARCH
RUN set -e; \
    case "${TARGETARCH:-amd64}" in \
        amd64) _arch=amd64 ;; \
        arm64) _arch=arm64 ;; \
        *)     echo "Unsupported arch: ${TARGETARCH}"; exit 1 ;; \
    esac; \
    curl -fsSL -o /tmp/devbox.tar.gz \
        "https://github.com/jetify-com/devbox/releases/download/${DEVBOX_VERSION}/devbox_${DEVBOX_VERSION}_linux_${_arch}.tar.gz" \
    && tar -xzf /tmp/devbox.tar.gz -C /usr/local/bin devbox \
    && chmod +x /usr/local/bin/devbox \
    && rm /tmp/devbox.tar.gz

ENV PATH="/nix/var/nix/profiles/default/bin:${PATH}"

WORKDIR /app

# Copy devbox config + lock (lock is committed for reproducible nixpkgs pin)
COPY codebox-sandbox/devbox.json codebox-sandbox/devbox.lock ./
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

# Install codebox-tunnel (dependency of codebox-sandbox)
COPY codebox-tunnel/pyproject.toml /tmp/codebox-tunnel/
COPY codebox-tunnel/src/ /tmp/codebox-tunnel/src/

# Install codebox-sandbox (container runner)
COPY codebox-sandbox/pyproject.toml codebox-sandbox/uv.lock codebox-sandbox/README.md /tmp/codebox-sandbox/
COPY codebox-sandbox/src/ /tmp/codebox-sandbox/src/

RUN pip install uv && uv pip install --system /tmp/codebox-agent /tmp/codebox-tunnel /tmp/codebox-sandbox \
    && rm -rf /tmp/codebox-agent /tmp/codebox-tunnel /tmp/codebox-sandbox

RUN mkdir -p /workspace /app/codebox

LABEL codebox-sandbox="true"

# Entrypoint sources full devbox shell environment (GOPATH, GOROOT, NODE_PATH, etc.)
# so the daemon and all agent subprocess commands inherit it.
COPY codebox-sandbox/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ENTRYPOINT ["bash", "/app/entrypoint.sh"]
# Use an absolute path to the base-image Python so the daemon always runs
# against the interpreter where codebox_sandbox (and codebox_agent / codebox_tunnel)
# were installed. The entrypoint sources devbox's nix shellenv, which prepends
# a nix-store python3 to PATH (pulled in transitively by packages like
# postgresql / pandoc / imagemagick) and would otherwise shadow this one.
# Agent-spawned subprocesses still see the full devbox toolchain via PATH.
CMD ["/usr/local/bin/python", "-m", "codebox_sandbox"]
