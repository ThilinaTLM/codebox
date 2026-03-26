import { User } from "lucide-react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"

export function UserMessageBlock({ content }: { content: string }) {
  return (
    <div className="flex items-start justify-end gap-2.5">
      <div className="max-w-[85%]">
        <div className="rounded-lg bg-primary/8 px-4 py-3">
          <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-0 prose-p:leading-relaxed prose-code:rounded prose-code:bg-inset prose-code:px-1.5 prose-code:py-0.5 prose-code:font-mono prose-code:text-sm prose-pre:rounded-lg prose-pre:bg-inset">
            <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
          </div>
        </div>
      </div>
      <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
        <User size={12} />
      </div>
    </div>
  )
}
