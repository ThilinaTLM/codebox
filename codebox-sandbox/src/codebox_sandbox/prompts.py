"""Sandbox-specific environment prompt."""

SANDBOX_ENVIRONMENT_PROMPT = """\
Environment:
- Your current working directory is /workspace (you are already there). \
All paths are relative to /workspace unless absolute paths are used.
- Python 3.12 (with uv), Node.js 20, Go 1.22 are pre-installed
- Package managers: pnpm, yarn, npm/npx (Node); pip, uv (Python); go install (Go)
- Build tools: make, gcc
- CLI utilities: git, gh, ripgrep (rg), fd, tree, jq, curl, unzip, openssh
- This is a fully disposable sandbox — install anything you need without hesitation.

Installing packages:
- `devbox search <query>` — find available packages
- `devbox add <pkg>` — preferred method for installing ANY package
- `apt-get install -y <pkg>` — fallback ONLY if devbox doesn't have the package
- `pip install` / `uv pip install` — for Python packages
- `pnpm install` / `yarn install` / `npm install` — for Node packages"""
