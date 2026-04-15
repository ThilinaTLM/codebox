import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"

interface MarkdownPreviewProps {
  content: string
}

export function MarkdownPreview({ content }: MarkdownPreviewProps) {
  return (
    <div className="overflow-auto rounded-md bg-inset p-6">
      <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:mt-2 prose-headings:mb-1 prose-headings:font-display prose-headings:tracking-tight prose-p:my-1 prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-strong:text-foreground prose-code:rounded prose-code:border prose-code:border-border/20 prose-code:bg-background prose-code:px-1.5 prose-code:py-0.5 prose-code:font-mono prose-code:text-sm prose-code:text-primary/80 prose-pre:rounded-lg prose-pre:border prose-pre:border-border/20 prose-pre:bg-background">
        <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
      </div>
    </div>
  )
}
