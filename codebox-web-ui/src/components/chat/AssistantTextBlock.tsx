import { Sparkles } from "lucide-react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"

export function AssistantTextBlock({ content }: { content: string }) {
  return (
    <div className="border-l-2 border-l-primary/50 pl-4">
      <div className="mb-1.5 flex items-center gap-1.5">
        <Sparkles size={12} className="text-primary/60" />
        <span className="font-terminal text-xs text-primary/60">Agent</span>
      </div>
      <div className="prose max-w-none dark:prose-invert prose-headings:font-display prose-strong:text-foreground prose-a:text-primary prose-code:rounded prose-code:bg-inset prose-code:px-1.5 prose-code:py-0.5 prose-code:font-mono prose-code:text-sm prose-code:text-primary/80 prose-pre:rounded-lg prose-pre:border prose-pre:border-border/30 prose-pre:bg-inset">
        <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
      </div>
    </div>
  )
}
