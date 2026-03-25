import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

export function SandboxInput({
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
    <div className="flex items-start gap-2">
      <span
        className={`mt-2.5 font-mono text-sm font-bold ${
          isExecMode ? "text-yellow-500" : "text-primary"
        }`}
      >
        {isExecMode ? "!" : "$"}
      </span>
      <Textarea
        placeholder={
          disabled
            ? "Sandbox is not active..."
            : "Message the agent, or type !command to run shell..."
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
        className={`min-h-[60px] resize-none font-mono text-sm ${
          isExecMode ? "border-yellow-500/30 bg-yellow-500/5" : ""
        }`}
      />
      <Button
        onClick={handleSend}
        disabled={disabled || !input.trim()}
        className="self-end"
      >
        {isExecMode ? "Run" : "Send"}
      </Button>
    </div>
  )
}
