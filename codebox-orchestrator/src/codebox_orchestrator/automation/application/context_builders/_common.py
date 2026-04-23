"""Shared helpers for GitHub-event context builders."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any


def now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def project_base_variables(trigger_kind: str) -> dict[str, str]:
    return {
        "PROJECT_SLUG": "",
        "PROJECT_NAME": "",
        "TRIGGER_KIND": trigger_kind,
        "TRIGGERED_AT": now_iso(),
    }


def repo_variables(payload: dict[str, Any]) -> dict[str, str]:
    repo = payload.get("repository") or {}
    return {
        "REPO_URL": str(repo.get("html_url") or ""),
        "REPO_FULL_NAME": str(repo.get("full_name") or ""),
        "REPO_DEFAULT_BRANCH": str(repo.get("default_branch") or ""),
    }


def _iter_label_names(entity: dict[str, Any]) -> list[str]:
    """Return label names from an issue/PR entity, tolerating both shapes.

    Real GitHub webhook payloads use ``[{"name": "bug", ...}, ...]``. The
    dry-run surface and some hand-authored payloads use the shorthand
    ``["bug", ...]``. Malformed entries (``None``, ints, dicts without a
    string ``name``) are skipped rather than raising so a single bad label
    cannot 500 the whole dispatch.
    """
    names: list[str] = []
    for lbl in entity.get("labels") or []:
        if isinstance(lbl, dict):
            name = lbl.get("name")
            if isinstance(name, str) and name:
                names.append(name)
        elif isinstance(lbl, str) and lbl:
            names.append(lbl)
    return names


def labels_list(issue_or_pr: dict[str, Any]) -> list[str]:
    # Lowercased for case-insensitive trigger matching.
    return [name.lower() for name in _iter_label_names(issue_or_pr)]


def issue_variables(issue: dict[str, Any], action: str) -> dict[str, str]:
    return _entity_variables(issue, action, prefix="ISSUE")


def pr_variables(pr: dict[str, Any], action: str) -> dict[str, str]:
    """Return the ``PR_*`` alias set for a pull_request payload.

    Mirrors :func:`issue_variables` but with ``PR_*`` keys. Keeps the UI's
    prompt-variable catalog honest for PR-family triggers — see
    automation-fix-02-variable-catalog.md.
    """
    return _entity_variables(pr, action, prefix="PR")


def _entity_variables(entity: dict[str, Any], action: str, *, prefix: str) -> dict[str, str]:
    body = str(entity.get("body") or "")
    title = str(entity.get("title") or "")
    labels = _iter_label_names(entity)  # original case preserved for template text
    return {
        f"{prefix}_URL": str(entity.get("html_url") or ""),
        f"{prefix}_NUMBER": str(entity.get("number") or ""),
        f"{prefix}_TITLE": title,
        f"{prefix}_BODY": body,
        f"{prefix}_LABELS": ",".join(labels),
        f"{prefix}_AUTHOR": str((entity.get("user") or {}).get("login") or ""),
        f"{prefix}_STATE": str(entity.get("state") or ""),
        f"{prefix}_ACTION": action,
        f"{prefix}_CONTENT": _build_content_block(title, body),
    }


def comment_variables(
    comment: dict[str, Any], action: str, *, prefix: str = "COMMENT"
) -> dict[str, str]:
    """Return a ``{PREFIX}_*`` set for an issue- or review-comment payload.

    Parameterised by ``prefix`` so call sites can emit both ``COMMENT_*`` and
    ``REVIEW_COMMENT_*`` copies without duplicating keys.
    """
    return {
        f"{prefix}_URL": str(comment.get("html_url") or ""),
        f"{prefix}_BODY": str(comment.get("body") or ""),
        f"{prefix}_AUTHOR": str((comment.get("user") or {}).get("login") or ""),
        f"{prefix}_ACTION": action,
        f"{prefix}_PATH": str(comment.get("path") or ""),
    }


def _build_content_block(title: str, body: str) -> str:
    if not title and not body:
        return ""
    lines = [f"# {title}"]
    if body:
        lines.append("")
        lines.append(body)
    return "\n".join(lines)


def format_comments(comments: list[dict[str, Any]]) -> str:
    if not comments:
        return ""
    out: list[str] = []
    for c in comments:
        user = (
            c.get("user", "")
            if isinstance(c.get("user"), str)
            else str((c.get("user") or {}).get("login", ""))
        )
        out.append(f"**{user}** ({c.get('created_at', '')}):")
        out.append(str(c.get("body") or ""))
        out.append("")
    return "\n".join(out).rstrip()


def format_review_comments(comments: list[dict[str, Any]]) -> str:
    if not comments:
        return ""
    out: list[str] = []
    for c in comments:
        user = (
            c.get("user", "")
            if isinstance(c.get("user"), str)
            else str((c.get("user") or {}).get("login", ""))
        )
        path = c.get("path") or ""
        hdr = f"**{user}**"
        if path:
            hdr += f" on `{path}`"
        out.append(f"{hdr} ({c.get('created_at', '')}):")
        out.append(str(c.get("body") or ""))
        out.append("")
    return "\n".join(out).rstrip()


def installation_id(payload: dict[str, Any]) -> int | None:
    installation = payload.get("installation") or {}
    raw = installation.get("id")
    if raw is None:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None
