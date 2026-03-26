import { useCallback, useEffect, useRef, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowUp01Icon } from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

const MAX_HEIGHT = 200

export function BoxInput({
  onSendMessage,
  onSendExec,
  disabled,
}: {
  onSendMessage: (content: string) => void
  onSendExec: (command: string) => void
  disabled?: boolean
}) {
  const [input, setInput] = useState("")
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

  return (
    <div className="relative rounded-2xl border border-border/60 bg-muted/30 shadow-lg backdrop-blur-md">
      {isExecMode && (
        <div className="absolute top-3 left-3 z-10">
          <Badge
            variant="outline"
            className="border-warning/30 text-xs text-warning"
          >
            shell
          </Badge>
        </div>
      )}
      <textarea
        ref={textareaRef}
        rows={1}
        placeholder={
          disabled
            ? "Box is not active..."
            : "Message the agent, or type ! for shell..."
        }
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            handleSend()
          }
        }}
        disabled={disabled}
        className={`w-full resize-none rounded-2xl bg-transparent px-4 py-3.5 pr-14 text-base outline-none placeholder:text-muted-foreground/60 disabled:opacity-50 ${
          isExecMode ? "pt-10" : ""
        }`}
        style={{
          maxHeight: `${MAX_HEIGHT}px`,
          overflowY: "hidden",
        }}
      />
      <div className="absolute right-3 bottom-3">
        <Button
          size="icon-sm"
          onClick={handleSend}
          disabled={disabled || !input.trim()}
        >
          <HugeiconsIcon icon={ArrowUp01Icon} size={16} strokeWidth={2.5} />
        </Button>
      </div>
    </div>
  )
}
