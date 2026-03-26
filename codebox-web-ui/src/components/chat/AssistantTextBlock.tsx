import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"

export function AssistantTextBlock({ content }: { content: string }) {
  return (
    <div className="prose max-w-none dark:prose-invert prose-a:text-primary prose-code:rounded prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:font-mono prose-code:text-sm prose-code:text-primary/80 prose-pre:rounded-xl prose-pre:bg-muted">
      <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
    </div>
  )
}
