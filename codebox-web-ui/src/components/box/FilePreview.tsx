import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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

  const downloadUrl = filePath ? api.boxes.getDownloadUrl(boxId, filePath) : ""
  const fileName = filePath?.split("/").pop() ?? ""

  return (
    <Dialog open={!!filePath} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="min-w-0 truncate font-terminal text-sm">
              {filePath?.replace("/workspace/", "") ?? ""}
            </span>
            {filePath && (
              <a
                href={downloadUrl}
                download
                className="ml-auto inline-flex shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                title="Download file"
              >
                <Download size={14} />
              </a>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="max-h-[70vh] min-h-[200px] overflow-auto">
          {isLoading ? (
            <div className="flex h-[200px] items-center justify-center">
              <Spinner />
            </div>
          ) : fileContent?.is_binary && isImageFile(filePath!) ? (
            <div className="flex flex-col items-center gap-4">
              <img
                src={downloadUrl}
                alt={fileName}
                className="max-h-[60vh] max-w-full rounded-md object-contain"
              />
              <a href={downloadUrl} download>
                <Button variant="outline" className="gap-2">
                  <Download size={14} />
                  Download
                </Button>
              </a>
            </div>
          ) : fileContent?.is_binary ? (
            <div className="flex h-[200px] flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
              <span>Binary file — preview not available</span>
              <a href={downloadUrl} download>
                <Button variant="outline" className="gap-2">
                  <Download size={14} />
                  Download
                </Button>
              </a>
            </div>
          ) : (
            <pre className="overflow-auto rounded-md bg-inset p-4 font-terminal text-sm text-foreground/90">
              {fileContent?.content ?? "Unable to read file"}
            </pre>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
