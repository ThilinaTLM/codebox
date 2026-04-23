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

export enum BoxOutcome {
  COMPLETED = "completed",
  UNABLE_TO_PROCEED = "unable_to_proceed",
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
  project_id: string
  activity: Activity | null
  box_outcome: BoxOutcome | null
  box_outcome_message: string | null
  trigger: string | null
  description: string | null
  tags: Array<string> | null
  created_at: string | null
  started_at: string | null
  image: string
  error_detail: string | null
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
  name?: string | null
  description?: string | null
  tags?: Array<string> | null
  llm_profile_id?: string | null
  system_prompt?: string | null
  auto_start_prompt?: string | null
  recursion_limit?: number | null
  tools?: ToolSettings | null
  github_repo?: string | null
  init_bash_script?: string | null
}

export interface Model {
  provider: string
  id: string
  name: string
}

export interface ModelsPreviewRequest {
  provider: string
  api_key: string
  base_url?: string | null
}

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
  is_binary: boolean
}

export interface WriteFileResponse {
  path: string
  size: number
}

export interface UploadFileResponse {
  files: Array<{ path: string; size: number }>
}

export interface GitHubStatus {
  enabled: boolean
  app_slug: string | null
  webhook_url: string | null
  public_url?: string | null
  manifest_supported?: boolean
}

export interface GitHubManifestPrepareRequest {
  owner_type: "user" | "organization"
  owner_name?: string | null
}

export interface GitHubManifestPrepareResponse {
  action: string
  manifest: Record<string, unknown>
  state: string
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

export interface GitHubBranch {
  name: string
  protected: boolean
}

export interface AuthUser {
  id: string
  username: string
  user_type: "admin" | "user"
  status: "active" | "disabled" | "deleted"
  first_name: string | null
  last_name: string | null
  created_at: string
}

export interface LoginResponse {
  user: AuthUser
}

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

export type LLMProfileKeyMode = "no_keys" | "plaintext" | "password_encrypted"

export interface LLMProfileExportRequest {
  profile_ids?: Array<string> | null
  key_mode: LLMProfileKeyMode
  password?: string | null
}

export interface LLMProfileExportedEntry {
  name: string
  provider: string
  model: string
  api_key: string | null
  base_url: string | null
}

export interface LLMProfileExportFile {
  version: number
  exported_at: string
  key_mode: LLMProfileKeyMode
  key_params?: { salt: string; iterations: number } | null
  profiles: Array<LLMProfileExportedEntry>
}

export interface LLMProfileImportRequest {
  file: LLMProfileExportFile
  password?: string | null
}

export interface LLMProfileImportResult {
  imported: number
  skipped: number
  profiles: Array<LLMProfile>
}

export interface Project {
  id: string
  name: string
  slug: string
  description: string | null
  created_by: string
  status: "active" | "archived" | "deleted"
  created_at: string
  updated_at: string
}

export interface ProjectUserSummary {
  id: string
  username: string
  first_name: string | null
  last_name: string | null
  status: "active" | "disabled" | "deleted"
}

export interface ProjectMember {
  id: string
  project_id: string
  user_id: string
  role: "admin" | "contributor"
  created_at: string
  user: ProjectUserSummary
}

export type ProjectMemberCandidate = ProjectUserSummary

export interface ProjectUpdatePayload {
  name?: string | null
  description?: string | null
}

export interface ProjectSettings {
  default_llm_profile_id: string | null
  tavily_api_key_masked: string | null
  github_app_id: string | null
  github_private_key_masked: string | null
  github_webhook_secret_masked: string | null
  github_app_slug: string | null
  github_bot_name: string | null
  github_default_base_branch: string | null
}

export interface ProjectSettingsUpdate {
  default_llm_profile_id?: string | null
  tavily_api_key?: string | null
  github_app_id?: string | null
  github_private_key?: string | null
  github_webhook_secret?: string | null
  github_app_slug?: string | null
  github_bot_name?: string | null
  github_default_base_branch?: string | null
}

// ── Agent Templates ────────────────────────────────────────

export type AgentTemplateTriggerKind =
  | "github.issues"
  | "github.issue_comment"
  | "github.pull_request"
  | "github.pull_request_review"
  | "github.pull_request_review_comment"
  | "github.push"
  | "schedule"

export type AgentTemplateWorkspaceMode =
  | "branch_from_issue"
  | "checkout_ref"
  | "pinned"

export type AgentTemplateFilterOp = "eq" | "in" | "contains_any" | "matches"

export interface AgentTemplateFilterPredicate {
  field: string
  op: AgentTemplateFilterOp
  value: string | Array<string>
}

export interface AgentTemplate {
  id: string
  project_id: string
  name: string
  description: string | null
  enabled: boolean
  trigger_kind: AgentTemplateTriggerKind
  trigger_filters: Array<AgentTemplateFilterPredicate> | null
  schedule_cron: string | null
  schedule_timezone: string | null
  next_run_at: string | null
  workspace_mode: AgentTemplateWorkspaceMode
  pinned_repo: string | null
  pinned_branch: string | null
  system_prompt: string | null
  initial_prompt: string
  llm_profile_id: string | null
  created_at: string
  updated_at: string
  created_by: string | null
}

export interface AgentTemplateCreate {
  name: string
  description?: string | null
  enabled?: boolean
  trigger_kind: AgentTemplateTriggerKind
  trigger_filters?: Array<AgentTemplateFilterPredicate> | null
  schedule_cron?: string | null
  schedule_timezone?: string | null
  workspace_mode: AgentTemplateWorkspaceMode
  pinned_repo?: string | null
  pinned_branch?: string | null
  system_prompt?: string | null
  initial_prompt: string
  llm_profile_id?: string | null
}

export type AgentTemplateUpdate = Partial<AgentTemplateCreate>

export interface AgentTemplateRun {
  id: string
  project_id: string
  template_id: string
  box_id: string | null
  github_event_id: string | null
  trigger_kind: string
  status: "spawned" | "skipped_filter" | "error"
  error: string | null
  created_at: string
}

export interface AgentTemplateRunList {
  runs: Array<AgentTemplateRun>
  next_cursor: string | null
}

export interface AgentTemplateDryRunRequest {
  event_type?: string | null
  payload?: Record<string, unknown> | null
  schedule?: boolean
}

export interface AgentTemplateDryRunResult {
  matched: boolean
  reason: string | null
  rendered_system_prompt: string | null
  rendered_initial_prompt: string | null
  setup_commands: Array<string>
}
