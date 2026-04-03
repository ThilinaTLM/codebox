#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = ["rich>=13.0"]
# ///
"""Build the codebox-sandbox Docker image.

Supports both Docker and Podman (auto-detected, or override with CONTAINER_ENGINE).
"""

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

from rich.console import Console
from rich.panel import Panel

REPO_ROOT = Path(__file__).resolve().parent.parent
IMAGE_NAME = "codebox-sandbox:latest"

console = Console()


def detect_engine() -> str:
    """Detect the container engine to use."""
    env_engine = os.environ.get("CONTAINER_ENGINE")
    if env_engine:
        return env_engine

    if shutil.which("docker"):
        return "docker"
    if shutil.which("podman"):
        return "podman"

    console.print(
        Panel(
            "[bold]Neither docker nor podman found in PATH.[/]\n\n"
            "Install Docker or Podman, or set [cyan]CONTAINER_ENGINE[/] "
            "to the engine binary.",
            title="Error",
            border_style="red",
        )
    )
    sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the codebox-sandbox Docker image.")
    parser.add_argument("--no-cache", action="store_true", help="Build without using cache")
    args = parser.parse_args()

    os.chdir(REPO_ROOT)

    engine = detect_engine()
    console.print(f"Using container engine: [bold cyan]{engine}[/]")

    dockerfile = REPO_ROOT / "codebox-sandbox" / "Dockerfile"
    if not dockerfile.exists():
        console.print(
            Panel(
                f"[bold]codebox-sandbox/Dockerfile not found.[/]\n\n"
                f"Are you in the right repository?\n"
                f"Expected: [dim]{dockerfile}[/]",
                title="Error",
                border_style="red",
            )
        )
        sys.exit(1)

    cmd = [engine, "build", "-t", IMAGE_NAME, "-f", "codebox-sandbox/Dockerfile"]

    # Podman's default seccomp profile blocks sethostname(), which the Nix
    # installer invokes during "devbox install". Grant SYS_ADMIN only for the
    # build so that step succeeds (same permissions Docker grants by default).
    if engine == "podman":
        cmd.append("--cap-add=SYS_ADMIN")

    if args.no_cache:
        cmd.append("--no-cache")
        console.print(f"Building [bold]{IMAGE_NAME}[/] (no cache)...")
    else:
        console.print(f"Building [bold]{IMAGE_NAME}[/]...")

    cmd.append(".")

    try:
        subprocess.run(cmd, check=True)  # noqa: S603
    except subprocess.CalledProcessError as exc:
        console.print(
            Panel(
                f"[bold]Build failed with exit code {exc.returncode}.[/]\n\n"
                "Check the output above for details.",
                title="Build Failed",
                border_style="red",
            )
        )
        sys.exit(exc.returncode)

    verify_cmd = f"{engine} run --rm {IMAGE_NAME} gh --version"
    console.print()
    console.print(
        Panel(
            f"[bold green]Done![/] Image: [bold cyan]{IMAGE_NAME}[/]\n\n"
            f"Verify: [dim]{verify_cmd}[/]",
            border_style="green",
        )
    )


if __name__ == "__main__":
    main()
