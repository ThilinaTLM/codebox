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
  provider: string
  model: string
  container_status: ContainerStatus
  container_id: string
  container_name: string
  grpc_connected: boolean
  activity: Activity | null
  task_outcome: TaskOutcome | null
  task_outcome_message: string | null
  trigger: string | null
  description: string | null
  tags: Array<string> | null
  created_at: string | null
  started_at: string | null
  image: string
  error_detail: string | null
  // GitHub integration fields
  github_repo: string | null
  github_issue_number: number | null
  github_branch: string | null
}

export interface CanonicalEvent {
  seq: number
  event_id: string
  timestamp_ms: number
  kind: string
  run_id: string
  turn_id: string
  message_id: string
  tool_call_id: string
  command_id: string
  payload: Record<string, unknown>
}

export interface ContainerLogs {
  logs: string
}

// ── Box creation types ──────────────────────────────────────

export interface ToolConfig {
  enabled?: boolean
  [key: string]: unknown
}

export interface ToolSettings {
  execute?: ToolConfig | null
  web_search?: ToolConfig | null
  web_fetch?: ToolConfig | null
  filesystem?: ToolConfig | null
  write_todos?: ToolConfig | null
  task?: ToolConfig | null
  compact_conversation?: ToolConfig | null
}

export interface BoxCreatePayload {
  // Identity
  name?: string | null
  description?: string | null
  tags?: Array<string> | null

  // LLM profile
  llm_profile_id?: string | null

  // Agent behaviour
  system_prompt?: string | null
  auto_start_prompt?: string | null
  recursion_limit?: number | null

  // Tools
  tools?: ToolSettings | null

  // Init / integration
  github_repo?: string | null
  init_bash_script?: string | null
}

export interface Model {
  provider: string
  id: string
  name: string
}

// SSE stream event types from orchestrator
export type BoxStreamEvent = CanonicalEvent

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
  app_slug: string | null
  webhook_url: string | null
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

// ── Auth types ──────────────────────────────────────────────

export interface AuthUser {
  id: string
  username: string
  user_type: "admin" | "user"
  first_name: string | null
  last_name: string | null
  created_at: string
}

export interface LoginResponse {
  token: string
  user: AuthUser
}

// ── LLM Profile types ─────────────────────────────────────────

export interface LLMProfile {
  id: string
  name: string
  provider: string
  model: string
  api_key_masked: string
  base_url: string | null
  is_default: boolean
  created_at: string
  updated_at: string
}

export interface LLMProfileCreate {
  name: string
  provider: string
  model: string
  api_key: string
  base_url?: string | null
}

export interface LLMProfileUpdate {
  name?: string | null
  provider?: string | null
  model?: string | null
  api_key?: string | null
  base_url?: string | null
}

// ── User Settings types ───────────────────────────────────────

export interface UserSettings {
  default_llm_profile_id: string | null
  tavily_api_key_masked: string | null
  github_app_id: string | null
  github_private_key_masked: string | null
  github_webhook_secret_masked: string | null
  github_app_slug: string | null
  github_bot_name: string | null
  github_default_base_branch: string | null
}

export interface UserSettingsUpdate {
  default_llm_profile_id?: string | null
  tavily_api_key?: string | null
  github_app_id?: string | null
  github_private_key?: string | null
  github_webhook_secret?: string | null
  github_app_slug?: string | null
  github_bot_name?: string | null
  github_default_base_branch?: string | null
}
