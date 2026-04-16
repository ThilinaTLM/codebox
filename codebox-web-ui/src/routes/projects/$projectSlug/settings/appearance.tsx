import { createFileRoute } from "@tanstack/react-router"
import { AppearanceSection } from "@/components/settings/AppearanceSection"

export const Route = createFileRoute(
  "/projects/$projectSlug/settings/appearance"
)({
  component: AppearanceSection,
})
