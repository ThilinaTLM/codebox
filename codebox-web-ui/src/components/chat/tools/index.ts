import type { ComponentType } from "react"
import type { ToolCallBlockProps } from "./types"
import { ExecuteToolBlock } from "./ExecuteToolBlock"
import { ReadFileToolBlock } from "./ReadFileToolBlock"
import { WriteFileToolBlock } from "./WriteFileToolBlock"
import { EditFileToolBlock } from "./EditFileToolBlock"
import { GrepToolBlock } from "./GrepToolBlock"
import { GlobToolBlock } from "./GlobToolBlock"

export type { ToolCallBlockProps } from "./types"

/**
 * Registry mapping tool names to specialized UI components.
 * Tools not listed here fall back to the generic ToolCallBlock.
 */
export const TOOL_RENDERERS: Record<string, ComponentType<ToolCallBlockProps>> = {
  execute: ExecuteToolBlock,
  read_file: ReadFileToolBlock,
  write_file: WriteFileToolBlock,
  edit_file: EditFileToolBlock,
  grep: GrepToolBlock,
  glob: GlobToolBlock,
}
