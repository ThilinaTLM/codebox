import { createFileRoute } from "@tanstack/react-router"
import { AppearanceSection } from "@/components/settings/AppearanceSection"

export const Route = createFileRoute("/platform/settings/appearance")({
  component: AppearanceSection,
})
