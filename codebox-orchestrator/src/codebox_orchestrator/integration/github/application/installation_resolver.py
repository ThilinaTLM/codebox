"""Shared GitHub-installation lookup helper.

Two resolution strategies are available:

- **Fast path** (``strict=True``): match a repo's owner prefix against the
  ``account_login`` of every project-scoped installation. Returns ``None``
  if no installation matches \u2014 callers are expected to surface a
  human-readable error (scheduler, PR-matching paths).
- **Permissive path** (``strict=False``): fast-path first; fall back to the
  legacy O(n\xb7m) scan of each installation's repositories. Used by the
  manual "Create Box" wizard which can legitimately reach repos outside
  the owner's account when an installation is explicitly granted access.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from codebox_orchestrator.integration.github.application.installation_service import (
        GitHubInstallationService,
    )
    from codebox_orchestrator.integration.github.domain.entities import GitHubInstallation

logger = logging.getLogger(__name__)


async def resolve_installation_for_repo(
    service: GitHubInstallationService,
    repo_full_name: str,
    *,
    strict: bool = False,
) -> GitHubInstallation | None:
    """Return the installation that can access *repo_full_name*.

    ``repo_full_name`` must be ``"owner/name"``. ``strict=True`` disables
    the legacy per-installation ``sync_repos`` scan and only returns a
    match when the repo's owner prefix equals the installation's
    ``account_login`` (case-insensitive). ``strict=False`` adds the scan
    as a last resort.
    """
    if "/" not in repo_full_name:
        return None
    owner = repo_full_name.split("/", 1)[0]
    installations = await service.list_installations()

    # Fast path: owner-match.
    owner_match = next(
        (inst for inst in installations if inst.account_login.lower() == owner.lower()),
        None,
    )
    if owner_match is not None:
        return owner_match

    if strict:
        return None

    # Slow path: scan each installation's repo list. Kept for the edge
    # case where an installation has been granted access to a repo in a
    # different account.
    for inst in installations:
        try:
            repos = await service.sync_repos(inst.installation_id)
        except Exception:
            logger.warning("Failed to check repos for installation %d", inst.installation_id)
            continue
        if any(r.get("full_name") == repo_full_name for r in repos):
            return inst
    return None
