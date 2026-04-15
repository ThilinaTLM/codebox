import { useEffect, useMemo, useState } from "react"
import {
  getLangFromFilename,
  useShikiHighlighter,
} from "@/hooks/useShikiHighlighter"

interface CodePreviewProps {
  code: string
  filename: string
}

export function CodePreview({ code, filename }: CodePreviewProps) {
  const { highlighter, theme } = useShikiHighlighter()
  const [html, setHtml] = useState<string | null>(null)
  const lang = useMemo(() => getLangFromFilename(filename), [filename])

  useEffect(() => {
    if (!highlighter || !code) return

    let cancelled = false

    async function highlight() {
      const hl = highlighter!
      try {
        // Ensure the language grammar is loaded
        const loadedLangs = hl.getLoadedLanguages()
        if (lang !== "text" && !loadedLangs.includes(lang)) {
          await hl.loadLanguage(lang as Parameters<typeof hl.loadLanguage>[0])
        }

        const result = hl.codeToHtml(code, {
          lang: hl.getLoadedLanguages().includes(lang) ? lang : "text",
          theme,
        })
        if (!cancelled) setHtml(result)
      } catch {
        // Fall back to plain text if language loading fails
        const result = hl.codeToHtml(code, {
          lang: "text",
          theme,
        })
        if (!cancelled) setHtml(result)
      }
    }

    highlight()
    return () => {
      cancelled = true
    }
  }, [highlighter, code, lang, theme])

  if (!html) {
    return (
      <pre className="font-terminal overflow-auto rounded-md bg-inset p-4 text-sm text-foreground/90">
        {code}
      </pre>
    )
  }

  return (
    <div
      className="shiki-preview overflow-auto rounded-md text-sm [&_pre]:!bg-inset [&_pre]:overflow-auto [&_pre]:p-4 [&_code]:font-terminal [&_.line]:whitespace-pre-wrap [&_.line]:break-all"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
