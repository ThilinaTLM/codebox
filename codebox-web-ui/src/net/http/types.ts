export enum ContainerStatus {
  STARTING = "starting",
  RUNNING = "running",
  STOPPED = "stopped",
}

export enum Activity {
  IDLE = "idle",
  AGENT_WORKING = "agent_working",
  EXEC_SHELL = "exec_shell",
}

export enum TaskOutcome {
  IN_PROGRESS = "in_progress",
  COMPLETED = "completed",
  NEED_CLARIFICATION = "need_clarification",
  UNABLE_TO_PROCEED = "unable_to_proceed",
  NOT_ENOUGH_CONTEXT = "not_enough_context",
}

export interface Box {
  id: string
  name: string
  model: string
  container_status: ContainerStatus
  activity: Activity
  container_stop_reason: string | null
  task_outcome: TaskOutcome | null
  task_outcome_message: string | null
  dynamic_system_prompt: string | null
  initial_prompt: string | null
  container_id: string | null
  container_name: string | null
  session_id: string | null
  workspace_path: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
  trigger: string | null
  // GitHub integration fields
  github_repo: string | null
  github_issue_number: number | null
  github_trigger_url: string | null
  github_branch: string | null
  github_pr_number: number | null
}

export interface BoxEvent {
  id: number
  box_id: string
  event_type: string
  data: Record<string, unknown> | null
  created_at: string
}

export interface Container {
  id: string
  name: string
  status: string
  image: string
  model: string | null
  started_at: string | null
  created_at: string | null
}

export interface ContainerLogs {
  logs: string
}

export interface BoxCreatePayload {
  name?: string | null
  provider?: string | null
  model?: string | null
  dynamic_system_prompt?: string | null
  initial_prompt?: string | null
  github_repo?: string | null
}

export interface Model {
  provider: string
  id: string
  name: string
}

// SSE stream event types from orchestrator
export type BoxStreamEvent =
  | { type: "token"; text: string }
  | { type: "tool_start"; name: string; tool_call_id?: string; input?: string }
  | { type: "tool_end"; name: string; output: string }
  | { type: "tool_exec_output"; output: string; tool_call_id: string }
  | { type: "thinking_token"; text: string }
  | { type: "model_start" }
  | { type: "done"; content: string }
  | { type: "error"; detail: string }
  | {
      type: "status_change"
      container_status?: ContainerStatus
      activity?: Activity
      container_stop_reason?: string
      task_outcome?: TaskOutcome
      task_outcome_message?: string
    }
  | { type: "activity_changed"; status: Activity }
  | {
      type: "task_outcome"
      status: TaskOutcome
      message: string
    }
  | { type: "exec_output"; output: string }
  | { type: "exec_done"; output: string }
  | { type: "user_message"; content: string }
  | { type: "user_exec"; command: string }
  | { type: "message_complete"; message: Record<string, unknown> }

export interface FileEntry {
  name: string
  path: string
  is_dir: boolean
  size: number | null
  is_binary?: boolean
}

export interface FileListResponse {
  path: string
  entries: Array<FileEntry>
}

export interface FileContent {
  path: string
  content: string
  content_base64?: string
  size: number
  truncated: boolean
  is_binary: boolean
}



// ── GitHub types ────────────────────────────────────────────

export interface GitHubStatus {
  enabled: boolean
  app_slug: string
}

export interface GitHubInstallation {
  id: string
  installation_id: number
  account_login: string
  account_type: string
  created_at: string
}

export interface GitHubRepo {
  full_name: string
  private: boolean
  default_branch: string
}
