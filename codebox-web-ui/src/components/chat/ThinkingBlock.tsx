export function ThinkingBlock() {
  return (
    <div className="flex items-center gap-2.5 py-2">
      <div className="flex items-center gap-1">
        <span className="thinking-dot-1 inline-block size-1.5 rounded-full bg-primary" />
        <span className="thinking-dot-2 inline-block size-1.5 rounded-full bg-primary" />
        <span className="thinking-dot-3 inline-block size-1.5 rounded-full bg-primary" />
      </div>
      <span className="text-xs font-medium text-muted-foreground">
        Reasoning
      </span>
    </div>
  )
}
