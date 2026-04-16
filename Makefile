.PHONY: lint fix format format-check typecheck check ci secrets openapi

# Lint without fixing
lint:
	ruff check .

# Auto-fix lint issues
fix:
	ruff check --fix .

# Format code
format:
	ruff format .

# Format check (CI mode — no writes)
format-check:
	ruff format --check .

# Type check
typecheck:
	ty check .

# Quick check (lint + typecheck)
check: lint typecheck

# Scan for accidentally committed secrets
secrets:
	detect-secrets scan --baseline .secrets.baseline

# Full CI check (format + lint + typecheck + secrets)
ci: format-check lint typecheck secrets

# Generate the orchestrator OpenAPI snapshot
openapi:
	cd codebox-orchestrator && uv run python scripts/dump_openapi.py
