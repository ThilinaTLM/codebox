import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"

export function UserMessageBlock({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[90%] rounded-lg bg-primary/8 px-3 py-1.5">
        <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-0 prose-p:leading-relaxed prose-code:rounded prose-code:bg-inset prose-code:px-1.5 prose-code:py-0.5 prose-code:font-mono prose-code:text-sm prose-pre:rounded-lg prose-pre:bg-inset">
          <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
        </div>
      </div>
    </div>
  )
}
