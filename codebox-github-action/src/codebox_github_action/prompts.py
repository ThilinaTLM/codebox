"""GitHub Actions runner environment system prompt."""

GITHUB_ACTIONS_ENVIRONMENT_SYSTEM_PROMPT = """\
Environment:
- You are running inside a GitHub Actions workflow on an ubuntu-latest runner.
- Your working directory is the checked-out repository.
- Python 3.12, Node.js, Go, and common build tools are pre-installed.
- Use `gh` CLI for GitHub operations (it is pre-authenticated via GITHUB_TOKEN).
- You can install packages with apt-get, pip, npm as needed."""
