"""Regression tests for automation context-builder label parsing."""

from __future__ import annotations

from codebox_orchestrator.automation.application.context_builders._common import (
    issue_variables,
    labels_list,
    pr_variables,
)


def test_issue_variables_accepts_github_label_objects():
    out = issue_variables({"labels": [{"name": "bug"}, {"name": "help wanted"}]}, "opened")
    assert out["ISSUE_LABELS"] == "bug,help wanted"


def test_issue_variables_accepts_string_labels():
    # Regression: dry-run payloads authored as ["feature"] previously 500'd.
    out = issue_variables({"labels": ["feature", "chore"]}, "opened")
    assert out["ISSUE_LABELS"] == "feature,chore"


def test_issue_variables_skips_malformed_labels():
    out = issue_variables(
        {"labels": [{"name": "bug"}, {"color": "red"}, None, 7, "", "docs"]},
        "opened",
    )
    assert out["ISSUE_LABELS"] == "bug,docs"


def test_issue_variables_missing_labels_is_empty():
    assert issue_variables({}, "opened")["ISSUE_LABELS"] == ""
    assert issue_variables({"labels": None}, "opened")["ISSUE_LABELS"] == ""


def test_pr_variables_shares_shape_handling():
    out = pr_variables({"labels": ["feature", {"name": "area/api"}]}, "opened")
    assert out["PR_LABELS"] == "feature,area/api"


def test_labels_list_lowercases_for_matching():
    # Case is normalized for trigger matching but preserved in template vars.
    entity = {"labels": [{"name": "Bug"}, "Feature"]}
    assert labels_list(entity) == ["bug", "feature"]
    assert issue_variables(entity, "opened")["ISSUE_LABELS"] == "Bug,Feature"
