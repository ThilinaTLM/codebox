import { createFileRoute } from "@tanstack/react-router"
import { Cpu, HardDrive, Network, Settings } from "lucide-react"

export const Route = createFileRoute(
  "/projects/$projectSlug/boxes/$boxId/resources"
)({
  component: BoxResourcesPage,
})

function BoxResourcesPage() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl border border-dashed border-border bg-card">
          <Settings size={20} className="text-muted-foreground" />
        </div>
        <h2 className="font-display text-base font-semibold">Coming Soon</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Resource monitoring and container configuration will be available
          here.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          {[
            { icon: Cpu, label: "CPU & Memory" },
            { icon: HardDrive, label: "Disk Usage" },
            { icon: Network, label: "Port Mappings" },
            { icon: Settings, label: "Environment" },
          ].map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-2 rounded-lg border border-border/40 px-3 py-2 text-left"
            >
              <item.icon size={14} className="text-muted-foreground/50" />
              <span className="text-xs text-muted-foreground">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
