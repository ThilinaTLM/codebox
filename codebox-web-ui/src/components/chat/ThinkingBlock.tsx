import { Sparkles } from "lucide-react"

export function ThinkingBlock({ content }: { content?: string }) {
  return (
    <div className="rounded-lg bg-card/50 px-4 py-3">
      <div className="flex items-center gap-2.5">
        <Sparkles size={14} className="shrink-0 text-state-thinking animate-breathe" />
        <span className="font-terminal text-sm text-state-thinking">
          Reasoning
        </span>
        {!content && (
          <span className="font-terminal text-sm text-state-thinking/40 animate-breathe">
            ...
          </span>
        )}
      </div>
      {content && (
        <div className="mt-2 max-h-48 overflow-y-auto">
          <p className="whitespace-pre-wrap font-terminal text-xs leading-relaxed text-muted-foreground/70">
            {content}
          </p>
        </div>
      )}
      {/* Shimmer progress bar */}
      <div className="mt-2.5 h-px overflow-hidden rounded-full bg-state-thinking/10">
        <div className="h-full w-1/3 rounded-full bg-state-thinking/40 animate-shimmer" />
      </div>
    </div>
  )
}
