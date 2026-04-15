import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"

interface MediaPreviewProps {
  type: "video" | "audio"
  src: string
  downloadUrl: string
  fileName: string
}

export function MediaPreview({
  type,
  src,
  downloadUrl,
  fileName,
}: MediaPreviewProps) {
  if (type === "video") {
    return (
      <div className="flex flex-col items-center gap-4">
        <video
          controls
          preload="metadata"
          className="max-h-[60vh] w-full rounded-md"
          src={src}
        >
          <track kind="captions" />
          Your browser does not support video playback.
        </video>
        <a href={downloadUrl} download className="self-center">
          <Button variant="ghost" size="sm" className="gap-2 text-xs text-muted-foreground">
            <Download size={12} />
            Download {fileName}
          </Button>
        </a>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center gap-6 py-8">
      <div className="flex h-32 w-32 items-center justify-center rounded-2xl bg-inset">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          className="size-12 text-muted-foreground"
        >
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      </div>
      <audio controls preload="metadata" src={src} className="w-full max-w-md">
        Your browser does not support audio playback.
      </audio>
      <a href={downloadUrl} download>
        <Button variant="ghost" size="sm" className="gap-2 text-xs text-muted-foreground">
          <Download size={12} />
          Download {fileName}
        </Button>
      </a>
    </div>
  )
}
