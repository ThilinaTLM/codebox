"use client"

import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Cancel01Icon } from "@hugeicons/core-free-icons"

import { cn } from "@/lib/utils"

interface TagInputProps {
  value: ReadonlyArray<string>
  onValueChange: (next: Array<string>) => void
  placeholder?: string
  size?: "sm" | "default"
  disabled?: boolean
  className?: string
  id?: string
  /**
   * Called when a raw user-entered token is committed. Return the
   * normalised value to store, or ``null`` to reject.
   * Default: trim, reject empty + duplicates.
   */
  normalize?: (raw: string, current: ReadonlyArray<string>) => string | null
  "aria-label"?: string
}

function defaultNormalize(
  raw: string,
  current: ReadonlyArray<string>
): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (current.includes(trimmed)) return null
  return trimmed
}

function TagInput({
  value,
  onValueChange,
  placeholder,
  size = "default",
  disabled = false,
  className,
  id,
  normalize = defaultNormalize,
  "aria-label": ariaLabel,
}: TagInputProps) {
  const [draft, setDraft] = React.useState("")
  const inputRef = React.useRef<HTMLInputElement>(null)

  const commit = React.useCallback(
    (raw: string) => {
      const pieces = raw
        .split(/[,\n\t]/)
        .map((p) => normalize(p, value))
        .filter((p): p is string => p !== null)
      if (pieces.length === 0) return
      onValueChange([...value, ...pieces])
      setDraft("")
    },
    [normalize, onValueChange, value]
  )

  const removeAt = React.useCallback(
    (idx: number) => {
      const next = value.slice()
      next.splice(idx, 1)
      onValueChange(next)
    },
    [onValueChange, value]
  )

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault()
      if (draft) commit(draft)
      return
    }
    if (e.key === "Backspace" && !draft && value.length > 0) {
      e.preventDefault()
      removeAt(value.length - 1)
      return
    }
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text")
    if (text.includes(",") || text.includes("\n") || text.includes("\t")) {
      e.preventDefault()
      commit(text)
    }
  }

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: focus is delegated to the nested input
    <div
      data-slot="tag-input"
      data-size={size}
      data-disabled={disabled ? "true" : undefined}
      onClick={() => inputRef.current?.focus()}
      className={cn(
        "group/tag-input flex w-full min-w-0 cursor-text flex-wrap items-center gap-1 rounded-4xl border border-input bg-background px-2.5 py-1 text-left text-sm transition-colors outline-none",
        "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
        "data-[size=default]:min-h-9 data-[size=sm]:min-h-8",
        "data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50",
        "aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20",
        className
      )}
    >
      {value.map((tag, idx) => (
        <span
          key={`${tag}-${idx}`}
          data-slot="tag-input-chip"
          className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-foreground"
        >
          <span className="max-w-[200px] truncate">{tag}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              if (!disabled) removeAt(idx)
            }}
            disabled={disabled}
            aria-label={`Remove ${tag}`}
            className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:pointer-events-none"
          >
            <HugeiconsIcon
              icon={Cancel01Icon}
              strokeWidth={2}
              className="size-3"
            />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        id={id}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKey}
        onPaste={handlePaste}
        onBlur={() => {
          if (draft) commit(draft)
        }}
        placeholder={value.length === 0 ? placeholder : undefined}
        disabled={disabled}
        aria-label={ariaLabel}
        className="h-6 min-w-[80px] flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground/60 disabled:pointer-events-none"
      />
    </div>
  )
}

export { TagInput }
