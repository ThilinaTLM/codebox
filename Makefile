.PHONY: lint fix format format-check typecheck check ci

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

# Full CI check (format + lint + typecheck)
ci: format-check lint typecheck
