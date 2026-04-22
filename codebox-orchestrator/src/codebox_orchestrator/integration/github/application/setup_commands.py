"""Sandbox workspace setup commands for GitHub-based triggers.

Supports three workspace modes:

- ``branch_from_issue``: clone repo, create a fresh ``codebox/<n>-<slug>`` branch.
- ``checkout_ref``: clone, checkout ``ref`` detached, create a ``codebox/<shortsha>`` branch.
- ``pinned``: clone and checkout ``branch`` (possibly a ``codebox/*`` branch). Creates a
  ``codebox/pinned-<timestamp>`` branch when the pinned branch is not already under
  ``codebox/*`` so the pre-push hook keeps the user's branch safe.
"""

from __future__ import annotations

import re
import time
import uuid
from typing import Literal

WorkspaceMode = Literal["branch_from_issue", "checkout_ref", "pinned"]


def generate_branch_name(issue_number: int | None, title: str | None) -> str:
    """Generate a ``codebox/*`` branch name from issue context."""
    if issue_number and title:
        slug = re.sub(r"[^a-z0-9]+", "-", title.lower())[:40].strip("-")
        return f"codebox/{issue_number}-{slug}"
    return f"codebox/{uuid.uuid4().hex[:8]}"


def branch_name_from_ref(ref_or_sha: str) -> str:
    """Derive a ``codebox/*`` branch name from a ref or sha."""
    if not ref_or_sha:
        return f"codebox/{uuid.uuid4().hex[:8]}"
    token = ref_or_sha.rsplit("/", 1)[-1]
    token = re.sub(r"[^a-zA-Z0-9_\-\.]", "-", token).strip("-") or "ref"
    return f"codebox/{token[:40]}"


_PRE_PUSH_HOOK = (
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


def build_setup_commands(
    *,
    mode: WorkspaceMode = "branch_from_issue",
    repo: str,
    token: str,
    issue_number: int | None = None,
    issue_title: str | None = None,
    ref: str | None = None,
    branch: str | None = None,
) -> tuple[list[str], str]:
    """Generate setup commands for the selected workspace *mode*.

    Returns ``(commands, branch_used)``. ``branch_used`` is the branch the
    agent's working tree ends up on — always a ``codebox/*`` branch so pushes
    are accepted by the pre-push hook.
    """
    if mode == "branch_from_issue":
        # Explicit branch name wins over issue-derived generation so that manual
        # UI box creation can pre-pick a ``codebox/manual-*`` branch.
        work_branch = branch or generate_branch_name(issue_number, issue_title)
        checkout = [f"cd /workspace && git checkout -b {work_branch}"]
    elif mode == "checkout_ref":
        work_branch = branch_name_from_ref(ref or "")
        ref_to_fetch = ref or "HEAD"
        checkout = [
            f"cd /workspace && git fetch origin {ref_to_fetch}",
            "cd /workspace && git checkout --detach FETCH_HEAD",
            f"cd /workspace && git checkout -b {work_branch}",
        ]
    elif mode == "pinned":
        if not branch:
            raise ValueError("pinned workspace mode requires a branch")
        if branch.startswith("codebox/"):
            work_branch = branch
            checkout = [f"cd /workspace && git checkout {branch}"]
        else:
            # Check out the pinned branch then fork off a codebox/* branch so
            # agent commits stay isolated.
            work_branch = f"codebox/pinned-{int(time.time())}"
            checkout = [
                f"cd /workspace && git checkout {branch}",
                f"cd /workspace && git checkout -b {work_branch}",
            ]
    else:
        raise ValueError(f"unknown workspace mode: {mode}")

    context_lines = [
        f"Repository: {repo}",
        f"Branch: {work_branch}",
    ]
    if issue_number:
        context_lines.append(f"Issue: #{issue_number}")
    context_md = "\n".join(context_lines)

    commands = [
        f'git config --global url."https://x-access-token:{token}@github.com/".insteadOf "https://github.com/"',
        "git config --global --add safe.directory /workspace",
        f"git clone https://github.com/{repo}.git /workspace",
        *checkout,
        'cd /workspace && git config user.email "codebox[bot]@users.noreply.github.com"',
        'cd /workspace && git config user.name "codebox[bot]"',
        f"cat > /workspace/.git/hooks/pre-push << 'HOOKEOF'\n{_PRE_PUSH_HOOK}\nHOOKEOF",
        "chmod +x /workspace/.git/hooks/pre-push",
        f"cat > /app/codebox/context.md << 'CTXEOF'\n{context_md}\nCTXEOF",
    ]
    return commands, work_branch
