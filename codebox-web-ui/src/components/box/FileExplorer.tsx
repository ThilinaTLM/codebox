import { useState, useCallback, useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { TreeView, type TreeDataItem } from "@/components/tree-view"
import { useBoxFiles, useBoxFileContent } from "@/net/query"
import type { FileEntry } from "@/net/http/types"
import { Folder, File, ArrowLeft, RotateCw, XCircle, Download } from "lucide-react"

export type ExplorerSize = "sm" | "md" | "lg"

function entriesToTreeItems(entries: FileEntry[]): TreeDataItem[] {
  return entries.map((entry) => ({
    id: entry.path,
    name: entry.name,
    icon: entry.is_dir ? Folder : File,
    // Directories start with an empty children array so TreeView renders them as nodes
    children: entry.is_dir ? [] : undefined,
  }))
}

export function FileExplorer({
  boxId,
  onClose,
  size = "sm",
  onSizeChange,
}: {
  boxId: string
  onClose?: () => void
  size?: ExplorerSize
  onSizeChange?: (size: ExplorerSize) => void
}) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [treeData, setTreeData] = useState<TreeDataItem[]>([])
  const queryClient = useQueryClient()

  const { data: rootFiles, isLoading: isLoadingFiles } = useBoxFiles(boxId, "/workspace")
  const { data: fileContent, isLoading: isLoadingContent } =
    useBoxFileContent(boxId, selectedFile)

  // Initialize tree data from root files, skipping the /workspace root entry if present
  useEffect(() => {
    if (rootFiles?.entries) {
      const filtered = rootFiles.entries.filter(
        (e) => !(e.is_dir && e.path === "/workspace"),
      )
      setTreeData(entriesToTreeItems(filtered))
    }
  }, [rootFiles])

  const handleSelectChange = useCallback(
    (item: TreeDataItem | undefined) => {
      if (!item) return
      const isDir = !!item.children
      if (!isDir) {
        setSelectedFile(item.id)
      }
    },
    [],
  )

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
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

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-1.5 border-b px-2 py-1">
        {onClose && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="h-5 w-5 rounded-full"
            onClick={onClose}
            title="Close file explorer"
          >
            <XCircle size={12} />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          className="h-5 w-5 rounded-full"
          onClick={handleRefresh}
          disabled={isRefreshing}
          title="Refresh files"
        >
          <RotateCw size={12} className={isRefreshing ? "animate-spin" : ""} />
        </Button>
        <span className="mr-auto text-xs font-medium text-muted-foreground">Files</span>
        {onSizeChange && (
          <ToggleGroup
            value={[size]}
            onValueChange={(values) => {
              const next = values.find((v) => v !== size) as ExplorerSize | undefined
              if (next) onSizeChange(next)
            }}
            multiple
            variant="outline"
            size="sm"
            className="h-5"
          >
            {(["sm", "md", "lg"] as const).map((s) => (
              <ToggleGroupItem
                key={s}
                value={s}
                className="h-5 px-1.5 text-[10px] font-medium uppercase"
              >
                {s.toUpperCase()}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
      </div>

      {selectedFile ? (
        /* File content viewer */
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-1.5 border-b px-2 py-1">
            <Button
              variant="ghost"
              size="icon-sm"
              className="h-5 w-5"
              onClick={() => setSelectedFile(null)}
              title="Back to file tree"
            >
              <ArrowLeft size={12} />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="h-5 w-5"
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
              <Download size={12} />
            </Button>
            <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
              {selectedFile.split("/").pop()}
            </span>
            {fileContent?.truncated && (
              <span className="flex-shrink-0 text-xs text-warning">(truncated)</span>
            )}
          </div>
          <ScrollArea className="min-h-0 flex-1">
            {isLoadingContent ? (
              <div className="space-y-1 p-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : (
              <pre className="overflow-auto p-3 font-mono text-sm leading-relaxed text-foreground/80">
                {fileContent?.content ?? "Unable to read file"}
              </pre>
            )}
          </ScrollArea>
        </div>
      ) : (
        /* Tree view */
        <ScrollArea className="min-h-0 flex-1">
          {treeData.length > 0 ? (
            <LazyTreeView
              boxId={boxId}
              data={treeData}
              setData={setTreeData}
              onSelectChange={handleSelectChange}
            />
          ) : isLoadingFiles ? (
            <div className="space-y-0.5 p-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-24" />
            </div>
          ) : (
            <div className="flex h-32 items-center justify-center">
              <p className="text-sm text-muted-foreground">No files yet</p>
            </div>
          )}
        </ScrollArea>
      )}
    </div>
  )
}

/**
 * Wrapper around TreeView that lazy-loads directory contents on expand.
 */
function LazyTreeView({
  boxId,
  data,
  setData,
  onSelectChange,
}: {
  boxId: string
  data: TreeDataItem[]
  setData: React.Dispatch<React.SetStateAction<TreeDataItem[]>>
  onSelectChange: (item: TreeDataItem | undefined) => void
}) {
  const queryClient = useQueryClient()

  const handleSelect = useCallback(
    async (item: TreeDataItem | undefined) => {
      if (!item) return

      const isDir = !!item.children
      if (isDir && item.children && item.children.length === 0) {
        // Lazy-load children
        try {
          const result = await queryClient.fetchQuery({
            queryKey: ["boxes", boxId, "files", item.id],
            queryFn: async () => {
              const { api } = await import("@/net/http/api")
              return api.boxes.listFiles(boxId, item.id)
            },
            staleTime: 10000,
          })

          if (result?.entries) {
            const children = entriesToTreeItems(result.entries)
            setData((prev) => updateTreeChildren(prev, item.id, children))
          }
        } catch {
          // silently fail
        }
      }

      onSelectChange(item)
    },
    [boxId, queryClient, setData, onSelectChange],
  )

  return (
    <TreeView
      data={data}
      onSelectChange={handleSelect}
      defaultNodeIcon={Folder}
      defaultLeafIcon={File}
      className="text-sm"
    />
  )
}

/** Recursively update a node's children in the tree data. */
function updateTreeChildren(
  items: TreeDataItem[],
  targetId: string,
  children: TreeDataItem[],
): TreeDataItem[] {
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
