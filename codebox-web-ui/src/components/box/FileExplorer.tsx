import { useCallback, useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Download, FileIcon, RotateCw } from "lucide-react"
import type { FileEntry } from "@/net/http/types"
import type { TreeViewElement } from "@/components/ui/file-tree"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { File, Folder, Tree } from "@/components/ui/file-tree"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useBoxFileContent, useBoxFiles } from "@/net/query"

function entriesToTreeElements(
  entries: Array<FileEntry>
): Array<TreeViewElement> {
  return entries.map((entry) => ({
    id: entry.path,
    name: entry.name,
    type: entry.is_dir ? ("folder" as const) : ("file" as const),
    children: entry.is_dir ? [] : undefined,
  }))
}

export function FileExplorer({ boxId }: { boxId: string }) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [treeElements, setTreeElements] = useState<Array<TreeViewElement>>([])
  const loadedDirsRef = useRef<Set<string>>(new Set())
  const queryClient = useQueryClient()

  const { data: rootFiles, isLoading: isLoadingFiles } = useBoxFiles(
    boxId,
    "/workspace"
  )
  const { data: fileContent, isLoading: isLoadingContent } = useBoxFileContent(
    boxId,
    selectedFile
  )

  useEffect(() => {
    if (rootFiles?.entries) {
      const filtered = rootFiles.entries.filter(
        (e) => !(e.is_dir && e.path === "/workspace")
      )
      setTreeElements(entriesToTreeElements(filtered))
    }
  }, [rootFiles])

  const loadDirChildren = useCallback(
    async (dirPath: string) => {
      if (loadedDirsRef.current.has(dirPath)) return
      loadedDirsRef.current.add(dirPath)
      try {
        const result = await queryClient.fetchQuery({
          queryKey: ["boxes", boxId, "files", dirPath],
          queryFn: async () => {
            const { api } = await import("@/net/http/api")
            return api.boxes.listFiles(boxId, dirPath)
          },
          staleTime: 10000,
        })
        const children = entriesToTreeElements(result.entries)
        setTreeElements((prev) => updateTreeChildren(prev, dirPath, children))
      } catch {
        loadedDirsRef.current.delete(dirPath)
      }
    },
    [boxId, queryClient]
  )

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    loadedDirsRef.current.clear()
    await queryClient.invalidateQueries({
      queryKey: ["boxes", boxId, "files"],
    })
    if (selectedFile) {
      await queryClient.invalidateQueries({
        queryKey: ["boxes", boxId, "file-content", selectedFile],
      })
    }
    setIsRefreshing(false)
  }, [queryClient, boxId, selectedFile])

  const handleItemClick = useCallback(
    (id: string) => {
      const el = findTreeElement(treeElements, id)
      if (!el) return
      if (el.type === "folder" && el.children?.length === 0) {
        loadDirChildren(id)
      } else if (el.type !== "folder") {
        setSelectedFile(id)
      }
    },
    [treeElements, loadDirChildren]
  )

  const handleDownload = useCallback(() => {
    if (!fileContent || !selectedFile) return
    let blob: Blob
    if (fileContent.is_binary && fileContent.content_base64) {
      const binaryStr = atob(fileContent.content_base64)
      const bytes = new Uint8Array(binaryStr.length)
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i)
      }
      blob = new Blob([bytes], { type: "application/octet-stream" })
    } else {
      blob = new Blob([fileContent.content], { type: "text/plain" })
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = selectedFile.split("/").pop() ?? "file"
    a.click()
    URL.revokeObjectURL(url)
  }, [fileContent, selectedFile])

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="relative flex h-full flex-col">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={handleRefresh}
        disabled={isRefreshing}
        title="Refresh files"
        className="absolute top-1.5 right-1.5 z-10 text-muted-foreground/50"
      >
        <RotateCw
          size={13}
          className={isRefreshing ? "animate-spin" : ""}
        />
      </Button>
      <div className="min-h-0 flex-1 overflow-hidden">
        {isLoadingFiles ? (
          <div className="space-y-1 p-4">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-28" />
          </div>
        ) : treeElements.length > 0 ? (
          <Tree elements={treeElements} className="p-3 text-sm">
            {renderElements(treeElements, handleItemClick)}
          </Tree>
        ) : (
          <div className="flex h-32 items-center justify-center">
            <p className="text-sm text-muted-foreground">No files yet</p>
          </div>
        )}
      </div>

      {/* File content dialog */}
      <Dialog
        open={!!selectedFile}
        onOpenChange={(open) => {
          if (!open) setSelectedFile(null)
        }}
      >
        <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm font-normal">
              {selectedFile?.replace("/workspace/", "")}
            </DialogTitle>
            {fileContent && (
              <DialogDescription>
                {formatSize(fileContent.size)}
                {fileContent.truncated && " (truncated)"}
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-auto">
            {isLoadingContent ? (
              <div className="space-y-1.5 p-4">
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3.5 w-1/2" />
              </div>
            ) : fileContent?.is_binary ||
              isBinaryContent(fileContent?.content) ? (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
                <FileIcon size={32} strokeWidth={1.5} />
                <p className="text-sm">Binary file — preview not available</p>
              </div>
            ) : (
              <ScrollArea className="max-h-[60vh]">
                <pre className="rounded-lg bg-muted p-4 font-mono text-sm leading-relaxed text-foreground/80">
                  {fileContent?.content ?? "Unable to read file"}
                </pre>
              </ScrollArea>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              disabled={isLoadingContent || !fileContent}
            >
              <Download size={14} />
              Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function renderElements(
  elements: Array<TreeViewElement>,
  onSelect: (id: string) => void
): React.ReactNode {
  const sorted = [...elements].sort((a, b) => {
    const aFolder = a.type === "folder"
    const bFolder = b.type === "folder"
    if (aFolder !== bFolder) return aFolder ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { numeric: true })
  })

  return sorted.map((el) => {
    if (el.type === "folder") {
      return (
        <Folder
          key={el.id}
          value={el.id}
          element={el.name}
          onClick={() => onSelect(el.id)}
        >
          {el.children && el.children.length > 0
            ? renderElements(el.children, onSelect)
            : null}
        </Folder>
      )
    }
    return (
      <File key={el.id} value={el.id} onClick={() => onSelect(el.id)}>
        <span>{el.name}</span>
      </File>
    )
  })
}

function findTreeElement(
  elements: Array<TreeViewElement>,
  targetId: string
): TreeViewElement | null {
  for (const el of elements) {
    if (el.id === targetId) return el
    if (el.children) {
      const found = findTreeElement(el.children, targetId)
      if (found) return found
    }
  }
  return null
}

function isBinaryContent(content?: string): boolean {
  if (!content) return false
  return content.includes("\uFFFD") || content.includes("\x00")
}

function updateTreeChildren(
  items: Array<TreeViewElement>,
  targetId: string,
  children: Array<TreeViewElement>
): Array<TreeViewElement> {
  return items.map((item) => {
    if (item.id === targetId) {
      return { ...item, children }
    }
    if (item.children && item.children.length > 0) {
      return {
        ...item,
        children: updateTreeChildren(item.children, targetId, children),
      }
    }
    return item
  })
}
