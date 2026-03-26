import { useState, useCallback, useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tree, Folder, File, type TreeViewElement } from "@/components/ui/file-tree"
import { useBoxFiles, useBoxFileContent } from "@/net/query"
import type { FileEntry } from "@/net/http/types"
import { ArrowLeft, RotateCw, Download } from "lucide-react"

function entriesToTreeElements(entries: FileEntry[]): TreeViewElement[] {
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
  const [treeElements, setTreeElements] = useState<TreeViewElement[]>([])
  const loadedDirsRef = useRef<Set<string>>(new Set())
  const queryClient = useQueryClient()

  const { data: rootFiles, isLoading: isLoadingFiles } = useBoxFiles(boxId, "/workspace")
  const { data: fileContent, isLoading: isLoadingContent } =
    useBoxFileContent(boxId, selectedFile)

  useEffect(() => {
    if (rootFiles?.entries) {
      const filtered = rootFiles.entries.filter(
        (e) => !(e.is_dir && e.path === "/workspace"),
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
        if (result?.entries) {
          const children = entriesToTreeElements(result.entries)
          setTreeElements((prev) => updateTreeChildren(prev, dirPath, children))
        }
      } catch {
        loadedDirsRef.current.delete(dirPath)
      }
    },
    [boxId, queryClient],
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
    [treeElements, loadDirChildren],
  )

  if (selectedFile) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-1.5 border-b border-border/50 px-3 py-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setSelectedFile(null)}
            title="Back to file tree"
          >
            <ArrowLeft size={14} />
          </Button>
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
            {selectedFile.replace("/workspace/", "")}
          </span>
          {fileContent?.truncated && (
            <span className="shrink-0 text-[10px] font-medium text-warning">(truncated)</span>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              if (!fileContent?.content) return
              const blob = new Blob([fileContent.content], { type: "application/octet-stream" })
              const url = URL.createObjectURL(blob)
              const a = document.createElement("a")
              a.href = url
              a.download = selectedFile.split("/").pop() ?? "file"
              a.click()
              URL.revokeObjectURL(url)
            }}
            disabled={isLoadingContent || !fileContent?.content}
            title="Download file"
          >
            <Download size={14} />
          </Button>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          {isLoadingContent ? (
            <div className="space-y-1.5 p-4">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-3/4" />
              <Skeleton className="h-3.5 w-1/2" />
            </div>
          ) : (
            <pre className="overflow-auto p-4 font-mono text-xs leading-relaxed text-foreground/80">
              {fileContent?.content ?? "Unable to read file"}
            </pre>
          )}
        </ScrollArea>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1.5 border-b border-border/50 px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">Files</span>
        <div className="ml-auto">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="Refresh files"
          >
            <RotateCw size={14} className={isRefreshing ? "animate-spin" : ""} />
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {isLoadingFiles ? (
          <div className="space-y-1 p-4">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-28" />
          </div>
        ) : treeElements.length > 0 ? (
          <Tree elements={treeElements} className="py-2 text-sm">
            {renderElements(treeElements, handleItemClick)}
          </Tree>
        ) : (
          <div className="flex h-32 items-center justify-center">
            <p className="text-xs text-muted-foreground">No files yet</p>
          </div>
        )}
      </div>
    </div>
  )
}

function renderElements(
  elements: TreeViewElement[],
  onSelect: (id: string) => void,
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
        <Folder key={el.id} value={el.id} element={el.name} onClick={() => onSelect(el.id)}>
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
  elements: TreeViewElement[],
  targetId: string,
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

function updateTreeChildren(
  items: TreeViewElement[],
  targetId: string,
  children: TreeViewElement[],
): TreeViewElement[] {
  return items.map((item) => {
    if (item.id === targetId) {
      return { ...item, children }
    }
    if (item.children && item.children.length > 0) {
      return { ...item, children: updateTreeChildren(item.children, targetId, children) }
    }
    return item
  })
}
