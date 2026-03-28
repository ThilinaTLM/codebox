import { useCallback, useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { RotateCw } from "lucide-react"
import type { FileEntry } from "@/net/http/types"
import type { TreeViewElement } from "@/components/ui/file-tree"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { File, Folder, Tree } from "@/components/ui/file-tree"
import { useBoxFiles } from "@/net/query"

function getFileColorClass(name: string, isDir: boolean): string {
  if (isDir) return "text-primary/60"
  const ext = name.includes(".") ? name.split(".").pop()?.toLowerCase() : ""
  switch (ext) {
    case "ts":
    case "tsx":
      return "text-file-ts"
    case "py":
      return "text-file-py"
    case "json":
      return "text-file-json"
    case "md":
      return "text-muted-foreground"
    case "css":
      return "text-file-css"
    default:
      return "text-muted-foreground"
  }
}

function entriesToTreeElements(
  entries: Array<FileEntry>,
  binaryFiles?: Set<string>
): Array<TreeViewElement> {
  return entries.map((entry) => {
    if (binaryFiles && entry.is_binary) binaryFiles.add(entry.path)
    return {
      id: entry.path,
      name: entry.name,
      type: entry.is_dir ? ("folder" as const) : ("file" as const),
      children: entry.is_dir ? [] : undefined,
    }
  })
}

export function FileExplorer({
  boxId,
  onFileSelect,
}: {
  boxId: string
  onFileSelect?: (path: string) => void
}) {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [treeElements, setTreeElements] = useState<Array<TreeViewElement>>([])
  const loadedDirsRef = useRef<Set<string>>(new Set())
  const binaryFilesRef = useRef<Set<string>>(new Set())
  const queryClient = useQueryClient()

  const { data: rootFiles, isLoading: isLoadingFiles } = useBoxFiles(
    boxId,
    "/workspace"
  )

  useEffect(() => {
    if (rootFiles?.entries) {
      const filtered = rootFiles.entries.filter(
        (e) => !(e.is_dir && e.path === "/workspace")
      )
      setTreeElements(entriesToTreeElements(filtered, binaryFilesRef.current))
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
        const children = entriesToTreeElements(result.entries, binaryFilesRef.current)
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
    binaryFilesRef.current.clear()
    await queryClient.invalidateQueries({
      queryKey: ["boxes", boxId, "files"],
    })
    setIsRefreshing(false)
  }, [queryClient, boxId])

  const handleItemClick = useCallback(
    (id: string) => {
      const el = findTreeElement(treeElements, id)
      if (!el) return
      if (el.type === "folder" && el.children?.length === 0) {
        loadDirChildren(id)
      } else if (el.type !== "folder") {
        onFileSelect?.(id)
      }
    },
    [treeElements, loadDirChildren, onFileSelect]
  )

  return (
    <div className="relative flex h-full flex-col bg-card">
      <div className="flex items-center justify-between border-b border-border/30 px-3 py-2">
        <span className="font-terminal text-xs text-muted-foreground">Files</span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
          title="Refresh files"
          className="text-muted-foreground/50"
        >
          <RotateCw
            size={13}
            className={isRefreshing ? "animate-spin" : ""}
          />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {isLoadingFiles ? (
          <div className="space-y-1 p-4">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-28" />
          </div>
        ) : treeElements.length > 0 ? (
          <Tree elements={treeElements} className="p-3 text-sm">
            {renderElements(treeElements, handleItemClick, binaryFilesRef.current)}
          </Tree>
        ) : (
          <div className="flex h-32 items-center justify-center">
            <p className="text-sm text-muted-foreground">No files yet</p>
          </div>
        )}
      </div>
    </div>
  )
}

function renderElements(
  elements: Array<TreeViewElement>,
  onSelect: (id: string) => void,
  binaryFiles: Set<string>
): React.ReactNode {
  const sorted = [...elements].sort((a, b) => {
    const aFolder = a.type === "folder"
    const bFolder = b.type === "folder"
    if (aFolder !== bFolder) return aFolder ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { numeric: true })
  })

  return sorted.map((el) => {
    const colorClass = getFileColorClass(el.name, el.type === "folder")
    if (el.type === "folder") {
      return (
        <Folder
          key={el.id}
          value={el.id}
          element={el.name}
          onClick={() => onSelect(el.id)}
          className={colorClass}
        >
          {el.children && el.children.length > 0
            ? renderElements(el.children, onSelect, binaryFiles)
            : null}
        </Folder>
      )
    }
    const isBinary = binaryFiles.has(el.id)
    return (
      <File key={el.id} value={el.id} onClick={() => onSelect(el.id)}>
        <span className={colorClass}>{el.name}</span>
        {isBinary && (
          <span className="ml-1 text-[10px] text-muted-foreground/50">bin</span>
        )}
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
