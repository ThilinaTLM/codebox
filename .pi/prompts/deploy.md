---
description: deploy changes to coolify
---

## Steps

1. **Stage**: If there are unstaged changes, run `git add -A`.
2. **Validate**: If there are uncommitted changes, run `make ci` and fix any issues.
3. **Commit**: Commit with a conventional-commit message.
4. **Push**: `git push` to `main`.
5. **Monitor GitHub Actions**: Use `gh run list --limit 3` to find the triggered runs, then `gh run watch <run-id> --exit-status` for the **Build & Deploy** workflow.
6. **Monitor Coolify**: Once the deploy job fires, check deployment status with `coolify app deployments list <uuid>` for whichever apps were deployed.

## Deploy Pipeline Reference

The **Build & Deploy** workflow (`.github/workflows/deploy.yml`) triggers on push to `main`:

1. **changes** job — `dorny/paths-filter` detects which subprojects changed:
   - `codebox-orchestrator/**` → builds orchestrator
   - `codebox-web-ui/**` → builds web-ui
   - `codebox-sandbox/**` or `codebox-agent/**` → builds sandbox
2. **build-\*** jobs — Docker build+push to `ghcr.io/thilinatlm/<image>` (only for changed subprojects).
3. **deploy** job — Curls Coolify deploy API for each changed app.

If only non-app files changed (e.g. `.github/`, docs), all build/deploy jobs are skipped. This is expected.

## Coolify Quick Reference

Apps deployed on Coolify:

| App                  | UUID                       | FQDN                              |
| -------------------- | -------------------------- | --------------------------------- |
| codebox-orchestrator | `ylszwdvoxubo2schhpljxhhj` | `https://api.codebox.tlmtech.dev` |
| codebox-web-ui       | `zqs2gkm2pqo0fgqu77y3qk05` | `https://codebox.tlmtech.dev`     |

Useful commands (no need to read the Coolify SKILL.md):

```bash
# List apps and their status
coolify app list

# Check recent deployments for an app
coolify app deployments list <uuid>

# Follow deployment logs
coolify app deployments logs <uuid> -f

# View app logs
coolify app logs <uuid>

# Manual deploy trigger
coolify deploy uuid <uuid>
```

## CI Workflow Reference

The **CI Checks** workflow (`.github/workflows/ci.yml`) also triggers on push to `main` (and PRs). It runs the `secrets-scan` job. Monitor with `gh run watch`.
