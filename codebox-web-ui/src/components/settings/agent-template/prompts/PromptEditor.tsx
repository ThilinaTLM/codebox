import { forwardRef, useImperativeHandle, useRef } from "react"
import { cn } from "@/lib/utils"
import { Textarea } from "@/components/ui/textarea"

export interface PromptEditorHandle {
  insertAtCursor: (token: string) => void
  focus: () => void
}

interface PromptEditorProps {
  id?: string
  value: string
  onChange: (next: string) => void
  rows?: number
  maxLength?: number
  placeholder?: string
  required?: boolean
  invalid?: boolean
  className?: string
  onFocus?: () => void
  "aria-label"?: string
}

export const PromptEditor = forwardRef<PromptEditorHandle, PromptEditorProps>(
  function PromptEditorImpl(props, ref) {
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    useImperativeHandle(ref, () => ({
      insertAtCursor: (token: string) => {
        const el = textareaRef.current
        if (!el) {
          props.onChange(props.value + token)
          return
        }
        const start = el.selectionStart
        const end = el.selectionEnd
        const next = el.value.slice(0, start) + token + el.value.slice(end)
        props.onChange(next)
        // Focus + place cursor after the inserted token on the next frame.
        queueMicrotask(() => {
          el.focus()
          const caret = start + token.length
          el.setSelectionRange(caret, caret)
        })
      },
      focus: () => textareaRef.current?.focus(),
    }))

    return (
      <Textarea
        ref={textareaRef}
        id={props.id}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        onFocus={props.onFocus}
        rows={props.rows ?? 8}
        maxLength={props.maxLength}
        placeholder={props.placeholder}
        required={props.required}
        aria-label={props["aria-label"]}
        aria-invalid={props.invalid || undefined}
        className={cn("font-mono text-xs leading-relaxed", props.className)}
      />
    )
  }
)
