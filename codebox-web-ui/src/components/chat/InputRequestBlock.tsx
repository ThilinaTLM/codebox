import { useState } from "react"
import { HelpCircle } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

interface InputRequestBlockProps {
  message: string
  questions?: Array<string>
  onReply: (response: string) => void
  replied?: boolean
  replyText?: string
}

export function InputRequestBlock({
  message,
  questions,
  onReply,
  replied,
  replyText,
}: InputRequestBlockProps) {
  const [response, setResponse] = useState("")

  const handleReply = () => {
    const text = response.trim()
    if (!text) return
    onReply(text)
    setResponse("")
  }

  return (
    <div className="rounded-xl border border-warning/40 bg-warning/5 p-4">
      <div className="mb-2 flex items-center gap-2">
        <HelpCircle size={16} className="shrink-0 text-warning" />
        <span className="text-sm font-medium">Agent needs your input</span>
      </div>
      <p className="mb-3 text-sm">{message}</p>
      {questions && questions.length > 0 && (
        <ul className="mb-3 list-disc pl-5 text-sm text-muted-foreground">
          {questions.map((q, i) => (
            <li key={i}>{q}</li>
          ))}
        </ul>
      )}
      {replied ? (
        <div className="rounded-lg bg-muted/30 px-3 py-2 text-sm">
          <span className="text-muted-foreground">You replied: </span>
          {replyText}
        </div>
      ) : (
        <div className="flex gap-2">
          <Input
            placeholder="Type your response..."
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                handleReply()
              }
            }}
          />
          <Button size="sm" onClick={handleReply}>
            Reply
          </Button>
        </div>
      )}
    </div>
  )
}
