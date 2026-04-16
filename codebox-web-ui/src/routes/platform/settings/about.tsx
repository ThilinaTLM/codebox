import { createFileRoute } from "@tanstack/react-router"
import { AboutSection } from "@/components/settings/AboutSection"

export const Route = createFileRoute("/platform/settings/about")({
  component: AboutSection,
})
