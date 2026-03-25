import { useState, useCallback, useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { HugeiconsIcon } from "@hugeicons/react"
import { Loading03Icon } from "@hugeicons/core-free-icons"
import { TreeView, type TreeDataItem } from "@/components/tree-view"
import { useBoxFiles, useBoxFileContent } from "@/net/query"
import type { FileEntry } from "@/net/http/types"
import { Folder, File, ArrowLeft, PanelLeftClose } from "lucide-react"

function entriesToTreeItems(entries: FileEntry[]): TreeDataItem[] {
  return entries.map((entry) => ({
    id: entry.path,
    name: entry.name,
    icon: entry.is_dir ? Folder : File,
    // Directories start with an empty children array so TreeView renders them as nodes
    children: entry.is_dir ? [] : undefined,
  }))
}

export function FileExplorer({ boxId, onClose }: { boxId: string; onClose?: () => void }) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [treeData, setTreeData] = useState<TreeDataItem[]>([])
  const queryClient = useQueryClient()

  const { data: rootFiles } = useBoxFiles(boxId, "/workspace")
  const { data: fileContent, isLoading: isLoadingContent } =
    useBoxFileContent(boxId, selectedFile)

  // Initialize tree data from root files
  useEffect(() => {
    if (rootFiles?.entries) {
      setTreeData(entriesToTreeItems(rootFiles.entries))
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
          {onClose && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onClose}
              title="Close file explorer"
            >
              <PanelLeftClose size={14} />
            </Button>
          )}
        </div>
      </div>

      {selectedFile ? (
        /* File content viewer */
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-1.5 border-b px-2 py-1.5">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setSelectedFile(null)}
              title="Back to file tree"
            >
              <ArrowLeft size={14} />
            </Button>
            <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
              {selectedFile.split("/").pop()}
            </span>
            {fileContent?.truncated && (
              <span className="flex-shrink-0 text-xs text-warning">(truncated)</span>
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
          {treeData.length > 0 ? (
            <LazyTreeView
              boxId={boxId}
              data={treeData}
              setData={setTreeData}
              onSelectChange={handleSelectChange}
            />
          ) : (
            <div className="space-y-0.5 p-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-24" />
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
