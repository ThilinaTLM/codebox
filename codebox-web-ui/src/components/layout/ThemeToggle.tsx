import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Sun03Icon,
  Moon02Icon,
  ComputerDesk01Icon,
} from "@hugeicons/core-free-icons"
const options: { value: string; label: string; icon: typeof Sun03Icon }[] = [
  { value: "light", label: "Light", icon: Sun03Icon },
  { value: "dark", label: "Dark", icon: Moon02Icon },
  { value: "system", label: "System", icon: ComputerDesk01Icon },
]

function MiniPreview({ mode }: { mode: "light" | "dark" | "system" }) {
  const light = (
    <div className="rounded-md bg-neutral-100 p-2">
      <div className="flex gap-1">
        <div className="size-1.5 rounded-full bg-neutral-300" />
        <div className="size-1.5 rounded-full bg-neutral-300" />
        <div className="size-1.5 rounded-full bg-neutral-300" />
      </div>
      <div className="mt-2 space-y-1.5">
        <div className="h-1.5 w-3/4 rounded-full bg-neutral-300" />
        <div className="h-1.5 w-1/2 rounded-full bg-neutral-200" />
        <div className="h-1.5 w-2/3 rounded-full bg-neutral-200" />
      </div>
    </div>
  )

  const dark = (
    <div className="rounded-md bg-neutral-900 p-2">
      <div className="flex gap-1">
        <div className="size-1.5 rounded-full bg-neutral-700" />
        <div className="size-1.5 rounded-full bg-neutral-700" />
        <div className="size-1.5 rounded-full bg-neutral-700" />
      </div>
      <div className="mt-2 space-y-1.5">
        <div className="h-1.5 w-3/4 rounded-full bg-neutral-700" />
        <div className="h-1.5 w-1/2 rounded-full bg-neutral-800" />
        <div className="h-1.5 w-2/3 rounded-full bg-neutral-800" />
      </div>
    </div>
  )

  if (mode === "light") return light
  if (mode === "dark") return dark

  // System: split preview — left half light, right half dark
  return (
    <div className="flex overflow-hidden rounded-md">
      <div className="w-1/2 bg-neutral-100 p-2">
        <div className="flex gap-1">
          <div className="size-1.5 rounded-full bg-neutral-300" />
          <div className="size-1.5 rounded-full bg-neutral-300" />
        </div>
        <div className="mt-2 space-y-1.5">
          <div className="h-1.5 w-3/4 rounded-full bg-neutral-300" />
          <div className="h-1.5 w-1/2 rounded-full bg-neutral-200" />
        </div>
      </div>
      <div className="w-1/2 bg-neutral-900 p-2">
        <div className="flex justify-end gap-1">
          <div className="size-1.5 rounded-full bg-neutral-700" />
          <div className="size-1.5 rounded-full bg-neutral-700" />
        </div>
        <div className="mt-2 space-y-1.5">
          <div className="h-1.5 w-3/4 rounded-full bg-neutral-700" />
          <div className="h-1.5 w-1/2 rounded-full bg-neutral-800" />
        </div>
      </div>
    </div>
  )
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted) {
    return <div className="flex gap-3 opacity-0" style={{ height: 120 }} />
  }

  return (
    <div className="flex gap-3">
      {options.map((opt) => {
        const selected = theme === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setTheme(opt.value)}
            className={`group w-36 cursor-pointer rounded-xl border-2 p-2.5 text-left transition-all ${
              selected
                ? "border-primary bg-primary/5 shadow-sm"
                : "border-border hover:border-muted-foreground/30 hover:bg-muted/50"
            }`}
          >
            <MiniPreview mode={opt.value as "light" | "dark" | "system"} />
            <div className="mt-2.5 flex items-center gap-2 px-0.5">
              <HugeiconsIcon
                icon={opt.icon}
                size={14}
                strokeWidth={2}
                className={
                  selected ? "text-primary" : "text-muted-foreground"
                }
              />
              <span
                className={`text-sm font-medium ${
                  selected ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {opt.label}
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}
