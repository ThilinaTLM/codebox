import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { Eraser, Send } from "lucide-react"
import type { ExecBlock } from "@/lib/event-utils"
import type { BoxStreamEvent } from "@/net/http/types"
import { TerminalBlock } from "@/components/chat/TerminalBlock"
import { Button } from "@/components/ui/button"
import { collapseExecEvents, mergeEvents } from "@/lib/event-utils"

// ── Session storage helpers ─────────────────────────────────

function getCommandHistory(boxId: string): Array<string> {
  try {
    const raw = sessionStorage.getItem(`terminal-history-${boxId}`)
    return raw ? (JSON.parse(raw) as Array<string>) : []
  } catch {
    return []
  }
}

function saveCommandHistory(boxId: string, history: Array<string>) {
  try {
    sessionStorage.setItem(
      `terminal-history-${boxId}`,
      JSON.stringify(history.slice(-50)) // Keep last 50
    )
  } catch {
    // Ignore storage errors
  }
}

// ── Component ───────────────────────────────────────────────

interface TerminalViewProps {
  boxId: string
  historyEvents: Array<BoxStreamEvent>
  liveEvents: Array<BoxStreamEvent>
  onExec: (command: string) => void
  disabled?: boolean
}

export function TerminalView({
  boxId,
  historyEvents,
  liveEvents,
  onExec,
  disabled,
}: TerminalViewProps) {
  const [input, setInput] = useState("")
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [cmdHistory, setCmdHistory] = useState<Array<string>>(() =>
    getCommandHistory(boxId)
  )
  const [cleared, setCleared] = useState(false)
  const [clearSeq, setClearSeq] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const wasAtBottomRef = useRef(true)

  const merged = useMemo(
    () => mergeEvents(historyEvents, liveEvents),
    [historyEvents, liveEvents]
  )

  const allBlocks = useMemo(() => collapseExecEvents(merged), [merged])

  // If cleared, only show blocks created after the clear point
  const blocks: Array<ExecBlock> = useMemo(() => {
    if (!cleared) return allBlocks
    return allBlocks.slice(clearSeq)
  }, [allBlocks, cleared, clearSeq])

  // Auto-scroll when new blocks arrive
  useEffect(() => {
    if (wasAtBottomRef.current) {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      })
    }
  }, [blocks])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    wasAtBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }, [])

  const handleSubmit = useCallback(() => {
    const cmd = input.trim()
    if (!cmd || disabled) return

    onExec(cmd)

    const newHistory = [...cmdHistory.filter((h) => h !== cmd), cmd]
    setCmdHistory(newHistory)
    saveCommandHistory(boxId, newHistory)

    setInput("")
    setHistoryIndex(-1)
  }, [input, disabled, onExec, cmdHistory, boxId])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
        return
      }

      if (e.key === "ArrowUp") {
        e.preventDefault()
        if (cmdHistory.length === 0) return
        const nextIndex =
          historyIndex < cmdHistory.length - 1
            ? historyIndex + 1
            : historyIndex
        setHistoryIndex(nextIndex)
        setInput(cmdHistory[cmdHistory.length - 1 - nextIndex] ?? "")
        return
      }

      if (e.key === "ArrowDown") {
        e.preventDefault()
        if (historyIndex <= 0) {
          setHistoryIndex(-1)
          setInput("")
          return
        }
        const nextIndex = historyIndex - 1
        setHistoryIndex(nextIndex)
        setInput(cmdHistory[cmdHistory.length - 1 - nextIndex] ?? "")
      }
    },
    [handleSubmit, cmdHistory, historyIndex]
  )

  const handleClear = useCallback(() => {
    setCleared(true)
    setClearSeq(allBlocks.length)
  }, [allBlocks.length])

  return (
    <div className="flex h-full flex-col">
      {/* Output area */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-auto p-4"
        onClick={() => inputRef.current?.focus()}
      >
        {blocks.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">
              {disabled
                ? "Terminal unavailable — box is not running"
                : "Type a command below to get started"}
            </p>
          </div>
        ) : (
          <div className="mx-auto max-w-4xl space-y-3">
            {blocks.map((block, i) => (
              <TerminalBlock
                key={i}
                command={block.command}
                output={block.output}
                isRunning={block.isRunning}
                exitCode={block.exitCode}
              />
            ))}
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="border-t border-border/40 bg-card px-4 py-3">
        <div className="mx-auto flex max-w-4xl items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border/60 bg-inset px-3 py-2 focus-within:border-foreground/20">
            <span className="font-terminal text-sm text-muted-foreground select-none">
              $
            </span>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                setHistoryIndex(-1)
              }}
              onKeyDown={handleKeyDown}
              disabled={disabled}
              placeholder={disabled ? "Box stopped" : "Enter command…"}
              className="min-w-0 flex-1 bg-transparent font-terminal text-sm text-foreground outline-none placeholder:text-muted-foreground/40"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={handleSubmit}
            disabled={disabled || !input.trim()}
            className="text-muted-foreground"
            title="Run command"
          >
            <Send size={14} />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={handleClear}
            disabled={blocks.length === 0}
            className="text-muted-foreground"
            title="Clear terminal"
          >
            <Eraser size={14} />
          </Button>
        </div>
      </div>
    </div>
  )
}
