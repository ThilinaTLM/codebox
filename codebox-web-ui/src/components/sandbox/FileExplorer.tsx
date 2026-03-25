import { useState, useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowDown01Icon, ArrowRight01Icon, Cancel01Icon, Loading03Icon } from "@hugeicons/core-free-icons"
import { useSandboxFiles, useSandboxFileContent } from "@/net/query"
import type { FileEntry } from "@/net/http/types"

export function FileExplorer({ sandboxId }: { sandboxId: string }) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const queryClient = useQueryClient()
  const { data: fileContent, isLoading: isLoadingContent } =
    useSandboxFileContent(sandboxId, selectedFile)

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    await queryClient.invalidateQueries({
      queryKey: ["sandboxes", sandboxId, "files"],
    })
    if (selectedFile) {
      await queryClient.invalidateQueries({
        queryKey: ["sandboxes", sandboxId, "file-content", selectedFile],
      })
    }
    setIsRefreshing(false)
  }, [queryClient, sandboxId, selectedFile])

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">Files</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="xs"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <HugeiconsIcon
              icon={Loading03Icon}
              size={12}
              className={isRefreshing ? "animate-spin" : ""}
            />
            <span className="ml-1">Refresh</span>
          </Button>
          {selectedFile && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setSelectedFile(null)}
            >
              <HugeiconsIcon icon={Cancel01Icon} size={12} />
            </Button>
          )}
        </div>
      </div>

      {selectedFile ? (
        /* File content viewer */
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b px-3 py-1.5">
            <span className="truncate font-mono text-xs text-muted-foreground">
              {selectedFile.split("/").pop()}
            </span>
            {fileContent?.truncated && (
              <span className="text-xs text-warning">(truncated)</span>
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
        /* Tree view */
        <ScrollArea className="flex-1">
          <div className="py-1">
            <FileTreeLevel
              sandboxId={sandboxId}
              path="/workspace"
              depth={0}
              onSelectFile={setSelectedFile}
              defaultExpanded
            />
          </div>
        </ScrollArea>
      )}
    </div>
  )
}

function FileTreeLevel({
  sandboxId,
  path,
  depth,
  onSelectFile,
  defaultExpanded = false,
}: {
  sandboxId: string
  path: string
  depth: number
  onSelectFile: (path: string) => void
  defaultExpanded?: boolean
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const { data: fileList, isLoading } = useSandboxFiles(
    sandboxId,
    path,
  )

  if (!expanded && !defaultExpanded) return null

  if (isLoading) {
    return (
      <div className="space-y-0.5 py-0.5" style={{ paddingLeft: `${depth * 16 + 8}px` }}>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-5 w-24" />
      </div>
    )
  }

  return (
    <>
      {fileList?.entries.map((entry) => (
        <FileTreeNode
          key={entry.path}
          entry={entry}
          sandboxId={sandboxId}
          depth={depth}
          onSelectFile={onSelectFile}
        />
      ))}
      {fileList?.entries.length === 0 && (
        <div
          className="py-1 text-xs text-muted-foreground/50"
          style={{ paddingLeft: `${depth * 16 + 28}px` }}
        >
          Empty
        </div>
      )}
    </>
  )
}

function FileTreeNode({
  entry,
  sandboxId,
  depth,
  onSelectFile,
}: {
  entry: FileEntry
  sandboxId: string
  depth: number
  onSelectFile: (path: string) => void
}) {
  const [expanded, setExpanded] = useState(false)

  const handleClick = () => {
    if (entry.is_dir) {
      setExpanded(!expanded)
    } else {
      onSelectFile(entry.path)
    }
  }

  return (
    <>
      <button
        onClick={handleClick}
        className="flex w-full items-center gap-1 rounded-sm px-1 py-1 text-left transition-colors hover:bg-muted/50"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {entry.is_dir ? (
          <HugeiconsIcon
            icon={expanded ? ArrowDown01Icon : ArrowRight01Icon}
            size={12}
            className="shrink-0 text-muted-foreground"
          />
        ) : (
          <span className="inline-block size-3 shrink-0" />
        )}
        <span
          className={`truncate font-mono text-xs ${
            entry.is_dir ? "font-medium text-foreground" : "text-foreground/70"
          }`}
        >
          {entry.name}
        </span>
        {entry.size != null && !entry.is_dir && (
          <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground/50">
            {formatSize(entry.size)}
          </span>
        )}
      </button>
      {entry.is_dir && expanded && (
        <FileTreeLevel
          sandboxId={sandboxId}
          path={entry.path}
          depth={depth + 1}
          onSelectFile={onSelectFile}
        />
      )}
    </>
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`
}
