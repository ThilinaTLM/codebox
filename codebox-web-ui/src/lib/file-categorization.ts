// ---------------------------------------------------------------------------
// File type classification (shared by FilePreview and FileViewer)
// ---------------------------------------------------------------------------

export type FileCategory =
  | "image"
  | "pdf"
  | "video"
  | "audio"
  | "markdown"
  | "code"
  | "binary"

export const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "svg",
  "webp",
  "ico",
  "bmp",
])

export const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "ogg", "mov", "avi"])

export const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "flac", "aac", "m4a", "wma"])

export const MARKDOWN_EXTENSIONS = new Set(["md", "mdx"])

export function getFileCategory(
  path: string,
  isBinary: boolean,
): FileCategory {
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