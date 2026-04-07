import { Sparkles } from "lucide-react"

export function ThinkingBlock({ content }: { content?: string }) {
  const isSpinner = !content

  return (
    <div className="border-l-2 border-l-state-thinking/50 pl-3 py-1.5">
      <div className="flex items-center gap-2">
        <Sparkles size={12} className="shrink-0 text-state-thinking animate-breathe" />
        <span className="font-terminal text-xs text-state-thinking">
          Reasoning
        </span>
        {isSpinner && (
          <span className="font-terminal text-xs text-state-thinking/40 animate-breathe">
            ...
          </span>
        )}
      </div>
      {content && (
        <div className="mt-1 max-h-32 overflow-y-auto">
          <p className="whitespace-pre-wrap font-terminal text-xs leading-relaxed text-muted-foreground/70">
            {content}
          </p>
        </div>
      )}
      {isSpinner && (
        <div className="mt-1.5 h-px overflow-hidden rounded-full bg-state-thinking/10">
          <div className="h-full w-1/3 rounded-full bg-state-thinking/40 animate-shimmer" />
        </div>
      )}
    </div>
  )
}
