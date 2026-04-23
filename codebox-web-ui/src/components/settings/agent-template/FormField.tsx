import * as React from "react"

import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"

interface FormFieldProps {
  label: React.ReactNode
  htmlFor?: string
  description?: React.ReactNode
  error?: string
  required?: boolean
  children: React.ReactNode
  className?: string
  action?: React.ReactNode
}

export function FormField({
  label,
  htmlFor,
  description,
  error,
  required,
  children,
  className,
  action,
}: FormFieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={htmlFor}>
          {label}
          {required && (
            <span className="ml-1 text-destructive" aria-hidden>
              *
            </span>
          )}
        </Label>
        {action}
      </div>
      {children}
      {error ? (
        <p
          className="text-xs text-destructive"
          role="alert"
          data-slot="form-field-error"
        >
          {error}
        </p>
      ) : description ? (
        <p
          className="text-xs text-muted-foreground"
          data-slot="form-field-description"
        >
          {description}
        </p>
      ) : null}
    </div>
  )
}

interface SectionCardProps {
  id?: string
  title: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  action?: React.ReactNode
  className?: string
}

export function SectionCard({
  id,
  title,
  description,
  children,
  action,
  className,
}: SectionCardProps) {
  return (
    <section
      id={id}
      className={cn(
        "scroll-mt-24 rounded-xl border border-border/50 bg-card p-6",
        className
      )}
    >
      <header className="mb-5 flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="font-display text-base font-medium text-foreground">
            {title}
          </h3>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className="space-y-5">{children}</div>
    </section>
  )
}
