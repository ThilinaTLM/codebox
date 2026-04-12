import type { TreeViewElement } from "@/components/ui/file-tree"
import type { FileEntry } from "@/net/http/types"

export function getFileColorClass(name: string, isDir: boolean): string {
  if (isDir) return "text-primary/60"
  const ext = name.includes(".") ? name.split(".").pop()?.toLowerCase() : ""
  switch (ext) {
    case "ts":
    case "tsx":
      return "text-file-ts"
    case "py":
      return "text-file-py"
    case "json":
      return "text-file-json"
    case "md":
    case "mdx":
      return "text-file-md"
    case "yaml":
    case "yml":
      return "text-file-yaml"
    case "css":
      return "text-file-css"
    default:
      return "text-muted-foreground"
  }
}

export function entriesToTreeElements(
  entries: Array<FileEntry>,
  binaryFiles?: Set<string>
): Array<TreeViewElement> {
  return entries.map((entry) => {
    if (binaryFiles && entry.is_binary) binaryFiles.add(entry.path)
    return {
      id: entry.path,
      name: entry.name,
      type: entry.is_dir ? ("folder" as const) : ("file" as const),
      children: entry.is_dir ? [] : undefined,
    }
  })
}

export function countElements(elements: Array<TreeViewElement>): number {
  let count = 0
  for (const el of elements) {
    count++
    if (el.children) {
      count += countElements(el.children)
    }
  }
  return count
}

export function findTreeElement(
  elements: Array<TreeViewElement>,
  targetId: string
): TreeViewElement | null {
  for (const el of elements) {
    if (el.id === targetId) return el
    if (el.children) {
      const found = findTreeElement(el.children, targetId)
      if (found) return found
    }
  }
  return null
}

export function updateTreeChildren(
  items: Array<TreeViewElement>,
  targetId: string,
  children: Array<TreeViewElement>
): Array<TreeViewElement> {
  return items.map((item) => {
    if (item.id === targetId) {
      return { ...item, children }
    }
    if (item.children && item.children.length > 0) {
      return {
        ...item,
        children: updateTreeChildren(item.children, targetId, children),
      }
    }
    return item
  })
}
