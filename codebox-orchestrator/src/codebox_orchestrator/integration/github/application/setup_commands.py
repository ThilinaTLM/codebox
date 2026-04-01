"""Standalone utility for generating GitHub sandbox setup commands."""

from __future__ import annotations


def build_setup_commands(
    repo: str,
    branch: str,
    token: str,
    issue_number: int | None = None,
) -> list[str]:
    """Generate shell commands to set up the sandbox workspace for a GitHub task."""
    context_lines = [
        f"Repository: {repo}",
        f"Branch: {branch}",
    ]
    if issue_number:
        context_lines.append(f"Issue: #{issue_number}")
    context_md = "\n".join(context_lines)

    pre_push_hook = (
        "#!/bin/bash\n"
        "while read local_ref local_sha remote_ref remote_sha; do\n"
        "    branch=$(echo \"$remote_ref\" | sed 's|refs/heads/||')\n"
        '    if [[ ! "$branch" =~ ^codebox/ ]]; then\n'
        '        echo "ERROR: Push rejected. Can only push to codebox/* branches."\n'
        '        echo "Attempted to push to: $branch"\n'
        "        exit 1\n"
        "    fi\n"
        "done\n"
        "exit 0"
    )

    return [
        # Configure git credentials globally so clone uses the token
        f'git config --global url."https://x-access-token:{token}@github.com/".insteadOf "https://github.com/"',
        # Mark /workspace as safe (mounted volume may have different ownership)
        "git config --global --add safe.directory /workspace",
        # Clone repo into /workspace
        f"git clone https://github.com/{repo}.git /workspace",
        # Create and check out the working branch
        f"cd /workspace && git checkout -b {branch}",
        # Configure git identity
        'cd /workspace && git config user.email "codebox[bot]@users.noreply.github.com"',
        'cd /workspace && git config user.name "codebox[bot]"',
        # Install pre-push safety hook
        f"cat > /workspace/.git/hooks/pre-push << 'HOOKEOF'\n{pre_push_hook}\nHOOKEOF",
        "chmod +x /workspace/.git/hooks/pre-push",
        # Write context file
        f"cat > /app/codebox/context.md << 'CTXEOF'\n{context_md}\nCTXEOF",
    ]
