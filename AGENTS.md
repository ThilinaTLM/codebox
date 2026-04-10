# AGENTS.md

Prefer `README.md` and the codebase for setup and architecture details.

## Rules

- This is a monorepo. Use the local subproject manifest, lockfile, and tooling before editing. Python packages use per-project `uv` environments; `codebox-web-ui` uses `pnpm`.
- Use `Box` as the canonical domain term. Legacy task/sandbox wording still exists in older surfaces; do not introduce new uses.
- Do not hand-edit generated files. This includes `**/grpc/generated/**` and `codebox-web-ui/src/routeTree.gen.ts`.
- Regenerate protobuf/gRPC stubs with `scripts/generate_proto.py` when proto changes are required.
- Match existing patterns and dependencies. Do not introduce new libraries or conventions unless the repo already uses them.
- LLM provider/env plumbing is shared across orchestrator, sandbox, and the GitHub Action. Avoid changing it unless the task requires it.

## Validation

- Use existing repo commands instead of ad hoc validation.
- Use `make check` for repo-wide Python lint + typecheck.
- Use `make ci` for the full Python formatting/lint/typecheck path.
- `make check` and `make ci` do not validate `codebox-web-ui`; use its `pnpm` scripts (`lint`, `typecheck`, `test`) when editing the frontend.
