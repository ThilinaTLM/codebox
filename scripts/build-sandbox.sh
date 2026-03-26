#!/usr/bin/env bash
set -euo pipefail

# Build the codebox-sandbox Docker image.
# Must be run from the monorepo root (or the script will cd there automatically).
# Supports both Docker and Podman (auto-detected, or override with CONTAINER_ENGINE).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_ROOT"

# Detect container engine: honour CONTAINER_ENGINE env var, else prefer docker, fall back to podman
if [[ -n "${CONTAINER_ENGINE:-}" ]]; then
    ENGINE="$CONTAINER_ENGINE"
elif command -v docker &>/dev/null; then
    ENGINE="docker"
elif command -v podman &>/dev/null; then
    ENGINE="podman"
else
    echo "Error: neither docker nor podman found in PATH."
    echo "Install Docker or Podman, or set CONTAINER_ENGINE to the engine binary."
    exit 1
fi

echo "Using container engine: $ENGINE"

# Verify expected files exist
if [[ ! -f codebox-sandbox/Dockerfile ]]; then
    echo "Error: codebox-sandbox/Dockerfile not found."
    echo "Are you in the right repository?"
    exit 1
fi

IMAGE_NAME="codebox-sandbox:latest"
EXTRA_ARGS=()

# Podman's default seccomp profile blocks sethostname(), which the Nix
# installer invokes during "devbox install".  Grant SYS_ADMIN only for
# the build so that step succeeds (same permissions Docker grants by default).
if [[ "$ENGINE" == "podman" ]]; then
    EXTRA_ARGS+=(--cap-add=SYS_ADMIN)
fi

if [[ "${1:-}" == "--no-cache" ]]; then
    EXTRA_ARGS+=(--no-cache)
    echo "Building $IMAGE_NAME (no cache)..."
else
    echo "Building $IMAGE_NAME..."
fi

$ENGINE build \
    -t "$IMAGE_NAME" \
    -f codebox-sandbox/Dockerfile \
    "${EXTRA_ARGS[@]}" \
    .

echo ""
echo "Done! Image: $IMAGE_NAME"
echo "Verify: $ENGINE run --rm $IMAGE_NAME gh --version"
