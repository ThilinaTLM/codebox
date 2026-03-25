export enum TaskStatus {
  QUEUED = "queued",
  STARTING = "starting",
  RUNNING = "running",
  WAITING_FOR_FEEDBACK = "waiting_for_feedback",
  COMPLETED = "completed",
  FAILED = "failed",
  CANCELLED = "cancelled",
}

export interface Task {
  id: string
  title: string
  prompt: string
  system_prompt: string | null
  model: string
  status: TaskStatus
  container_id: string | null
  container_name: string | null
  host_port: number | null
  session_id: string | null
  workspace_path: string | null
  result_summary: string | null
  error_message: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
  // GitHub integration fields
  github_repo: string | null
  github_issue_number: number | null
  github_trigger_url: string | null
  github_branch: string | null
  github_pr_number: number | null
}

export interface TaskEvent {
  id: number
  task_id: string
  event_type: string
  data: Record<string, unknown> | null
  created_at: string
}

export interface Container {
  id: string
  name: string
  port: number | null
}

export interface TaskCreatePayload {
  title: string
  prompt: string
  model?: string | null
  system_prompt?: string | null
  workspace_path?: string | null
}

// WebSocket event types from orchestrator
export type WSEvent =
  | { type: "token"; text: string }
  | { type: "tool_start"; name: string }
  | { type: "tool_end"; name: string; output: string }
  | { type: "model_start" }
  | { type: "done"; content: string }
  | { type: "error"; detail: string }
  | { type: "status_change"; status: TaskStatus | SandboxStatus }
  | { type: "ping" }
  | { type: "exec_output"; output: string }
  | { type: "exec_done"; output: string }

// ── Sandbox types ────────────────────────────────────────────

export enum SandboxStatus {
  STARTING = "starting",
  READY = "ready",
  STOPPED = "stopped",
  FAILED = "failed",
}

export interface Sandbox {
  id: string
  name: string
  status: SandboxStatus
  container_id: string | null
  container_name: string | null
  host_port: number | null
  session_id: string | null
  workspace_path: string | null
  model: string
  error_message: string | null
  created_at: string
  stopped_at: string | null
}

export interface SandboxCreatePayload {
  name?: string | null
  model?: string | null
}

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
