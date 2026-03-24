FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates xz-utils bash git \
    && rm -rf /var/lib/apt/lists/*

# Install devbox
RUN curl -fsSL https://get.jetify.com/devbox | bash -s -- -f

WORKDIR /app

# Copy devbox config and install packages
COPY codebox-docker/devbox.json ./
RUN devbox install

# Install codebox-core
COPY codebox-core/pyproject.toml codebox-core/README.md /tmp/codebox-core/
COPY codebox-core/src/ /tmp/codebox-core/src/
RUN pip install uv && uv pip install --system /tmp/codebox-core && rm -rf /tmp/codebox-core

RUN mkdir -p /workspace /run/tls

EXPOSE 8443

LABEL codebox-sandbox="true"

# Add devbox toolchains to PATH so agent shell commands can use node, go, rg, etc.
ENV PATH="/app/.devbox/nix/profile/default/bin:${PATH}"

CMD ["python", "-m", "codebox_daemon"]
