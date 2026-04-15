import { Download } from "lucide-react"

import { BinaryFallback } from "./previews/BinaryFallback"
import { CodePreview } from "./previews/CodePreview"
import { MarkdownPreview } from "./previews/MarkdownPreview"
import { MediaPreview } from "./previews/MediaPreview"
import { PdfPreview } from "./previews/PdfPreview"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { api } from "@/net/http/api"
import { useBoxFileContent } from "@/net/query"

// ---------------------------------------------------------------------------
// File type classification
// ---------------------------------------------------------------------------

type FileCategory =
  | "image"
  | "pdf"
  | "video"
  | "audio"
  | "markdown"
  | "code"
  | "binary"

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

const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "ogg", "mov", "avi"])

const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "flac", "aac", "m4a", "wma"])

const MARKDOWN_EXTENSIONS = new Set(["md", "mdx"])

function getFileCategory(path: string, isBinary: boolean): FileCategory {
  const ext = path.split(".").pop()?.toLowerCase() ?? ""

  if (IMAGE_EXTENSIONS.has(ext)) return "image"
  if (ext === "pdf") return "pdf"
  if (VIDEO_EXTENSIONS.has(ext)) return "video"
  if (AUDIO_EXTENSIONS.has(ext)) return "audio"

  // Text-based categories (only when not detected as binary)
  if (!isBinary) {
    if (MARKDOWN_EXTENSIONS.has(ext)) return "markdown"
    return "code"
  }

  return "binary"
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface FilePreviewProps {
  boxId: string
  filePath: string | null
  onClose: () => void
}

export function FilePreview({ boxId, filePath, onClose }: FilePreviewProps) {
  const { data: fileContent, isLoading } = useBoxFileContent(boxId, filePath)

  const downloadUrl = filePath ? api.boxes.getDownloadUrl(boxId, filePath) : ""
  const inlineUrl = filePath ? api.boxes.getInlineUrl(boxId, filePath) : ""
  const fileName = filePath?.split("/").pop() ?? ""
  const displayPath = filePath?.replace("/workspace/", "") ?? ""

  const category = filePath && fileContent
    ? getFileCategory(filePath, fileContent.is_binary)
    : null

  return (
    <Dialog open={!!filePath} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6">
            <span className="font-terminal min-w-0 truncate text-sm">
              {displayPath}
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
          ) : !fileContent ? (
            <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
              Unable to read file
            </div>
          ) : category === "image" ? (
            <div className="flex items-center justify-center">
              <img
                src={downloadUrl}
                alt={fileName}
                className="max-h-[60vh] max-w-full rounded-md object-contain"
              />
            </div>
          ) : category === "pdf" ? (
            <PdfPreview
              inlineUrl={inlineUrl}
              downloadUrl={downloadUrl}
              fileName={fileName}
            />
          ) : category === "video" ? (
            <MediaPreview
              type="video"
              src={downloadUrl}
              downloadUrl={downloadUrl}
              fileName={fileName}
            />
          ) : category === "audio" ? (
            <MediaPreview
              type="audio"
              src={downloadUrl}
              downloadUrl={downloadUrl}
              fileName={fileName}
            />
          ) : category === "markdown" ? (
            <MarkdownPreview content={fileContent.content} />
          ) : category === "code" ? (
            <CodePreview
              code={fileContent.content}
              filename={fileName}
            />
          ) : (
            <BinaryFallback
              fileName={fileName}
              size={fileContent.size}
              downloadUrl={downloadUrl}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
