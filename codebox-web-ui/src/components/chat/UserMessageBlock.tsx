import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"

export function UserMessageBlock({ content }: { content: string }) {
  return (
    <div className="py-1">
      <span className="text-xs font-medium text-muted-foreground">You</span>
      <div className="prose prose-sm mt-0.5 max-w-none dark:prose-invert prose-p:my-0 prose-p:leading-relaxed prose-code:rounded prose-code:bg-inset prose-code:px-1.5 prose-code:py-0.5 prose-code:font-mono prose-code:text-sm prose-pre:rounded-lg prose-pre:bg-inset">
        <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
      </div>
    </div>
  )
}
