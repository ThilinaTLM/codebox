---
description: commit all git changes
---

1. Stage all changes: `git add -A`
2. Run `make ci` and fix any issues. This runs: `ruff format --check`, `ruff check`, `ty check`, `detect-secrets scan --baseline`.
3. Commit with a conventional-commit message (e.g. `feat:`, `fix:`, `ci:`, `chore:`, `refactor:`, `docs:`).
