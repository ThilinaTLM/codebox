import { Download, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useBoxFileContent } from "@/net/query"
import { api } from "@/net/http/api"

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "svg",
  "webp",
  "ico",
  "bmp",
])

function isImageFile(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() ?? ""
  return IMAGE_EXTENSIONS.has(ext)
}

interface FilePreviewProps {
  boxId: string
  filePath: string | null
  onClose: () => void
}

export function FilePreview({ boxId, filePath, onClose }: FilePreviewProps) {
  const { data: fileContent, isLoading } = useBoxFileContent(boxId, filePath)

  if (!filePath) return null

  const downloadUrl = api.boxes.getDownloadUrl(boxId, filePath)

  return (
    <div className="flex h-full flex-col bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/30 px-3 py-2">
        <span className="min-w-0 flex-1 truncate font-terminal text-xs text-muted-foreground">
          {filePath.replace("/workspace/", "")}
        </span>
        <div className="ml-2 flex shrink-0 items-center gap-1">
          <a
            href={downloadUrl}
            download
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
            title="Download file"
          >
            <Download size={14} />
          </a>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            className="text-muted-foreground"
          >
            <X size={14} />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : fileContent?.is_binary && isImageFile(filePath) ? (
          <div className="flex h-full items-center justify-center p-4">
            <img
              src={downloadUrl}
              alt={filePath.split("/").pop()}
              className="max-h-full max-w-full object-contain"
            />
          </div>
        ) : fileContent?.is_binary ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
            <span>Binary file — preview not available</span>
            <a
              href={downloadUrl}
              download
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
            >
              <Download size={14} />
              Download
            </a>
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
