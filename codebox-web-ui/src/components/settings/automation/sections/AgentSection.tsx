import { Link } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import { AiBrain01Icon } from "@hugeicons/core-free-icons"
import { FormField, SectionCard } from "../FormField"
import type { LLMProfile } from "@/net/http/types"
import type { Dispatch } from "react"
import type {
  FormAction,
  FormState,
} from "../useAutomationFormState"
import { useLLMProfiles } from "@/net/query"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const DEFAULT_PROFILE_SENTINEL = "__project_default__"

interface AgentSectionProps {
  projectSlug: string
  state: FormState
  dispatch: Dispatch<FormAction>
  id?: string
}

export function AgentSection({
  projectSlug,
  state,
  dispatch,
  id,
}: AgentSectionProps) {
  const { data: profiles = [] } = useLLMProfiles(projectSlug)

  const selected: LLMProfile | undefined = profiles.find(
    (p) => p.id === state.llm_profile_id
  )

  const selectValue = state.llm_profile_id || DEFAULT_PROFILE_SENTINEL

  const handleChange = (value: string) => {
    const next = value === DEFAULT_PROFILE_SENTINEL ? "" : value
    dispatch({ type: "set", patch: { llm_profile_id: next } })
  }

  return (
    <SectionCard
      id={id}
      title="Agent"
      description="Which LLM profile this agent should use."
    >
      <FormField
        label="LLM profile"
        htmlFor="at-profile"
        description={
          profiles.length === 0
            ? undefined
            : "Overrides the project default for this automation only."
        }
      >
        <Select
          value={selectValue}
          onValueChange={(v) => v && handleChange(v)}
        >
          <SelectTrigger id="at-profile" className="w-full">
            <SelectValue>
              {selected ? (
                <ProfileRow profile={selected} />
              ) : (
                <span className="flex items-center gap-2 text-foreground">
                  <HugeiconsIcon
                    icon={AiBrain01Icon}
                    strokeWidth={2}
                    className="size-4 text-muted-foreground"
                  />
                  Project default
                </span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={DEFAULT_PROFILE_SENTINEL}>
              <span className="flex flex-col gap-0.5">
                <span>Project default</span>
                <span className="text-xs text-muted-foreground">
                  Uses the project's default profile at run time.
                </span>
              </span>
            </SelectItem>
            {profiles.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                <span className="flex flex-col gap-0.5">
                  <span>{p.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {p.provider} · {p.model}
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      {profiles.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No LLM profiles yet.{" "}
          <Link
            to="/projects/$projectSlug/configs/llm-profiles"
            params={{ projectSlug }}
            className="font-medium text-primary hover:underline"
          >
            Configure one →
          </Link>
        </p>
      )}
    </SectionCard>
  )
}

function ProfileRow({ profile }: { profile: LLMProfile }) {
  return (
    <span className="flex items-center gap-2 text-foreground">
      <HugeiconsIcon
        icon={AiBrain01Icon}
        strokeWidth={2}
        className="size-4 text-muted-foreground"
      />
      <span className="truncate">{profile.name}</span>
      <span className="truncate text-xs text-muted-foreground">
        · {profile.provider} · {profile.model}
      </span>
    </span>
  )
}
