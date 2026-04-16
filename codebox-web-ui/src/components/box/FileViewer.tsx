import { Download } from "lucide-react"

import { BinaryFallback } from "./previews/BinaryFallback"
import { CodePreview } from "./previews/CodePreview"
import { MarkdownPreview } from "./previews/MarkdownPreview"
import { MediaPreview } from "./previews/MediaPreview"
import { PdfPreview } from "./previews/PdfPreview"

import { Spinner } from "@/components/ui/spinner"
import { api } from "@/net/http/api"
import { useBoxFileContent } from "@/net/query"
import { useActiveProjectSlug } from "@/hooks/useActiveProjectSlug"

// ---------------------------------------------------------------------------
// File type classification (shared with FilePreview)
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
  "png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp",
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
  if (!isBinary) {
    if (MARKDOWN_EXTENSIONS.has(ext)) return "markdown"
    return "code"
  }
  return "binary"
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface FileViewerProps {
  boxId: string
  filePath: string | null
}

export function FileViewer({ boxId, filePath }: FileViewerProps) {
  const slug = useActiveProjectSlug() ?? undefined
  const { data: fileContent, isLoading } = useBoxFileContent(slug, boxId, filePath)

  if (!filePath) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Select a file to view
      </div>
    )
  }

  const downloadUrl = slug ? api.boxes.getDownloadUrl(slug, boxId, filePath) : ""
  const inlineUrl = slug ? api.boxes.getInlineUrl(slug, boxId, filePath) : ""
  const fileName = filePath.split("/").pop() ?? ""
  const displayPath = filePath.replace("/workspace/", "")

  const category =
    fileContent ? getFileCategory(filePath, fileContent.is_binary) : null

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/40 px-4 py-2">
        <span className="min-w-0 truncate font-terminal text-sm text-foreground/80">
          {displayPath}
        </span>
        <a
          href={downloadUrl}
          download
          className="ml-2 inline-flex shrink-0 items-center justify-center rounded-md p-1 text-muted-foreground hover:text-foreground"
          title="Download file"
        >
          <Download size={14} />
        </a>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : !fileContent ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Unable to read file
          </div>
        ) : category === "image" ? (
          <div className="flex items-center justify-center p-4">
            <img
              src={downloadUrl}
              alt={fileName}
              className="max-h-[70vh] max-w-full rounded-md object-contain"
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
          <CodePreview code={fileContent.content} filename={fileName} />
        ) : (
          <BinaryFallback
            fileName={fileName}
            size={fileContent.size}
            downloadUrl={downloadUrl}
          />
        )}
      </div>
    </div>
  )
}
