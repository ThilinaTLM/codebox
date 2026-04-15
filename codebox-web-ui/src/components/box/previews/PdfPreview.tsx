import { useState } from "react"
import { Download, FileWarning } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

interface PdfPreviewProps {
  inlineUrl: string
  downloadUrl: string
  fileName: string
}

export function PdfPreview({
  inlineUrl,
  downloadUrl,
  fileName,
}: PdfPreviewProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  if (error) {
    return (
      <div className="flex h-[400px] flex-col items-center justify-center gap-4 text-muted-foreground">
        <FileWarning size={40} strokeWidth={1.5} />
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">{fileName}</p>
          <p className="mt-1 text-xs">
            PDF preview is not available in this browser
          </p>
        </div>
        <a href={downloadUrl} download>
          <Button variant="outline" className="gap-2">
            <Download size={14} />
            Download PDF
          </Button>
        </a>
      </div>
    )
  }

  return (
    <div className="relative min-h-[400px]">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Spinner />
        </div>
      )}
      <iframe
        src={inlineUrl}
        title={fileName}
        className="h-[70vh] w-full rounded-md border border-border/40"
        onLoad={() => setLoading(false)}
        onError={() => {
          setLoading(false)
          setError(true)
        }}
      />
    </div>
  )
}
