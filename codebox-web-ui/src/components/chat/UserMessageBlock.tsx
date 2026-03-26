import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"

export function UserMessageBlock({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl bg-primary/10 px-4 py-3">
        <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-0 prose-code:rounded prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:font-mono prose-code:text-sm prose-pre:rounded-xl prose-pre:bg-muted">
          <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
        </div>
      </div>
    </div>
  )
}
