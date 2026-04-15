import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import type { HighlighterCore } from "shiki"

const LIGHT_THEME = "github-light"
const DARK_THEME = "github-dark"

/** Map file extensions to Shiki language identifiers. */
const EXT_TO_LANG: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  cjs: "javascript",
  py: "python",
  rb: "ruby",
  rs: "rust",
  go: "go",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  c: "c",
  cpp: "cpp",
  h: "c",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  json: "json",
  jsonc: "jsonc",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  xml: "xml",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  less: "less",
  md: "markdown",
  mdx: "mdx",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  fish: "fish",
  ps1: "powershell",
  sql: "sql",
  graphql: "graphql",
  gql: "graphql",
  dockerfile: "dockerfile",
  docker: "dockerfile",
  makefile: "makefile",
  mk: "makefile",
  lua: "lua",
  r: "r",
  vue: "vue",
  svelte: "svelte",
  tf: "hcl",
  hcl: "hcl",
  proto: "proto",
  ini: "ini",
  env: "dotenv",
  gitignore: "gitignore",
  csv: "csv",
  log: "log",
}

let highlighterPromise: Promise<HighlighterCore> | null = null

function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = import("shiki/bundle/web").then((mod) =>
      mod.createHighlighter({
        themes: [LIGHT_THEME, DARK_THEME],
        langs: [],
      }),
    )
  }
  return highlighterPromise
}

export function getLangFromFilename(filename: string): string {
  const name = filename.toLowerCase()
  // Handle dotfiles like Makefile, Dockerfile
  if (name === "makefile" || name === "gnumakefile")
    return EXT_TO_LANG.makefile
  if (name === "dockerfile") return EXT_TO_LANG.dockerfile
  if (name.startsWith(".env")) return EXT_TO_LANG.env
  if (name === ".gitignore") return EXT_TO_LANG.gitignore

  const ext = name.includes(".") ? name.split(".").pop()! : ""
  return EXT_TO_LANG[ext] ?? "text"
}

export function useShikiHighlighter() {
  const [highlighter, setHighlighter] = useState<HighlighterCore | null>(null)
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    let cancelled = false
    getHighlighter().then((hl) => {
      if (!cancelled) setHighlighter(hl)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const theme = resolvedTheme === "light" ? LIGHT_THEME : DARK_THEME

  return { highlighter, theme }
}
