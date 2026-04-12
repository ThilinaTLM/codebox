export function StepHeader({
  step,
  title,
  description,
}: {
  step: number
  title: string
  description: string
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
        {step}
      </span>
      <div>
        <h2 className="font-display text-lg">{title}</h2>
        <p className="mt-1 max-w-lg text-sm text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  )
}
