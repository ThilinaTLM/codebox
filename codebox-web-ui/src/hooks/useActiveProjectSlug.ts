import { useMatches } from "@tanstack/react-router"

/**
 * Derive the currently active project slug from the route tree.
 *
 * The URL is the source of truth. Anything that needs "the current project"
 * while rendered *inside a project route* should use this hook instead of
 * reading from the project store.
 */
export function useActiveProjectSlug(): string | null {
  const matches = useMatches()
  for (let i = matches.length - 1; i >= 0; i--) {
    const params = matches[i].params as { projectSlug?: string } | undefined
    if (params?.projectSlug) {
      return params.projectSlug
    }
  }
  return null
}
