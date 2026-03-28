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
  const [focused, setFocused] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const isExecMode = input.startsWith("!")

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

    if (trimmed.startsWith("!")) {
      const command = trimmed.slice(1).trim()
      if (command) {
        onSendExec(command)
      }
    } else {
      onSendMessage(trimmed)
    }
    setInput("")
  }

  const placeholder = disabled
    ? isWorking
      ? "Waiting for agent..."
      : "Box is not active..."
    : "Message the agent, or type ! for shell..."

  return (
    <div>
      <div
        className={cn(
          "relative rounded-lg border bg-inset shadow-sm transition-colors duration-300",
          isWorking
            ? "border-state-thinking/30 animate-glow-pulse"
            : "border-border"
        )}
      >
        {/* Prompt glyph */}
        <span
          className={cn(
            "pointer-events-none absolute top-3.5 left-4 font-terminal text-sm font-medium",
            isExecMode ? "text-state-thinking" : "text-primary"
          )}
        >
          {isExecMode ? "$" : ">_"}
        </span>
        <textarea
          ref={textareaRef}
          rows={1}
          placeholder={placeholder}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          disabled={disabled}
          className="w-full resize-none rounded-lg bg-transparent pl-10 pr-14 pt-3.5 pb-3.5 font-terminal text-sm outline-none placeholder:text-ghost disabled:opacity-50"
          style={{
            maxHeight: `${MAX_HEIGHT}px`,
            overflowY: "hidden",
          }}
        />
        <div className="absolute right-3 bottom-3">
          {isWorking ? (
            <Button
              size="icon-sm"
              variant="destructive"
              onClick={onCancel}
              title="Stop agent"
              className="rounded-md"
            >
              <Square size={14} fill="currentColor" />
            </Button>
          ) : (
            <Button
              size="icon-sm"
              onClick={handleSend}
              disabled={disabled || !input.trim()}
              className="rounded-md bg-primary text-primary-foreground"
            >
              <HugeiconsIcon icon={ArrowUp01Icon} size={16} strokeWidth={2.5} />
            </Button>
          )}
        </div>
      </div>
      {/* Keyboard hints */}
      {focused && input.trim() && (
        <div className="mt-1 text-center text-[10px] text-ghost">
          Enter to send · Shift+Enter for newline
        </div>
      )}
    </div>
  )
}
