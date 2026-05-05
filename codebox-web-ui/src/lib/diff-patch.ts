/**
 * Compute a partial patch by comparing two objects field-by-field.
 * Only includes keys where the values differ.
 *
 * - Primitives: compared with `Object.is`.
 * - Arrays and plain objects: compared via `JSON.stringify` for deep equality.
 */
export function diffPatch<T extends object>(
  original: T,
  full: T,
): Partial<T> {
  const out: Partial<T> = {}
  for (const k of Object.keys(full) as Array<keyof T>) {
    const a = original[k]
    const b = full[k]
    if (isObjectOrArray(a) || isObjectOrArray(b)) {
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        out[k] = b
      }
    } else if (!Object.is(a, b)) {
      out[k] = b
    }
  }
  return out
}

function isObjectOrArray(value: unknown): value is object {
  return value !== null && typeof value === "object"
}