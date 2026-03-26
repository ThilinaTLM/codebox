#!/usr/bin/env bash
# Generate Python gRPC stubs from proto files into both sub-projects.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROTO_DIR="$REPO_ROOT/proto"

CORE_OUT="$REPO_ROOT/codebox-core/src/codebox_daemon/grpc/generated"
ORCH_OUT="$REPO_ROOT/codebox-orchestrator/src/codebox_orchestrator/grpc/generated"

mkdir -p "$CORE_OUT" "$ORCH_OUT"

# Use the orchestrator venv's grpc_tools (it has grpcio-tools installed)
PYTHON="${REPO_ROOT}/codebox-orchestrator/.venv/bin/python"

for OUT_DIR in "$CORE_OUT" "$ORCH_OUT"; do
    "$PYTHON" -m grpc_tools.protoc \
        -I"$PROTO_DIR" \
        --python_out="$OUT_DIR" \
        --grpc_python_out="$OUT_DIR" \
        --pyi_out="$OUT_DIR" \
        "$PROTO_DIR/codebox/sandbox/sandbox.proto"

    # Fix imports in generated files: grpc_tools generates absolute imports
    # (e.g. "from codebox.sandbox import sandbox_pb2") but we need relative ones
    # since the generated files live inside the package.
    sed -i 's/from codebox\.sandbox import/from . import/' "$OUT_DIR/codebox/sandbox/sandbox_pb2_grpc.py"

    # Create __init__.py files for the generated package
    touch "$OUT_DIR/__init__.py"
    touch "$OUT_DIR/codebox/__init__.py"
    touch "$OUT_DIR/codebox/sandbox/__init__.py"

    echo "Generated stubs in $OUT_DIR"
done

echo "Proto generation complete."
