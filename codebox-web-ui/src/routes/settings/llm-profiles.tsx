import { createFileRoute } from "@tanstack/react-router"
import { LLMProfilesSection } from "@/components/settings/LLMProfilesSection"

export const Route = createFileRoute("/settings/llm-profiles")({
  component: LLMProfilesSection,
})
