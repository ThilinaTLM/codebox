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
# detect-secrets rewrites the baseline with a fresh `generated_at` on every
# run, which would leave the file perpetually dirty. Strip it afterwards so
# the baseline only changes when real findings change.
secrets:
	detect-secrets scan --baseline .secrets.baseline
	@python3 -c "import json; f='.secrets.baseline'; d=json.load(open(f)); d.pop('generated_at', None); open(f,'w').write(json.dumps(d, indent=2) + '\n')"

# Full CI check (format + lint + typecheck + secrets)
ci: format-check lint typecheck secrets

# Generate the orchestrator OpenAPI snapshot
openapi:
	cd codebox-orchestrator && uv run python scripts/dump_openapi.py
