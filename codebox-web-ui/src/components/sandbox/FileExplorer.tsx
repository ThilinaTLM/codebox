import { useState } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useSandboxFiles, useSandboxFileContent } from "@/net/query"
import type { FileEntry } from "@/net/http/types"

export function FileExplorer({ sandboxId }: { sandboxId: string }) {
  const [currentPath, setCurrentPath] = useState("/workspace")
  const [selectedFile, setSelectedFile] = useState<string | null>(null)

  const { data: fileList, isLoading, refetch } = useSandboxFiles(sandboxId, currentPath)
  const { data: fileContent, isLoading: isLoadingContent } =
    useSandboxFileContent(sandboxId, selectedFile)

  const breadcrumbs = currentPath.split("/").filter(Boolean)

  const handleEntryClick = (entry: FileEntry) => {
    if (entry.is_dir) {
      setCurrentPath(entry.path)
      setSelectedFile(null)
    } else {
      setSelectedFile(entry.path)
    }
  }

  const navigateTo = (pathIndex: number) => {
    const newPath = "/" + breadcrumbs.slice(0, pathIndex + 1).join("/")
    setCurrentPath(newPath)
    setSelectedFile(null)
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Files
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          className="h-6 px-2 text-xs"
        >
          Refresh
        </Button>
      </div>

      {/* Breadcrumbs */}
      <div className="flex flex-wrap items-center gap-0.5 border-b px-3 py-1.5">
        <button
          onClick={() => { setCurrentPath("/workspace"); setSelectedFile(null) }}
          className="font-mono text-xs text-primary hover:underline"
        >
          /
        </button>
        {breadcrumbs.map((part, i) => (
          <span key={i} className="flex items-center gap-0.5">
            <span className="font-mono text-xs text-muted-foreground">/</span>
            <button
              onClick={() => navigateTo(i)}
              className="font-mono text-xs text-primary hover:underline"
            >
              {part}
            </button>
          </span>
        ))}
      </div>

      {/* File list or content */}
      {selectedFile ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b px-3 py-1.5">
            <button
              onClick={() => setSelectedFile(null)}
              className="font-mono text-xs text-primary hover:underline"
            >
              Back
            </button>
            <span className="truncate font-mono text-xs text-muted-foreground">
              {selectedFile.split("/").pop()}
            </span>
            {fileContent?.truncated && (
              <span className="font-mono text-xs text-warning">
                (truncated)
              </span>
            )}
          </div>
          <ScrollArea className="flex-1">
            {isLoadingContent ? (
              <div className="space-y-1 p-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : (
              <pre className="p-3 font-mono text-sm leading-relaxed text-foreground/80">
                {fileContent?.content ?? "Unable to read file"}
              </pre>
            )}
          </ScrollArea>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="space-y-1 p-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          ) : (
            <div className="py-1">
              {fileList?.entries.length === 0 && (
                <p className="p-3 font-mono text-xs text-muted-foreground">
                  Empty directory
                </p>
              )}
              {fileList?.entries.map((entry) => (
                <button
                  key={entry.path}
                  onClick={() => handleEntryClick(entry)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-muted/50"
                >
                  <span className="font-mono text-xs text-muted-foreground">
                    {entry.is_dir ? "dir" : "file"}
                  </span>
                  <span
                    className={`truncate font-mono text-sm ${
                      entry.is_dir ? "text-primary" : "text-foreground/80"
                    }`}
                  >
                    {entry.name}
                    {entry.is_dir ? "/" : ""}
                  </span>
                  {entry.size != null && !entry.is_dir && (
                    <span className="ml-auto font-mono text-xs text-muted-foreground">
                      {formatSize(entry.size)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      )}
    </div>
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`
}
