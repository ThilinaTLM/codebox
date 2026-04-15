import { Download, File, FileArchive, FileSpreadsheet } from "lucide-react"
import { Button } from "@/components/ui/button"

interface BinaryFallbackProps {
  fileName: string
  size: number
  downloadUrl: string
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, i)
  return `${i === 0 ? value : value.toFixed(1)} ${units[i]}`
}

function getFileIcon(fileName: string) {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? ""
  switch (ext) {
    case "zip":
    case "tar":
    case "gz":
    case "bz2":
    case "7z":
    case "rar":
    case "xz":
      return FileArchive
    case "xls":
    case "xlsx":
    case "numbers":
      return FileSpreadsheet
    default:
      return File
  }
}

function getMimeHint(fileName: string): string | null {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? ""
  const hints: Record<string, string> = {
    zip: "application/zip",
    tar: "application/x-tar",
    gz: "application/gzip",
    "7z": "application/x-7z-compressed",
    rar: "application/vnd.rar",
    exe: "application/x-executable",
    dmg: "application/x-apple-diskimage",
    iso: "application/x-iso9660-image",
    woff: "font/woff",
    woff2: "font/woff2",
    ttf: "font/ttf",
    otf: "font/otf",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    sqlite: "application/x-sqlite3",
    db: "application/x-sqlite3",
  }
  return hints[ext] ?? null
}

export function BinaryFallback({
  fileName,
  size,
  downloadUrl,
}: BinaryFallbackProps) {
  const Icon = getFileIcon(fileName)
  const mime = getMimeHint(fileName)

  return (
    <div className="flex flex-col items-center justify-center gap-5 py-10">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-inset">
        <Icon size={32} strokeWidth={1.5} className="text-muted-foreground" />
      </div>

      <div className="text-center">
        <p className="text-sm font-medium text-foreground">{fileName}</p>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {formatBytes(size)}
          {mime && <span className="ml-1.5">· {mime}</span>}
        </p>
      </div>

      <p className="text-xs text-muted-foreground/60">
        No preview available for this file type
      </p>

      <a href={downloadUrl} download>
        <Button variant="outline" className="gap-2">
          <Download size={14} />
          Download
        </Button>
      </a>
    </div>
  )
}
