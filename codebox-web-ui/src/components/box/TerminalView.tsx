import { useCallback, useEffect, useRef, useState } from "react"
import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { WebLinksAddon } from "@xterm/addon-web-links"
import "@xterm/xterm/css/xterm.css"
import { RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { API_URL } from "@/lib/constants"

// ── Types ───────────────────────────────────────────────────

type ConnectionStatus =
  | "idle"
  | "connecting"
  | "open"
  | "closed"
  | "exited"
  | "error"

interface TerminalViewProps {
  projectSlug: string
  boxId: string
  isActive: boolean
}

// ── Helpers ────────────────────────────────────────────────

function buildWsUrl(projectSlug: string, boxId: string): string {
  const base = API_URL.replace(/^http:/, "ws:").replace(/^https:/, "wss:")
  return `${base}/api/projects/${encodeURIComponent(projectSlug)}/boxes/${encodeURIComponent(boxId)}/pty`
}

function buildTheme(): Record<string, string | undefined> {
  // Read live CSS variables so the terminal follows theme (light/dark)
  // changes applied at the :root level.
  const style = getComputedStyle(document.documentElement)
  const resolve = (name: string, fallback: string): string => {
    const v = style.getPropertyValue(name).trim()
    return v || fallback
  }

  // A calm, Catppuccin-ish 16-color palette that works on both light
  // and dark backgrounds.  xterm.js accepts any valid CSS color string.
  const isDark = document.documentElement.classList.contains("dark")
  const base = {
    background: resolve("--inset", isDark ? "#111113" : "#f7f7f8"),
    foreground: resolve("--foreground", isDark ? "#e8e4d5" : "#1b1b1f"),
    cursor: resolve("--foreground", isDark ? "#e8e4d5" : "#1b1b1f"),
    cursorAccent: resolve("--inset", isDark ? "#111113" : "#f7f7f8"),
    selectionBackground: isDark ? "#2f3742" : "#dde3ef",
    selectionForeground: undefined,
  }

  const ansi = isDark
    ? {
        black: "#45475a",
        red: "#f38ba8",
        green: "#a6e3a1",
        yellow: "#f9e2af",
        blue: "#89b4fa",
        magenta: "#cba6f7",
        cyan: "#94e2d5",
        white: "#bac2de",
        brightBlack: "#585b70",
        brightRed: "#f38ba8",
        brightGreen: "#a6e3a1",
        brightYellow: "#f9e2af",
        brightBlue: "#89b4fa",
        brightMagenta: "#cba6f7",
        brightCyan: "#94e2d5",
        brightWhite: "#cdd6f4",
      }
    : {
        black: "#4c4f69",
        red: "#d20f39",
        green: "#40a02b",
        yellow: "#df8e1d",
        blue: "#1e66f5",
        magenta: "#8839ef",
        cyan: "#179299",
        white: "#acb0be",
        brightBlack: "#6c6f85",
        brightRed: "#d20f39",
        brightGreen: "#40a02b",
        brightYellow: "#df8e1d",
        brightBlue: "#1e66f5",
        brightMagenta: "#8839ef",
        brightCyan: "#179299",
        brightWhite: "#bcc0cc",
      }

  return { ...base, ...ansi }
}

function statusLabel(status: ConnectionStatus, isActive: boolean): string {
  if (!isActive) return "Box is not running"
  switch (status) {
    case "idle":
      return "Idle"
    case "connecting":
      return "Connecting…"
    case "open":
      return "Connected"
    case "closed":
      return "Disconnected"
    case "exited":
      return "Session ended"
    case "error":
      return "Connection error"
  }
}

// ── Component ───────────────────────────────────────────────

export function TerminalView({ projectSlug, boxId, isActive }: TerminalViewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const resizeRafRef = useRef<number | null>(null)
  const [status, setStatus] = useState<ConnectionStatus>("idle")
  const [reconnectNonce, setReconnectNonce] = useState(0)

  const sendResize = useCallback((cols: number, rows: number) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify({ type: "resize", cols, rows }))
  }, [])

  useEffect(() => {
    if (!isActive) {
      setStatus("idle")
      return
    }
    const host = hostRef.current
    if (!host) return

    // ── Terminal setup ────────────────────────────────────
    const term = new Terminal({
      theme: buildTheme(),
      fontFamily: '"JetBrains Mono Variable", ui-monospace, "Cascadia Mono", "Menlo", monospace',
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: "block",
      scrollback: 10_000,
      allowProposedApi: true,
      convertEol: false,
      macOptionIsMeta: true,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon())
    term.open(host)
    // First fit after mount.
    requestAnimationFrame(() => {
      try {
        fit.fit()
      } catch {
        // ignore pre-layout fit errors
      }
    })
    termRef.current = term
    fitRef.current = fit

    // ── WebSocket setup ───────────────────────────────────
    setStatus("connecting")
    const ws = new WebSocket(buildWsUrl(projectSlug, boxId))
    ws.binaryType = "arraybuffer"
    wsRef.current = ws

    const encoder = new TextEncoder()

    ws.onopen = () => {
      setStatus("open")
      const cols = term.cols || 80
      const rows = term.rows || 24
      ws.send(
        JSON.stringify({
          type: "open",
          cols,
          rows,
          shell: "/bin/bash",
          cwd: "/workspace",
        })
      )
      term.focus()
    }

    ws.onmessage = (ev) => {
      if (typeof ev.data === "string") {
        try {
          const msg = JSON.parse(ev.data)
          if (msg.type === "exit") {
            const code = msg.exit_code
            const signalNum = msg.signal
            const note =
              typeof signalNum === "number"
                ? `\r\n\x1b[2m[process terminated by signal ${signalNum}]\x1b[0m\r\n`
                : `\r\n\x1b[2m[process exited with code ${code}]\x1b[0m\r\n`
            term.write(note)
            if (msg.error) {
              term.write(`\x1b[2m[error: ${String(msg.error)}]\x1b[0m\r\n`)
            }
            setStatus("exited")
          }
        } catch {
          // Unknown text frame; ignore.
        }
      } else if (ev.data instanceof ArrayBuffer) {
        term.write(new Uint8Array(ev.data))
      }
    }

    ws.onerror = () => {
      setStatus((prev) => (prev === "exited" ? prev : "error"))
    }

    ws.onclose = () => {
      setStatus((prev) => {
        if (prev === "exited" || prev === "error") return prev
        return "closed"
      })
    }

    // ── Input wiring ─────────────────────────────────────
    const dataSub = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(encoder.encode(data))
      }
    })

    // ── Resize wiring ────────────────────────────────────
    const triggerFit = () => {
      if (resizeRafRef.current != null) {
        cancelAnimationFrame(resizeRafRef.current)
      }
      resizeRafRef.current = requestAnimationFrame(() => {
        try {
          fit.fit()
          sendResize(term.cols, term.rows)
        } catch {
          // ignore transient layout errors
        }
      })
    }

    const ro = new ResizeObserver(triggerFit)
    ro.observe(host)
    window.addEventListener("resize", triggerFit)

    return () => {
      dataSub.dispose()
      ro.disconnect()
      window.removeEventListener("resize", triggerFit)
      if (resizeRafRef.current != null) {
        cancelAnimationFrame(resizeRafRef.current)
      }
      try {
        ws.close()
      } catch {
        // ignore
      }
      wsRef.current = null
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [projectSlug, boxId, isActive, reconnectNonce, sendResize])

  const handleReconnect = useCallback(() => {
    setReconnectNonce((n) => n + 1)
  }, [])

  const canReconnect =
    isActive && (status === "closed" || status === "exited" || status === "error")

  return (
    <div className="flex h-full min-h-0 flex-col bg-inset">
      {!isActive ? (
        <div className="flex h-full items-center justify-center p-6">
          <p className="text-sm text-muted-foreground">
            Terminal unavailable — box is not running
          </p>
        </div>
      ) : (
        <>
          <div
            ref={hostRef}
            className="terminal-host min-h-0 flex-1 overflow-hidden px-3 pt-3"
            onClick={() => termRef.current?.focus()}
          />
          <div className="flex items-center justify-between gap-3 border-t border-border/40 bg-card px-3 py-1.5 text-2xs">
            <div className="flex items-center gap-2 text-muted-foreground">
              <span
                className={`inline-block size-1.5 rounded-full ${
                  status === "open"
                    ? "bg-state-completed"
                    : status === "connecting"
                      ? "bg-state-writing"
                      : status === "error"
                        ? "bg-destructive"
                        : "bg-muted-foreground/50"
                }`}
              />
              <span>{statusLabel(status, isActive)}</span>
              {status === "connecting" && (
                <Spinner className="size-3 text-muted-foreground" />
              )}
            </div>
            {canReconnect && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleReconnect}
                className="h-6 gap-1.5 px-2 text-2xs"
                title="Start a new session"
              >
                <RotateCcw size={12} />
                New session
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
