import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react"
import type {
  ChangeEvent,
  KeyboardEvent,
  MouseEvent,
  RefObject,
} from "react"
import type { VariableEntry } from "../variableCatalog"
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
  /** When provided, typing ``${{`` opens an autocomplete popover. */
  variables?: ReadonlyArray<VariableEntry>
}

const TRIGGER_RE = /\$\{\{([A-Z0-9_]*)$/

interface AutocompleteState {
  /** Range in the textarea that should be replaced when an item is picked. */
  start: number
  end: number
  /** Filter text typed after ``${{`` (uppercase letters, digits, underscore). */
  prefix: string
}

export const PromptEditor = forwardRef<PromptEditorHandle, PromptEditorProps>(
  function PromptEditorImpl(props, ref) {
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const [autocomplete, setAutocomplete] =
      useState<AutocompleteState | null>(null)
    const [activeIndex, setActiveIndex] = useState(0)

    useImperativeHandle(ref, () => ({
      insertAtCursor: (token: string) => {
        insertAtCursor(textareaRef, props.value, props.onChange, token)
      },
      focus: () => textareaRef.current?.focus(),
    }))

    const variables = props.variables ?? null

    const matches = useMemo(() => {
      if (!variables || !autocomplete) return []
      const q = autocomplete.prefix.toUpperCase()
      const filtered = variables.filter((v) =>
        v.name.startsWith(q),
      )
      return filtered.slice(0, 8)
    }, [variables, autocomplete])

    // Reset active index whenever the match list changes shape.
    useEffect(() => {
      setActiveIndex(0)
    }, [autocomplete?.prefix])

    const detectAutocomplete = useCallback(() => {
      if (!variables) return
      const el = textareaRef.current
      if (!el) return
      const caret = el.selectionStart
      if (caret !== el.selectionEnd) {
        setAutocomplete(null)
        return
      }
      const left = el.value.slice(0, caret)
      const m = TRIGGER_RE.exec(left)
      if (!m) {
        setAutocomplete(null)
        return
      }
      const start = caret - m[0].length
      setAutocomplete({ start, end: caret, prefix: m[1] })
    }, [variables])

    const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
      props.onChange(e.target.value)
      // Detect on the next frame so the value/caret are settled.
      queueMicrotask(detectAutocomplete)
    }

    const insertVariable = useCallback(
      (entry: VariableEntry) => {
        const el = textareaRef.current
        if (!el || !autocomplete) return
        const token = `\${{${entry.name}}}`
        const next =
          el.value.slice(0, autocomplete.start) +
          token +
          el.value.slice(autocomplete.end)
        props.onChange(next)
        setAutocomplete(null)
        queueMicrotask(() => {
          el.focus()
          const caret = autocomplete.start + token.length
          el.setSelectionRange(caret, caret)
        })
      },
      [autocomplete, props],
    )

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (!autocomplete || matches.length === 0) return
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setActiveIndex((i) => (i + 1) % matches.length)
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setActiveIndex((i) => (i - 1 + matches.length) % matches.length)
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault()
        insertVariable(matches[activeIndex])
      } else if (e.key === "Escape") {
        e.preventDefault()
        setAutocomplete(null)
      }
    }

    const handleClickItem = (
      e: MouseEvent<HTMLButtonElement>,
      entry: VariableEntry,
    ) => {
      e.preventDefault()
      insertVariable(entry)
    }

    return (
      <div className="relative">
        <Textarea
          ref={textareaRef}
          id={props.id}
          value={props.value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onKeyUp={detectAutocomplete}
          onClick={detectAutocomplete}
          onFocus={props.onFocus}
          onBlur={() => {
            // Defer so a click on the popover lands first.
            window.setTimeout(() => setAutocomplete(null), 100)
          }}
          rows={props.rows ?? 8}
          maxLength={props.maxLength}
          placeholder={props.placeholder}
          required={props.required}
          aria-label={props["aria-label"]}
          aria-invalid={props.invalid || undefined}
          className={cn(
            "font-mono text-xs leading-relaxed",
            props.className,
          )}
        />
        {autocomplete && matches.length > 0 && (
          <div
            role="listbox"
            aria-label="Variable suggestions"
            className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
          >
            {matches.map((entry, idx) => {
              const active = idx === activeIndex
              return (
                <button
                  type="button"
                  key={entry.name}
                  onMouseDown={(e) => handleClickItem(e, entry)}
                  onMouseEnter={() => setActiveIndex(idx)}
                  data-active={active ? "true" : undefined}
                  className={cn(
                    "flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                    "hover:bg-muted",
                    "data-[active=true]:bg-primary/10 data-[active=true]:text-foreground",
                  )}
                >
                  <span className="flex w-full items-center gap-1.5">
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                      {entry.name}
                    </code>
                    {entry.runtimeOnly && (
                      <span className="ml-auto text-[9px] uppercase tracking-wider text-muted-foreground">
                        runtime
                      </span>
                    )}
                  </span>
                  <span className="line-clamp-1 text-[11px] text-muted-foreground">
                    {entry.description}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  },
)

function insertAtCursor(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  onChange: (next: string) => void,
  token: string,
) {
  const el = ref.current
  if (!el) {
    onChange(value + token)
    return
  }
  const start = el.selectionStart
  const end = el.selectionEnd
  const next = el.value.slice(0, start) + token + el.value.slice(end)
  onChange(next)
  queueMicrotask(() => {
    el.focus()
    const caret = start + token.length
    el.setSelectionRange(caret, caret)
  })
}
