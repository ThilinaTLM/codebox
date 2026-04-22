import { AssistantTextBlock } from "./AssistantTextBlock"
import { ThinkingBlock } from "./ThinkingBlock"
import { ToolCallBlock } from "./ToolCallBlock"
import { UserMessageBlock } from "./UserMessageBlock"
import { OutcomeDeclaredBlock } from "./OutcomeDeclaredBlock"
import { InputRequestBlock } from "./InputRequestBlock"
import { DoneBlock, ErrorBlock, StatusChangeBlock } from "./StatusDivider"
import { TOOL_RENDERERS } from "./tools"
import type { EventBlock } from "./types"

export function ChatBlock({
  block,
  onSendMessage,
}: {
  block: EventBlock
  onSendMessage?: (text: string) => void
}) {
  switch (block.kind) {
    case "text":
      return <AssistantTextBlock content={block.content} />

    case "thinking":
      return <ThinkingBlock content={block.content} isStreaming={block.isStreaming} />

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

    case "user_message":
      return <UserMessageBlock content={block.content} />

    case "outcome_declared":
      return <OutcomeDeclaredBlock status={block.status} message={block.message} />

    case "input_requested":
      return (
        <InputRequestBlock
          message={block.message}
          questions={block.questions}
          onReply={(text) => onSendMessage?.(text)}
        />
      )
  }
}
