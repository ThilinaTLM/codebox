#!/usr/bin/env bash
set -euo pipefail

# Build the codebox-sandbox Docker image.
# Must be run from the monorepo root (or the script will cd there automatically).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_ROOT"

# Verify expected files exist
if [[ ! -f codebox-sandbox/Dockerfile ]]; then
    echo "Error: codebox-sandbox/Dockerfile not found."
    echo "Are you in the right repository?"
    exit 1
fi

IMAGE_NAME="codebox-sandbox:latest"
EXTRA_ARGS=()

if [[ "${1:-}" == "--no-cache" ]]; then
    EXTRA_ARGS+=(--no-cache)
    echo "Building $IMAGE_NAME (no cache)..."
else
    echo "Building $IMAGE_NAME..."
fi

docker build \
    -t "$IMAGE_NAME" \
    -f codebox-sandbox/Dockerfile \
    "${EXTRA_ARGS[@]}" \
    .

echo ""
echo "Done! Image: $IMAGE_NAME"
echo "Verify: docker run --rm $IMAGE_NAME gh --version"
