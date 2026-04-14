import { useCallback, useEffect, useRef, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowUp01Icon } from "@hugeicons/core-free-icons"
import { Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const MAX_HEIGHT = 200

export function BoxInput({
  onSendMessage,
  onSendExec,
  onCancel,
  isWorking,
  disabled,
}: {
  onSendMessage: (content: string) => void
  onSendExec: (command: string) => void
  onCancel?: () => void
  isWorking?: boolean
  disabled?: boolean
}) {
  const [input, setInput] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    if (!el.value) {
      el.style.overflowY = "hidden"
      return
    }
    el.style.height = Math.min(el.scrollHeight, MAX_HEIGHT) + "px"
    el.style.overflowY = el.scrollHeight > MAX_HEIGHT ? "auto" : "hidden"
  }, [])

  useEffect(() => {
    adjustHeight()
  }, [input, adjustHeight])

  const handleSend = () => {
    const trimmed = input.trim()
    if (!trimmed) return

    // Auto-detect shell commands: "$ <command>"
    if (trimmed.startsWith("$ ")) {
      onSendExec(trimmed.slice(2))
    } else {
      onSendMessage(trimmed)
    }
    setInput("")
  }

  const placeholder = disabled
    ? isWorking
      ? "Waiting for agent…"
      : "Agent is stopped"
    : "Ask anything…"

  return (
    <div>
      <div
        className={cn(
          "relative rounded-xl border bg-card transition-colors duration-slow",
          isWorking
            ? "animate-glow-pulse border-state-writing/30"
            : "border-border"
        )}
      >
        <div className="flex items-end gap-2 px-3 py-2">
          {/* Textarea */}
          <textarea
            ref={textareaRef}
            rows={1}
            placeholder={placeholder}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            disabled={disabled}
            className="min-h-[28px] w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground/50 disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              maxHeight: `${MAX_HEIGHT}px`,
              overflowY: "hidden",
            }}
          />

          {/* Send / Cancel buttons */}
          <div className="mb-0.5 flex shrink-0 items-center gap-1">
            {isWorking && (
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={onCancel}
                title="Cancel"
                className="text-muted-foreground hover:text-warning"
              >
                <Square size={14} fill="currentColor" />
              </Button>
            )}
            <Button
              size="icon-sm"
              onClick={handleSend}
              disabled={disabled || !input.trim()}
              className="rounded-md bg-primary text-primary-foreground"
            >
              <HugeiconsIcon icon={ArrowUp01Icon} size={16} strokeWidth={2.5} />
            </Button>
          </div>
        </div>
      </div>
      {/* Keyboard hints */}
      <p className="mt-1 text-center text-2xs text-muted-foreground">
        Enter to send · Shift+Enter for newline ·{" "}
        <span className="font-terminal">$ command</span> for shell
      </p>
    </div>
  )
}
