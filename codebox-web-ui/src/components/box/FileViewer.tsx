import { Download } from "lucide-react"

import { BinaryFallback } from "./previews/BinaryFallback"
import { CodePreview } from "./previews/CodePreview"
import { MarkdownPreview } from "./previews/MarkdownPreview"
import { MediaPreview } from "./previews/MediaPreview"
import { PdfPreview } from "./previews/PdfPreview"

import { CodeboxLogoLoader } from "@/components/layout/CodeboxLogoLoader"
import { getFileCategory } from "@/lib/file-categorization"
import { api } from "@/net/http/api"
import { useBoxFileContent } from "@/net/query"
import { useActiveProjectSlug } from "@/hooks/useActiveProjectSlug"

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
            <CodeboxLogoLoader className="size-10 text-muted-foreground" />
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
