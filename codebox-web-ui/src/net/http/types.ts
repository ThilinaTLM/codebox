export enum BoxStatus {
  STARTING = "starting",
  RUNNING = "running",
  IDLE = "idle",
  COMPLETED = "completed",
  FAILED = "failed",
  CANCELLED = "cancelled",
  STOPPED = "stopped",
}

export interface Box {
  id: string
  name: string
  model: string
  status: BoxStatus
  system_prompt: string | null
  initial_prompt: string | null
  auto_stop: boolean
  container_id: string | null
  container_name: string | null
  session_id: string | null
  workspace_path: string | null
  result_summary: string | null
  error_message: string | null
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
}

export interface BoxCreatePayload {
  name?: string | null
  model?: string | null
  system_prompt?: string | null
  initial_prompt?: string | null
  auto_stop?: boolean | null
}

// WebSocket event types from orchestrator
export type WSEvent =
  | { type: "token"; text: string }
  | { type: "tool_start"; name: string }
  | { type: "tool_end"; name: string; output: string }
  | { type: "model_start" }
  | { type: "done"; content: string }
  | { type: "error"; detail: string }
  | { type: "status_change"; status: BoxStatus }
  | { type: "ping" }
  | { type: "exec_output"; output: string }
  | { type: "exec_done"; output: string }

export interface FileEntry {
  name: string
  path: string
  is_dir: boolean
  size: number | null
}

export interface FileListResponse {
  path: string
  entries: FileEntry[]
}

export interface FileContent {
  path: string
  content: string
  size: number
  truncated: boolean
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
