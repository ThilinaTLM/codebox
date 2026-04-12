import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"

export function AssistantTextBlock({ content }: { content: string }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-border/30 bg-card px-4 py-3">
        <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:mt-2 prose-headings:mb-1 prose-headings:font-display prose-headings:tracking-tight prose-p:my-1 prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-strong:text-foreground prose-code:rounded prose-code:border prose-code:border-border/20 prose-code:bg-inset prose-code:px-1.5 prose-code:py-0.5 prose-code:font-mono prose-code:text-sm prose-code:text-primary/80 prose-pre:rounded-lg prose-pre:border prose-pre:border-border/20 prose-pre:bg-inset">
          <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
        </div>
      </div>
    </div>
  )
}
