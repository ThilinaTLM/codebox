#!/usr/bin/env bash
# Source full devbox shell environment (GOPATH, GOROOT, NODE_PATH, etc.)
# so all child processes (agent shell commands) inherit it.
eval "$(devbox shellenv --config /app --init-hook 2>/dev/null)"
exec "$@"
