# AGENTS.md

This file contains high-signal guidance for coding agents working in this repository. Prefer `README.md` and the codebase itself for discoverable architecture and setup details.

## Working Rules

- This is a monorepo. Check the local `pyproject.toml`, package manifest, and surrounding code before making changes in any subproject.
- Match existing patterns and libraries; do not introduce new dependencies or conventions unless the codebase already uses them.
- Treat `Box` as the primary domain term. It replaced the older task/sandbox naming and should stay consistent in new code.
- Be careful with generated gRPC/protobuf files. Do not hand-edit generated outputs unless the task explicitly requires regeneration.

## Validation

- Use the repo Makefile and existing project scripts for validation instead of inventing ad hoc commands.
- Default validation targets are `make check` for local verification and `make ci` for the full formatting/lint/typecheck path.
- Ruff and ty configuration live at the repo root.

## Practical Notes

- Python subprojects manage their own environments and dependencies.
- The orchestrator depends on `OPENROUTER_API_KEY` and `OPENROUTER_MODEL`; avoid changing config or env handling unless the task requires it.
