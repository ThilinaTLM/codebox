#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = ["grpcio-tools>=1.60.0"]
# ///
"""Generate Python gRPC stubs from proto files into both sub-projects."""

import re
from pathlib import Path

from grpc_tools import protoc

REPO_ROOT = Path(__file__).resolve().parent.parent
PROTO_DIR = REPO_ROOT / "proto"

OUT_DIRS = [
    REPO_ROOT / "codebox-sandbox/src/codebox_sandbox/grpc/generated",
    REPO_ROOT / "codebox-orchestrator/src/codebox_orchestrator/grpc/generated",
    REPO_ROOT / "codebox-orchestrator/src/codebox_orchestrator/agent/infrastructure/grpc/generated",
]

for out_dir in OUT_DIRS:
    out_dir.mkdir(parents=True, exist_ok=True)

    result = protoc.main([
        "grpc_tools.protoc",
        f"-I{PROTO_DIR}",
        f"--python_out={out_dir}",
        f"--grpc_python_out={out_dir}",
        f"--pyi_out={out_dir}",
        str(PROTO_DIR / "codebox/sandbox/sandbox.proto"),
    ])
    if result != 0:
        raise SystemExit(f"protoc failed with code {result} for {out_dir}")

    # Fix imports: grpc_tools generates absolute imports
    # (e.g. "from codebox.sandbox import sandbox_pb2") but we need relative
    # ones since the generated files live inside the package.
    grpc_file = out_dir / "codebox/sandbox/sandbox_pb2_grpc.py"
    grpc_file.write_text(
        re.sub(
            r"from codebox\.sandbox import",
            "from . import",
            grpc_file.read_text(),
        )
    )

    # Create __init__.py files for the generated package
    for init_dir in [out_dir, out_dir / "codebox", out_dir / "codebox/sandbox"]:
        (init_dir / "__init__.py").touch()

    print(f"Generated stubs in {out_dir}")

print("Proto generation complete.")
