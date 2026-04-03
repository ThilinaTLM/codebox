import { AssistantTextBlock } from "./AssistantTextBlock"
import { ThinkingBlock } from "./ThinkingBlock"
import { ToolCallBlock } from "./ToolCallBlock"
import { ExecBlock } from "./ExecBlock"
import { UserMessageBlock } from "./UserMessageBlock"
import { DoneBlock, ErrorBlock, StatusChangeBlock } from "./StatusDivider"
import { TOOL_RENDERERS } from "./tools"
import type { EventBlock } from "./types"

export function ChatBlock({ block }: { block: EventBlock }) {
  switch (block.kind) {
    case "text":
      return <AssistantTextBlock content={block.content} />

    case "thinking":
      return <ThinkingBlock content={block.content} />

    case "tool_call": {
      const Renderer = TOOL_RENDERERS[block.name]
      if (Renderer) {
        return (
          <Renderer
            name={block.name}
            toolCallId={block.toolCallId}
            input={block.input}
            output={block.output}
            streamOutput={block.streamOutput}
            isRunning={block.isRunning}
          />
        )
      }
      return (
        <ToolCallBlock
          name={block.name}
          input={block.input}
          output={block.output}
          isRunning={block.isRunning}
        />
      )
    }

    case "done":
      return <DoneBlock />

    case "error":
      return <ErrorBlock detail={block.detail} />

    case "status_change":
      return <StatusChangeBlock status={block.status} />

    case "exec_session":
      return <ExecBlock block={block} />

    case "user_message":
      return (
        <div className="mt-4">
          <UserMessageBlock content={block.content} />
        </div>
      )
  }
}
