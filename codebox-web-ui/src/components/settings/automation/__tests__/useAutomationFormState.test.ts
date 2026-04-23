import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import {
  computeErrors,
  useAutomationFormState,
} from "../useAutomationFormState"
import type { FormState } from "../useAutomationFormState"

describe("useAutomationFormState", () => {
  it("seeds default trigger_actions for github.issues", () => {
    const { result } = renderHook(() => useAutomationFormState())
    expect(result.current.state.trigger_kind).toBe("github.issues")
    expect(result.current.state.trigger_actions).toEqual([
      "opened",
      "reopened",
    ])
    expect(result.current.state.workspace_mode).toBe("branch_from_issue")
  })

  it("setTrigger re-seeds actions and workspace_mode for the new kind", () => {
    const { result } = renderHook(() => useAutomationFormState())
    act(() => {
      result.current.dispatch({ type: "setTrigger", kind: "github.pull_request" })
    })
    expect(result.current.state.trigger_kind).toBe("github.pull_request")
    expect(result.current.state.trigger_actions).toEqual([
      "opened",
      "synchronize",
      "ready_for_review",
    ])
    expect(result.current.state.workspace_mode).toBe("checkout_ref")
  })

  it("setTrigger to schedule clears actions and forces pinned workspace", () => {
    const { result } = renderHook(() => useAutomationFormState())
    act(() => {
      result.current.dispatch({ type: "setTrigger", kind: "schedule" })
    })
    expect(result.current.state.trigger_actions).toEqual([])
    expect(result.current.state.workspace_mode).toBe("pinned")
    // Cron default seeded.
    expect(result.current.state.schedule_cron).toBe("0 9 * * *")
  })

  it("toggleAction adds and removes actions", () => {
    const { result } = renderHook(() => useAutomationFormState())
    act(() => {
      result.current.dispatch({ type: "toggleAction", action: "labeled" })
    })
    expect(result.current.state.trigger_actions).toContain("labeled")

    act(() => {
      result.current.dispatch({ type: "toggleAction", action: "labeled" })
    })
    expect(result.current.state.trigger_actions).not.toContain("labeled")
  })

  it("is invalid without a trigger_repo", () => {
    const { result } = renderHook(() => useAutomationFormState())
    act(() => {
      result.current.dispatch({
        type: "set",
        patch: { name: "Test", initial_prompt: "Hi" },
      })
    })
    expect(result.current.errors.trigger_repo).toBeDefined()
    expect(result.current.isValid).toBe(false)
  })

  it("is invalid when trigger_actions is empty for github.issues", () => {
    const { result } = renderHook(() => useAutomationFormState())
    act(() => {
      result.current.dispatch({
        type: "set",
        patch: {
          name: "Test",
          trigger_repo: "acme/widgets",
          trigger_actions: [],
          initial_prompt: "Hi",
        },
      })
    })
    expect(result.current.errors.trigger_actions).toBeDefined()
    expect(result.current.isValid).toBe(false)
  })

  it("becomes valid for a minimal github.issues automation", () => {
    const { result } = renderHook(() => useAutomationFormState())
    act(() => {
      result.current.dispatch({
        type: "set",
        patch: {
          name: "Triage",
          trigger_repo: "acme/widgets",
          initial_prompt: "Triage ${{ISSUE_CONTENT}}",
        },
      })
    })
    expect(result.current.isValid).toBe(true)
  })

  it("toCreatePayload shape drops pinned_repo and includes trigger_repo + trigger_actions", () => {
    const { result } = renderHook(() => useAutomationFormState())
    act(() => {
      result.current.dispatch({
        type: "set",
        patch: {
          name: "Dev",
          trigger_repo: "acme/widgets",
          initial_prompt: "Go",
        },
      })
    })
    const payload = result.current.toCreatePayload()
    expect(payload.trigger_repo).toBe("acme/widgets")
    expect(payload.trigger_actions).toEqual(["opened", "reopened"])
    expect(payload).not.toHaveProperty("pinned_repo")
  })

  it("toCreatePayload returns null trigger_actions for push and schedule", () => {
    const state: Partial<FormState> = {
      name: "Push bot",
      trigger_repo: "acme/widgets",
      trigger_kind: "github.push",
      trigger_actions: [],
      workspace_mode: "checkout_ref",
      initial_prompt: "React to push",
    }
    const { result } = renderHook(() => useAutomationFormState())
    act(() => {
      result.current.dispatch({ type: "set", patch: state })
    })
    expect(result.current.toCreatePayload().trigger_actions).toBeNull()
  })
})

describe("computeErrors", () => {
  const base: FormState = {
    name: "",
    description: "",
    enabled: true,
    trigger_repo: "",
    trigger_kind: "github.issues",
    trigger_actions: ["opened"],
    trigger_filters: [],
    schedule_cron: "",
    schedule_timezone: "UTC",
    workspace_mode: "branch_from_issue",
    pinned_branch: "",
    system_prompt: "",
    initial_prompt: "",
    llm_profile_id: "",
  }

  it("rejects a malformed trigger_repo", () => {
    const errors = computeErrors({ ...base, trigger_repo: "not-a-repo" })
    expect(errors.trigger_repo).toMatch(/owner\/name/)
  })

  it("requires pinned_branch when workspace_mode is pinned", () => {
    const errors = computeErrors({
      ...base,
      trigger_repo: "acme/widgets",
      workspace_mode: "pinned",
      initial_prompt: "go",
      name: "x",
    })
    expect(errors.pinned_branch).toBeDefined()
  })
})
