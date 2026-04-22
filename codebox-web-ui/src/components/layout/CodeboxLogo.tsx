import { cn } from "@/lib/utils"

/**
 * Inline Codebox mark.
 *
 * The cube uses `currentColor` so callers can drive its color via a Tailwind
 * text-* class (e.g. `text-sidebar-foreground`), which means the logo tracks
 * the active in-app theme automatically. The blue accent inside the cube is
 * intentionally fixed so it reads on both light and dark backgrounds.
 *
 * The standalone SVG file at /public/codebox-logo.svg is a separate, favicon-
 * oriented variant that adapts to the OS color scheme via a media query.
 */
export function CodeboxLogo({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      role="img"
      aria-label="Codebox"
      className={cn("shrink-0", className)}
    >
      <title>Codebox</title>
      {/* Left face */}
      <polygon
        fill="currentColor"
        points="50,83 128,128 128,218 50,173"
      />
      {/* Right face */}
      <polygon
        fill="currentColor"
        points="206,83 206,173 128,218 128,128"
      />
      {/* Top rim (outer rhombus with inner rhombus opening, even-odd fill) */}
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M128,38 L206,83 L128,128 L50,83 Z M128,58 L171,83 L128,108 L85,83 Z"
      />
      {/* Blue accent diamond inside the opening */}
      <polygon fill="#2563eb" points="128,67 155,83 128,99 101,83" />
    </svg>
  )
}
