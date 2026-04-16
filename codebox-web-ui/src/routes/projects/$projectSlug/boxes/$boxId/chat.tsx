import { useMemo, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { useBoxDetail } from "@/components/box/BoxDetailContext"
import { BoxInput } from "@/components/box/BoxInput"
import { FilePreview } from "@/components/box/FilePreview"
import { ChatStream } from "@/components/chat/ChatStream"
import { collapseTokens, mergeEvents } from "@/lib/event-utils"
import { useBoxEvents } from "@/net/query"

export const Route = createFileRoute(
  "/projects/$projectSlug/boxes/$boxId/chat"
)({
  component: BoxChatPage,
})

function BoxChatPage() {
  const {
    projectSlug,
    boxId,
    isActive,
    activity,
    actions,
    liveEvents,
  } = useBoxDetail()
  const { data } = useBoxEvents(projectSlug, boxId)
  const historyEvents = data ?? []
  const [previewFile, setPreviewFile] = useState<string | null>(null)

  const blocks = useMemo(
    () => collapseTokens(mergeEvents(historyEvents, liveEvents)),
    [historyEvents, liveEvents]
  )

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-hidden">
        <ChatStream
          blocks={blocks}
          centered
          isWorking={activity.isWorking}
          onSendMessage={actions.sendMessage}
        />
      </div>

      <div className="border-t border-border/40 px-4 py-3">
        <div className="mx-auto max-w-4xl">
          <BoxInput
            onSendMessage={actions.sendMessage}
            onSendExec={actions.sendExec}
            onCancel={actions.cancel}
            isWorking={activity.isWorking}
            disabled={!isActive}
          />
        </div>
      </div>

      <FilePreview
        boxId={boxId}
        filePath={previewFile}
        onClose={() => setPreviewFile(null)}
      />
    </div>
  )
}
