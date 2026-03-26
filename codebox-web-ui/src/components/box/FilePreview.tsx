import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useBoxFileContent } from "@/net/query"

interface FilePreviewProps {
  boxId: string
  filePath: string | null
  onClose: () => void
}

export function FilePreview({ boxId, filePath, onClose }: FilePreviewProps) {
  const { data: fileContent, isLoading } = useBoxFileContent(boxId, filePath)

  if (!filePath) return null

  return (
    <div className="flex h-full flex-col bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/30 px-3 py-2">
        <span className="min-w-0 flex-1 truncate font-terminal text-xs text-muted-foreground">
          {filePath.replace("/workspace/", "")}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          className="ml-2 shrink-0 text-muted-foreground"
        >
          <X size={14} />
        </Button>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : fileContent?.is_binary ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Binary file — preview not available
          </div>
        ) : (
          <pre className="h-full overflow-auto bg-inset p-4 font-terminal text-sm text-foreground/90">
            {fileContent?.content ?? "Unable to read file"}
          </pre>
        )}
      </div>
    </div>
  )
}
