import { createFileRoute } from "@tanstack/react-router"
import { useBoxDetail } from "@/components/box/BoxDetailContext"
import { TerminalView } from "@/components/box/TerminalView"

export const Route = createFileRoute(
  "/projects/$projectSlug/boxes/$boxId/terminal"
)({
  component: BoxTerminalPage,
})

function BoxTerminalPage() {
  const { projectSlug, boxId, isActive } = useBoxDetail()

  return (
    <TerminalView
      projectSlug={projectSlug}
      boxId={boxId}
      isActive={isActive}
    />
  )
}
