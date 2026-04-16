import { useCallback, useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { RotateCw, Upload } from "lucide-react"
import type { TreeViewElement } from "@/components/ui/file-tree"
import {
  countElements,
  entriesToTreeElements,
  findTreeElement,
  getFileColorClass,
  updateTreeChildren,
} from "@/lib/tree-utils"
import { Button } from "@/components/ui/button"
import { File, Folder, Tree } from "@/components/ui/file-tree"
import { Skeleton } from "@/components/ui/skeleton"
import { useBoxFiles, useUploadFile } from "@/net/query"
import { useActiveProjectSlug } from "@/hooks/useActiveProjectSlug"

export function FileExplorer({
  boxId,
  onFileSelect,
  disabled,
}: {
  boxId: string
  onFileSelect?: (path: string) => void
  disabled?: boolean
}) {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [treeElements, setTreeElements] = useState<Array<TreeViewElement>>([])
  const loadedDirsRef = useRef<Set<string>>(new Set())
  const binaryFilesRef = useRef<Set<string>>(new Set())
  const queryClient = useQueryClient()

  const slug = useActiveProjectSlug() ?? ""
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadMutation = useUploadFile(slug, boxId)

  const { data: rootFiles, isLoading: isLoadingFiles } = useBoxFiles(
    slug || undefined,
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
            return api.boxes.listFiles(slug, boxId, dirPath)
          },
          staleTime: 10000,
        })
        const children = entriesToTreeElements(
          result.entries,
          binaryFilesRef.current
        )
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
      <div className="flex items-center justify-between border-b border-border/40 px-3 py-2">
        <span className="text-label">
          Files{disabled ? " (stopped)" : treeElements.length > 0 ? ` (${countElements(treeElements)})` : ""}
        </span>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || uploadMutation.isPending}
            title="Upload file"
            className="text-muted-foreground/50"
          >
            <Upload size={13} />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (file) {
                await uploadMutation.mutateAsync({ path: "/workspace", file })
                await handleRefresh()
              }
              e.target.value = ""
            }}
          />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleRefresh}
            disabled={isRefreshing || disabled}
            title="Refresh files"
            className="text-muted-foreground/50"
          >
            <RotateCw size={13} className={isRefreshing ? "animate-spin" : ""} />
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
          <Tree elements={treeElements} className="p-3 text-sm font-terminal">
            {renderElements(
              treeElements,
              handleItemClick,
              binaryFilesRef.current
            )}
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
          <span className="ml-1 text-2xs text-muted-foreground/50">bin</span>
        )}
      </File>
    )
  })
}


