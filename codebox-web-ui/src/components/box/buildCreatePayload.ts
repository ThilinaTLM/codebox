import type { BoxCreatePayload } from "@/net/http/types"

function autoName(task: string): string {
  return task
    .trim()
    .split(/\s+/)
    .slice(0, 5)
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .substring(0, 40)
}

export interface CreateBoxFormState {
  name: string
  description: string
  tags: Array<string>
  selectedProfileId?: string
  selectedRepoFullName?: string
  selectedBaseBranch?: string
  selectedWorkspaceMode?: "branch_from_issue" | "checkout_ref" | "pinned"
  systemPrompt: string
  autoStartPrompt: string
  recursionLimit: number
  initBashScript: string
  executeEnabled: boolean
  executeTimeout: number
  webSearchEnabled: boolean
  webSearchMaxResults: number
  webFetchEnabled: boolean
  webFetchTimeout: number
  filesystemEnabled: boolean
  taskEnabled: boolean
}

export function buildCreatePayload(form: CreateBoxFormState): BoxCreatePayload {
  const generatedName =
    form.name.trim() || autoName(form.autoStartPrompt) || undefined

  const hasRepo = Boolean(form.selectedRepoFullName)
  const payload: BoxCreatePayload = {
    name: generatedName,
    description: form.description.trim() || undefined,
    tags: form.tags.length > 0 ? form.tags : undefined,
    llm_profile_id: form.selectedProfileId || undefined,
    system_prompt: form.systemPrompt.trim() || undefined,
    auto_start_prompt: form.autoStartPrompt.trim() || undefined,
    recursion_limit:
      form.recursionLimit !== 150 ? form.recursionLimit : undefined,
    github_repo: form.selectedRepoFullName || undefined,
    github_base_branch: hasRepo && form.selectedBaseBranch
      ? form.selectedBaseBranch
      : undefined,
    github_workspace_mode: hasRepo && form.selectedWorkspaceMode
      ? form.selectedWorkspaceMode
      : undefined,
    init_bash_script: form.initBashScript.trim() || undefined,
  }

  // Build tool settings (only include non-defaults)
  const tools: BoxCreatePayload["tools"] = {}
  if (!form.executeEnabled) {
    tools.execute = { enabled: false }
  } else if (form.executeTimeout !== 120) {
    tools.execute = { enabled: true, timeout: form.executeTimeout }
  }
  if (!form.webSearchEnabled) {
    tools.web_search = { enabled: false }
  } else if (form.webSearchMaxResults !== 5) {
    tools.web_search = { enabled: true, max_results: form.webSearchMaxResults }
  }
  if (!form.webFetchEnabled) {
    tools.web_fetch = { enabled: false }
  } else if (form.webFetchTimeout !== 30) {
    tools.web_fetch = { enabled: true, timeout: form.webFetchTimeout }
  }
  if (!form.filesystemEnabled) tools.filesystem = { enabled: false }
  if (!form.taskEnabled) tools.task = { enabled: false }

  if (Object.keys(tools).length > 0) payload.tools = tools

  return payload
}
