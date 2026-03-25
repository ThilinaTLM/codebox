import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useSendFeedback } from "@/net/query"
import { toast } from "sonner"

export function FeedbackInput({
  taskId,
  onSend,
}: {
  taskId: string
  onSend?: (message: string) => void
}) {
  const [message, setMessage] = useState("")
  const feedback = useSendFeedback()

  const handleSend = () => {
    const trimmed = message.trim()
    if (!trimmed) return

    if (onSend) {
      onSend(trimmed)
    } else {
      feedback.mutate(
        { taskId, message: trimmed },
        {
          onSuccess: () => toast.success("Message sent"),
          onError: () => toast.error("Failed to send message"),
        },
      )
    }
    setMessage("")
  }

  return (
    <div className="flex items-start gap-2">
      <span className="mt-2.5 font-mono text-sm text-primary">$</span>
      <Textarea
        placeholder="Send a follow-up message..."
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            handleSend()
          }
        }}
        className="min-h-[60px] resize-none font-mono text-sm"
      />
      <Button
        onClick={handleSend}
        disabled={!message.trim() || feedback.isPending}
        className="self-end"
      >
        Send
      </Button>
    </div>
  )
}
