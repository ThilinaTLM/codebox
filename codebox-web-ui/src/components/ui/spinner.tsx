import { CodeboxLogoLoader } from "@/components/layout/CodeboxLogoLoader"
import { cn } from "@/lib/utils"

/**
 * App-wide inline loading indicator.
 *
 * Renders the animated Codebox mark so every "busy" state across the UI
 * uses the same branded motion. The default size (`size-4`) and the
 * `role="status"` / `aria-label="Loading"` semantics match the previous
 * icon-based spinner, so existing call sites drop in unchanged — pass a
 * `size-*` or `text-*` class via `className` to tune size and color.
 *
 * For full-area loading states, prefer {@link CodeboxLoadingState} from
 * `@/components/layout/CodeboxLogoLoader`, which centers the mark with an
 * optional caption.
 */
function Spinner({ className }: { className?: string }) {
  return <CodeboxLogoLoader className={cn("size-4", className)} />
}

export { Spinner }
