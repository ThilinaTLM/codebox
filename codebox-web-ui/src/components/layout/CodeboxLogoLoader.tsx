import { cn } from "@/lib/utils"

/**
 * Animated Codebox mark used for loading states.
 *
 * The three cube faces assemble in sequence (top → left → right), then the
 * blue accent diamond "pops in" before the whole cycle resets. Colors follow
 * the same conventions as {@link CodeboxLogo}: the cube tracks `currentColor`
 * so callers can theme it with a Tailwind text-* class, and the blue accent is
 * intentionally fixed.
 *
 * All timings live in `src/animate.css` under the `cb-loader` scope, and the
 * project-wide `prefers-reduced-motion` rule in that file automatically stills
 * the animation for users who opt out of motion.
 */
export function CodeboxLogoLoader({
  className,
  label = "Loading",
}: {
  className?: string
  label?: string
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      role="status"
      aria-label={label}
      className={cn("cb-loader shrink-0", className)}
    >
      <title>{label}</title>
      {/* Left face */}
      <polygon
        data-face="left"
        fill="currentColor"
        points="50,83 128,128 128,218 50,173"
      />
      {/* Right face */}
      <polygon
        data-face="right"
        fill="currentColor"
        points="206,83 206,173 128,218 128,128"
      />
      {/* Top rim (outer rhombus with inner rhombus opening, even-odd fill) */}
      <path
        data-face="top"
        fill="currentColor"
        fillRule="evenodd"
        d="M128,38 L206,83 L128,128 L50,83 Z M128,58 L171,83 L128,108 L85,83 Z"
      />
      {/* Blue accent diamond inside the opening */}
      <polygon
        data-face="accent"
        fill="#2563eb"
        points="128,67 155,83 128,99 101,83"
      />
    </svg>
  )
}

/**
 * Full-area loading state: centers the animated logo with an optional caption.
 * Handy as a route `pendingComponent` or Suspense fallback.
 */
export function CodeboxLoadingState({
  className,
  message,
  size = "size-12",
}: {
  className?: string
  /** Optional supporting text rendered beneath the mark. */
  message?: string
  /** Tailwind size class for the mark (default: `size-12`). */
  size?: string
}) {
  return (
    <div
      className={cn(
        "flex h-full w-full flex-col items-center justify-center gap-3 p-8 text-foreground/80",
        className
      )}
    >
      <CodeboxLogoLoader className={cn(size, "text-foreground")} label={message ?? "Loading"} />
      {message ? (
        <p className="animate-breathe text-sm text-muted-foreground">{message}</p>
      ) : null}
    </div>
  )
}
