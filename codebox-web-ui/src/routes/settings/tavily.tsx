import { createFileRoute } from "@tanstack/react-router"
import { TavilySection } from "@/components/settings/TavilySection"

export const Route = createFileRoute("/settings/tavily")({
  component: TavilySection,
})
