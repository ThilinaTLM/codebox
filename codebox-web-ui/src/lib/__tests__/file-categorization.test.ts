import { describe, expect, it } from "vitest"
import { getFileCategory } from "@/lib/file-categorization"

describe("getFileCategory", () => {
  it("classifies image extensions", () => {
    expect(getFileCategory("photo.png", false)).toBe("image")
    expect(getFileCategory("icon.svg", false)).toBe("image")
    expect(getFileCategory("photo.JPG", false)).toBe("image")
  })

  it("classifies pdf", () => {
    expect(getFileCategory("doc.pdf", false)).toBe("pdf")
    expect(getFileCategory("doc.pdf", true)).toBe("pdf")
  })

  it("classifies video extensions", () => {
    expect(getFileCategory("clip.mp4", false)).toBe("video")
    expect(getFileCategory("clip.webm", true)).toBe("video")
  })

  it("classifies audio extensions", () => {
    expect(getFileCategory("song.mp3", false)).toBe("audio")
    expect(getFileCategory("song.wav", true)).toBe("audio")
  })

  it("classifies markdown extensions", () => {
    expect(getFileCategory("README.md", false)).toBe("markdown")
    expect(getFileCategory("guide.mdx", false)).toBe("markdown")
  })

  it("classifies unknown text files as code", () => {
    expect(getFileCategory("main.ts", false)).toBe("code")
    expect(getFileCategory("config.yml", false)).toBe("code")
    expect(getFileCategory("noext", false)).toBe("code")
  })

  it("classifies unrecognized binary files as binary", () => {
    expect(getFileCategory("data.bin", true)).toBe("binary")
    expect(getFileCategory("archive.zip", true)).toBe("binary")
  })

  it("classifies markdown as binary when isBinary is true", () => {
    expect(getFileCategory("README.md", true)).toBe("binary")
  })
})