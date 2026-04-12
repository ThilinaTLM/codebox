import { useEffect, useState } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import type { GitHubRepo, LLMProfile } from "@/net/http/types"
import {
  useCreateBox,
  useGitHubRepos,
  useGitHubStatus,
  useLLMProfiles,
} from "@/net/query"
import { buildCreatePayload } from "@/components/box/buildCreatePayload"
import { CreateBoxStepOne } from "@/components/box/CreateBoxStepOne"
import { CreateBoxStepTwo } from "@/components/box/CreateBoxStepTwo"

// ── Route ───────────────────────────────────────────────────

export const Route = createFileRoute("/boxes/create")({
  component: CreateAgentPage,
})

// ── Page ────────────────────────────────────────────────────

function CreateAgentPage() {
  const navigate = useNavigate()
  const createMutation = useCreateBox()

  // Wizard step
  const [step, setStep] = useState(1)

  // Form state
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [tags, setTags] = useState<Array<string>>([])
  const [selectedProfile, setSelectedProfile] = useState<LLMProfile | null>(
    null
  )
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null)
  const [systemPrompt, setSystemPrompt] = useState("")
  const [autoStartPrompt, setAutoStartPrompt] = useState("")
  const [recursionLimit, setRecursionLimit] = useState(150)
  const [initBashScript, setInitBashScript] = useState("")

  // Tool toggles
  const [executeEnabled, setExecuteEnabled] = useState(true)
  const [executeTimeout, setExecuteTimeout] = useState(120)
  const [webSearchEnabled, setWebSearchEnabled] = useState(true)
  const [webSearchMaxResults, setWebSearchMaxResults] = useState(5)
  const [webFetchEnabled, setWebFetchEnabled] = useState(true)
  const [webFetchTimeout, setWebFetchTimeout] = useState(30)
  const [filesystemEnabled, setFilesystemEnabled] = useState(true)
  const [taskEnabled, setTaskEnabled] = useState(true)

  // Queries
  const { data: profiles } = useLLMProfiles()
  const { data: githubStatus } = useGitHubStatus()
  const { data: repos } = useGitHubRepos()
  const githubEnabled = githubStatus?.enabled ?? false

  // Pre-select default profile
  useEffect(() => {
    if (!selectedProfile && profiles) {
      const defaultProfile = profiles.find((p) => p.is_default)
      if (defaultProfile) setSelectedProfile(defaultProfile)
    }
  }, [profiles, selectedProfile])

  // Submit
  const handleCreate = () => {
    const payload = buildCreatePayload({
      name,
      description,
      tags,
      selectedProfileId: selectedProfile?.id,
      selectedRepoFullName: selectedRepo?.full_name,
      systemPrompt,
      autoStartPrompt,
      recursionLimit,
      initBashScript,
      executeEnabled,
      executeTimeout,
      webSearchEnabled,
      webSearchMaxResults,
      webFetchEnabled,
      webFetchTimeout,
      filesystemEnabled,
      taskEnabled,
    })

    createMutation.mutate(payload, {
      onSuccess: (box) => {
        toast.success("Agent created")
        navigate({ to: "/boxes/$boxId", params: { boxId: box.id } })
      },
      onError: () => toast.error("Failed to create agent"),
    })
  }

  const isPending = createMutation.isPending

  if (step === 1) {
    return (
      <CreateBoxStepOne
        name={name}
        onNameChange={setName}
        autoStartPrompt={autoStartPrompt}
        onAutoStartPromptChange={setAutoStartPrompt}
        selectedProfile={selectedProfile}
        onSelectedProfileChange={setSelectedProfile}
        profiles={profiles}
        selectedRepo={selectedRepo}
        onSelectedRepoChange={setSelectedRepo}
        repos={repos}
        githubEnabled={githubEnabled}
        isPending={isPending}
        onConfigure={() => setStep(2)}
        onCreate={handleCreate}
      />
    )
  }

  return (
    <CreateBoxStepTwo
      systemPrompt={systemPrompt}
      onSystemPromptChange={setSystemPrompt}
      description={description}
      onDescriptionChange={setDescription}
      tags={tags}
      onTagsChange={setTags}
      initBashScript={initBashScript}
      onInitBashScriptChange={setInitBashScript}
      recursionLimit={recursionLimit}
      onRecursionLimitChange={setRecursionLimit}
      executeEnabled={executeEnabled}
      onExecuteEnabledChange={setExecuteEnabled}
      executeTimeout={executeTimeout}
      onExecuteTimeoutChange={setExecuteTimeout}
      webSearchEnabled={webSearchEnabled}
      onWebSearchEnabledChange={setWebSearchEnabled}
      webSearchMaxResults={webSearchMaxResults}
      onWebSearchMaxResultsChange={setWebSearchMaxResults}
      webFetchEnabled={webFetchEnabled}
      onWebFetchEnabledChange={setWebFetchEnabled}
      webFetchTimeout={webFetchTimeout}
      onWebFetchTimeoutChange={setWebFetchTimeout}
      filesystemEnabled={filesystemEnabled}
      onFilesystemEnabledChange={setFilesystemEnabled}
      taskEnabled={taskEnabled}
      onTaskEnabledChange={setTaskEnabled}
      isPending={isPending}
      onBack={() => setStep(1)}
      onCreate={handleCreate}
    />
  )
}
