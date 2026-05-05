import { describe, expect, it } from "vitest"
import { diffPatch } from "@/lib/diff-patch"

describe("diffPatch", () => {
  it("returns empty object for identical values", () => {
    expect(diffPatch({ a: 1, b: "x" }, { a: 1, b: "x" })).toEqual({})
  })

  it("includes only changed primitive fields", () => {
    expect(diffPatch({ a: 1, b: "x", c: true }, { a: 2, b: "x", c: true })).toEqual({ a: 2 })
  })

  it("treats null and undefined as different (Object.is)", () => {
    expect(diffPatch({ a: undefined } as Record<string, unknown>, { a: null })).toEqual({ a: null })
  })

  it("treats NaN as equal to NaN (Object.is)", () => {
    expect(diffPatch({ a: NaN }, { a: NaN })).toEqual({})
  })

  it("compares arrays by value via JSON.stringify", () => {
    expect(diffPatch({ a: [1, 2] }, { a: [1, 2] })).toEqual({})
    expect(diffPatch({ a: [1, 2] }, { a: [1, 3] })).toEqual({ a: [1, 3] })
  })

  it("compares objects by value via JSON.stringify", () => {
    expect(diffPatch({ a: { x: 1 } }, { a: { x: 1 } })).toEqual({})
    expect(diffPatch({ a: { x: 1 } }, { a: { x: 2 } })).toEqual({ a: { x: 2 } })
  })

  it("detects array vs non-array changes", () => {
    expect(diffPatch({ a: [1] }, { a: null })).toEqual({ a: null })
    expect(diffPatch({ a: null }, { a: [1] })).toEqual({ a: [1] })
  })
})