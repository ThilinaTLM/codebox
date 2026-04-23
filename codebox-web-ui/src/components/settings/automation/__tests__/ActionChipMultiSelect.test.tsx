import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ActionChipMultiSelect } from "../action-picker/ActionChipMultiSelect"

afterEach(() => {
  cleanup()
})

describe("ActionChipMultiSelect", () => {
  it("renders nothing when the kind has no actions", () => {
    const { container } = render(
      <ActionChipMultiSelect
        triggerKind="github.push"
        value={[]}
        onToggle={() => {}}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it("renders one chip per valid action for github.issues", () => {
    render(
      <ActionChipMultiSelect
        triggerKind="github.issues"
        value={["opened"]}
        onToggle={() => {}}
      />
    )
    // Use exact match since e.g. /labeled/ also matches ``unlabeled``.
    expect(screen.getByRole("button", { name: "opened" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "labeled" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "closed" })).toBeTruthy()
  })

  it("reflects selection via aria-pressed and data-selected", () => {
    render(
      <ActionChipMultiSelect
        triggerKind="github.issues"
        value={["opened"]}
        onToggle={() => {}}
      />
    )
    const opened = screen.getByRole("button", { name: "opened" })
    expect(opened.getAttribute("aria-pressed")).toBe("true")
    expect(opened.getAttribute("data-selected")).toBe("true")

    const closed = screen.getByRole("button", { name: "closed" })
    expect(closed.getAttribute("aria-pressed")).toBe("false")
  })

  it("calls onToggle with the clicked action", () => {
    const onToggle = vi.fn()
    render(
      <ActionChipMultiSelect
        triggerKind="github.issues"
        value={[]}
        onToggle={onToggle}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: "labeled" }))
    expect(onToggle).toHaveBeenCalledWith("labeled")
  })

  it("renders the error message when provided", () => {
    render(
      <ActionChipMultiSelect
        triggerKind="github.issues"
        value={[]}
        onToggle={() => {}}
        error="Select at least one action."
      />
    )
    expect(screen.getByText(/Select at least one action/)).toBeTruthy()
  })
})
