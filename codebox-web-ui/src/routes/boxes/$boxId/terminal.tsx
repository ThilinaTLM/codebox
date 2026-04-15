import { createFileRoute } from "@tanstack/react-router"
import { useBoxDetail } from "@/components/box/BoxDetailContext"
import { TerminalView } from "@/components/box/TerminalView"
import { useBoxEvents } from "@/net/query"

export const Route = createFileRoute("/boxes/$boxId/terminal")({
  component: BoxTerminalPage,
})

function BoxTerminalPage() {
  const { boxId, isActive, actions, liveEvents } = useBoxDetail()
  const { data } = useBoxEvents(boxId)
  const historyEvents = data ?? []

  return (
    <TerminalView
      boxId={boxId}
      historyEvents={historyEvents}
      liveEvents={liveEvents}
      onExec={actions.sendExec}
      disabled={!isActive}
    />
  )
}
