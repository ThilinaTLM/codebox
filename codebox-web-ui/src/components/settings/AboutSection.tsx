import { HugeiconsIcon } from "@hugeicons/react"
import { InformationCircleIcon } from "@hugeicons/core-free-icons"

// TODO: wire to build-time metadata (git sha, build date) instead of a
// hardcoded constant. For now mirrors StatusBar's hardcoded version.
const APP_VERSION = "v0.1.0"

export function AboutSection() {
  return (
    <div className="space-y-10">
      <section>
        <h2 className="font-display text-lg">About</h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Information about this Codebox installation.
        </p>

        <div className="mt-4 max-w-md space-y-3 rounded-lg border border-border p-4">
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <HugeiconsIcon
                icon={InformationCircleIcon}
                size={18}
                strokeWidth={2}
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display text-base font-medium">Codebox</p>
              <p className="text-sm text-muted-foreground">
                Sandboxed agent runtime.
              </p>
            </div>
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Version</dt>
            <dd className="font-mono">{APP_VERSION}</dd>
          </dl>
        </div>
      </section>
    </div>
  )
}
