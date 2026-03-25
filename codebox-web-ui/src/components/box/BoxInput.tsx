import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowUp01Icon } from "@hugeicons/core-free-icons"

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

  const isExecMode = input.startsWith("!")

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
    <div className="relative rounded-2xl border bg-card shadow-sm">
      {isExecMode && (
        <div className="absolute left-3 top-3 z-10">
          <Badge variant="outline" className="border-warning/30 text-xs text-warning">
            shell
          </Badge>
        </div>
      )}
      <textarea
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
        rows={1}
        className={`w-full resize-none rounded-2xl bg-transparent px-4 py-3.5 pr-14 text-sm outline-none placeholder:text-muted-foreground/60 disabled:opacity-50 ${
          isExecMode ? "pt-10" : ""
        }`}
        style={{ minHeight: "52px", maxHeight: "200px" }}
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
