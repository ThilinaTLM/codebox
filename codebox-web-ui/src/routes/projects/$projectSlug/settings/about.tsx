import { createFileRoute } from "@tanstack/react-router"
import { AboutSection } from "@/components/settings/AboutSection"

export const Route = createFileRoute("/projects/$projectSlug/settings/about")({
  component: AboutSection,
})
