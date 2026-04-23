import axios from "axios"
import type {
  AuthUser,
  Automation,
  AutomationCreate,
  AutomationDryRunRequest,
  AutomationDryRunResult,
  AutomationRunList,
  AutomationUpdate,
  Box,
  BoxCreatePayload,
  CanonicalEvent,
  ContainerLogs,
  FileContent,
  FileListResponse,
  GitHubBranch,
  GitHubInstallation,
  GitHubManifestPrepareRequest,
  GitHubManifestPrepareResponse,
  GitHubRepo,
  GitHubStatus,
  LLMProfile,
  LLMProfileCreate,
  LLMProfileExportFile,
  LLMProfileExportRequest,
  LLMProfileImportRequest,
  LLMProfileImportResult,
  LLMProfileUpdate,
  LoginResponse,
  Model,
  ModelsPreviewRequest,
  OrphanContainer,
  Project,
  ProjectMember,
  ProjectMemberCandidate,
  ProjectSettings,
  ProjectSettingsUpdate,
  ProjectUpdatePayload,
  UploadFileResponse,
  WriteFileResponse,
} from "./types"
import { API_URL } from "@/lib/constants"
import { useAuthStore } from "@/lib/auth"

const client = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
})

const p = (slug: string) => `/api/projects/${slug}`

export function isAuthError(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 401
}

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (isAuthError(error)) {
      const url = error.config?.url ?? ""
      if (!url.endsWith("/auth/login")) {
        useAuthStore.getState().logout()
      }
    }
    return Promise.reject(error)
  }
)

export const api = {
  projects: {
    list: async (): Promise<Array<Project>> => {
      const { data } = await client.get<Array<Project>>("/api/projects")
      return data
    },
    get: async (slug: string): Promise<Project> => {
      const { data } = await client.get<Project>(`${p(slug)}`)
      return data
    },
    create: async (name: string, description?: string | null): Promise<Project> => {
      const { data } = await client.post<Project>("/api/projects", {
        name,
        description: description ?? null,
      })
      return data
    },
    update: async (
      slug: string,
      payload: ProjectUpdatePayload
    ): Promise<Project> => {
      const { data } = await client.patch<Project>(`${p(slug)}`, payload)
      return data
    },
    archive: async (slug: string): Promise<Project> => {
      const { data } = await client.post<Project>(`${p(slug)}/archive`)
      return data
    },
    restore: async (slug: string): Promise<Project> => {
      const { data } = await client.post<Project>(`${p(slug)}/restore`)
      return data
    },
    delete: async (slug: string): Promise<void> => {
      await client.delete(`${p(slug)}`)
    },
    listMembers: async (slug: string): Promise<Array<ProjectMember>> => {
      const { data } = await client.get<Array<ProjectMember>>(`${p(slug)}/members`)
      return data
    },
    searchMemberCandidates: async (
      slug: string,
      query?: string,
      limit?: number
    ): Promise<Array<ProjectMemberCandidate>> => {
      const params: Record<string, string | number> = {}
      if (query) params.q = query
      if (limit != null) params.limit = limit
      const { data } = await client.get<Array<ProjectMemberCandidate>>(
        `${p(slug)}/member-candidates`,
        { params: Object.keys(params).length > 0 ? params : undefined }
      )
      return data
    },
    addMember: async (
      slug: string,
      userId: string,
      role?: string
    ): Promise<ProjectMember> => {
      const { data } = await client.post<ProjectMember>(`${p(slug)}/members`, {
        user_id: userId,
        role: role ?? "contributor",
      })
      return data
    },
    updateMemberRole: async (
      slug: string,
      userId: string,
      role: string
    ): Promise<ProjectMember> => {
      const { data } = await client.patch<ProjectMember>(
        `${p(slug)}/members/${userId}`,
        { role }
      )
      return data
    },
    removeMember: async (slug: string, userId: string): Promise<void> => {
      await client.delete(`${p(slug)}/members/${userId}`)
    },
  },
  boxes: {
    list: async (
      slug: string,
      status?: string,
      trigger?: string
    ): Promise<Array<Box>> => {
      const params: Record<string, string> = {}
      if (status) params.container_status = status
      if (trigger) params.trigger = trigger
      const { data } = await client.get<Array<Box>>(`${p(slug)}/boxes`, { params })
      return data
    },
    get: async (slug: string, boxId: string): Promise<Box> => {
      const { data } = await client.get<Box>(`${p(slug)}/boxes/${boxId}`)
      return data
    },
    create: async (slug: string, payload: BoxCreatePayload): Promise<Box> => {
      const { data } = await client.post<Box>(`${p(slug)}/boxes`, payload)
      return data
    },
    stop: async (slug: string, boxId: string): Promise<Box> => {
      const { data } = await client.post<Box>(`${p(slug)}/boxes/${boxId}/stop`)
      return data
    },
    restart: async (slug: string, boxId: string): Promise<Box> => {
      const { data } = await client.post<Box>(`${p(slug)}/boxes/${boxId}/restart`)
      return data
    },
    cancel: async (slug: string, boxId: string): Promise<void> => {
      await client.post(`${p(slug)}/boxes/${boxId}/cancel`)
    },
    delete: async (slug: string, boxId: string): Promise<void> => {
      await client.delete(`${p(slug)}/boxes/${boxId}`)
    },
    sendMessage: async (slug: string, boxId: string, message: string): Promise<void> => {
      await client.post(`${p(slug)}/boxes/${boxId}/message`, { message })
    },
    getEvents: async (
      slug: string,
      boxId: string,
      afterSeq?: number,
      limit?: number
    ): Promise<Array<CanonicalEvent>> => {
      const params: Record<string, number> = {}
      if (afterSeq != null) params.after_seq = afterSeq
      if (limit != null) params.limit = limit
      const { data } = await client.get<Array<CanonicalEvent>>(
        `${p(slug)}/boxes/${boxId}/events`,
        { params: Object.keys(params).length > 0 ? params : undefined }
      )
      return data
    },
    listFiles: async (
      slug: string,
      boxId: string,
      path: string = "/workspace"
    ): Promise<FileListResponse> => {
      const { data } = await client.get<FileListResponse>(
        `${p(slug)}/boxes/${boxId}/files`,
        { params: { path } }
      )
      return data
    },
    readFile: async (slug: string, boxId: string, path: string): Promise<FileContent> => {
      const { data } = await client.get<FileContent>(
        `${p(slug)}/boxes/${boxId}/files/read`,
        { params: { path } }
      )
      return data
    },
    getDownloadUrl: (slug: string, boxId: string, path: string): string => {
      const params = new URLSearchParams({ path })
      return `${API_URL}${p(slug)}/boxes/${boxId}/files/download?${params.toString()}`
    },
    getInlineUrl: (slug: string, boxId: string, path: string): string => {
      const params = new URLSearchParams({ path, inline: "true" })
      return `${API_URL}${p(slug)}/boxes/${boxId}/files/download?${params.toString()}`
    },
    writeFile: async (
      slug: string,
      boxId: string,
      path: string,
      content: string
    ): Promise<WriteFileResponse> => {
      const { data } = await client.post<WriteFileResponse>(
        `${p(slug)}/boxes/${boxId}/files/write`,
        content,
        {
          params: { path },
          headers: { "Content-Type": "application/octet-stream" },
        }
      )
      return data
    },
    uploadFile: async (
      slug: string,
      boxId: string,
      path: string,
      file: File
    ): Promise<UploadFileResponse> => {
      const formData = new FormData()
      formData.append("file", file)
      const { data } = await client.post<UploadFileResponse>(
        `${p(slug)}/boxes/${boxId}/files/upload`,
        formData,
        {
          params: { path },
          headers: { "Content-Type": "multipart/form-data" },
        }
      )
      return data
    },
    logs: async (
      slug: string,
      boxId: string,
      tail: number = 200
    ): Promise<ContainerLogs> => {
      const { data } = await client.get<ContainerLogs>(`${p(slug)}/boxes/${boxId}/logs`, {
        params: { tail },
      })
      return data
    },
  },
  models: {
    list: async (slug: string, profileId?: string): Promise<Array<Model>> => {
      const { data } = await client.get<Array<Model>>(`${p(slug)}/models`, {
        params: profileId ? { profile_id: profileId } : undefined,
      })
      return data
    },
    preview: async (slug: string, payload: ModelsPreviewRequest): Promise<Array<Model>> => {
      const { data } = await client.post<Array<Model>>(
        `${p(slug)}/models/preview`,
        payload
      )
      return data
    },
  },
  llmProfiles: {
    list: async (slug: string): Promise<Array<LLMProfile>> => {
      const { data } = await client.get<Array<LLMProfile>>(`${p(slug)}/llm-profiles`)
      return data
    },
    get: async (slug: string, id: string): Promise<LLMProfile> => {
      const { data } = await client.get<LLMProfile>(`${p(slug)}/llm-profiles/${id}`)
      return data
    },
    create: async (slug: string, payload: LLMProfileCreate): Promise<LLMProfile> => {
      const { data } = await client.post<LLMProfile>(`${p(slug)}/llm-profiles`, payload)
      return data
    },
    update: async (
      slug: string,
      id: string,
      payload: LLMProfileUpdate
    ): Promise<LLMProfile> => {
      const { data } = await client.patch<LLMProfile>(
        `${p(slug)}/llm-profiles/${id}`,
        payload
      )
      return data
    },
    delete: async (slug: string, id: string): Promise<void> => {
      await client.delete(`${p(slug)}/llm-profiles/${id}`)
    },
    duplicate: async (slug: string, id: string): Promise<LLMProfile> => {
      const { data } = await client.post<LLMProfile>(
        `${p(slug)}/llm-profiles/${id}/duplicate`
      )
      return data
    },
    export: async (
      slug: string,
      payload: LLMProfileExportRequest
    ): Promise<LLMProfileExportFile> => {
      const { data } = await client.post<LLMProfileExportFile>(
        `${p(slug)}/llm-profiles/export`,
        payload
      )
      return data
    },
    import: async (
      slug: string,
      payload: LLMProfileImportRequest
    ): Promise<LLMProfileImportResult> => {
      const { data } = await client.post<LLMProfileImportResult>(
        `${p(slug)}/llm-profiles/import`,
        payload
      )
      return data
    },
  },
  automations: {
    list: async (slug: string): Promise<Array<Automation>> => {
      const { data } = await client.get<{ automations: Array<Automation> }>(
        `${p(slug)}/automations`
      )
      return data.automations
    },
    get: async (slug: string, id: string): Promise<Automation> => {
      const { data } = await client.get<Automation>(
        `${p(slug)}/automations/${id}`
      )
      return data
    },
    create: async (
      slug: string,
      payload: AutomationCreate
    ): Promise<Automation> => {
      const { data } = await client.post<Automation>(
        `${p(slug)}/automations`,
        payload
      )
      return data
    },
    update: async (
      slug: string,
      id: string,
      payload: AutomationUpdate
    ): Promise<Automation> => {
      const { data } = await client.patch<Automation>(
        `${p(slug)}/automations/${id}`,
        payload
      )
      return data
    },
    delete: async (slug: string, id: string): Promise<void> => {
      await client.delete(`${p(slug)}/automations/${id}`)
    },
    listRuns: async (
      slug: string,
      id: string,
      params: { cursor?: string | null; status?: string | null; limit?: number } = {}
    ): Promise<AutomationRunList> => {
      const { data } = await client.get<AutomationRunList>(
        `${p(slug)}/automations/${id}/runs`,
        { params }
      )
      return data
    },
    dryRun: async (
      slug: string,
      id: string,
      payload: AutomationDryRunRequest
    ): Promise<AutomationDryRunResult> => {
      const { data } = await client.post<AutomationDryRunResult>(
        `${p(slug)}/automations/${id}/dry-run`,
        payload
      )
      return data
    },
  },
  projectSettings: {
    get: async (slug: string): Promise<ProjectSettings> => {
      const { data } = await client.get<ProjectSettings>(`${p(slug)}/settings`)
      return data
    },
    update: async (
      slug: string,
      payload: ProjectSettingsUpdate
    ): Promise<ProjectSettings> => {
      const { data } = await client.patch<ProjectSettings>(`${p(slug)}/settings`, payload)
      return data
    },
  },
  auth: {
    login: async (username: string, password: string): Promise<LoginResponse> => {
      const { data } = await client.post<LoginResponse>("/api/auth/login", {
        username,
        password,
      })
      return data
    },
    logout: async (): Promise<void> => {
      await client.post("/api/auth/logout")
    },
    me: async (): Promise<AuthUser> => {
      const { data } = await client.get<AuthUser>("/api/auth/me")
      return data
    },
    changePassword: async (oldPassword: string, newPassword: string): Promise<void> => {
      await client.post("/api/auth/change-password", {
        old_password: oldPassword,
        new_password: newPassword,
      })
    },
    listUsers: async (): Promise<Array<AuthUser>> => {
      const { data } = await client.get<Array<AuthUser>>("/api/auth/users")
      return data
    },
    createUser: async (
      username: string,
      password: string,
      userType: string,
      firstName?: string | null,
      lastName?: string | null
    ): Promise<AuthUser> => {
      const { data } = await client.post<AuthUser>("/api/auth/users", {
        username,
        password,
        user_type: userType,
        first_name: firstName ?? null,
        last_name: lastName ?? null,
      })
      return data
    },
    updateProfile: async (
      firstName: string | null,
      lastName: string | null
    ): Promise<AuthUser> => {
      const { data } = await client.patch<AuthUser>("/api/auth/me", {
        first_name: firstName,
        last_name: lastName,
      })
      return data
    },
    deleteUser: async (userId: string): Promise<void> => {
      await client.delete(`/api/auth/users/${userId}`)
    },
  },
  github: {
    status: async (slug: string): Promise<GitHubStatus> => {
      const { data } = await client.get<GitHubStatus>(`${p(slug)}/github/status`)
      return data
    },
    listInstallations: async (slug: string): Promise<Array<GitHubInstallation>> => {
      const { data } = await client.get<Array<GitHubInstallation>>(
        `${p(slug)}/github/installations`
      )
      return data
    },
    addInstallation: async (
      slug: string,
      installationId: number
    ): Promise<GitHubInstallation> => {
      const { data } = await client.post<GitHubInstallation>(
        `${p(slug)}/github/installations`,
        { installation_id: installationId }
      )
      return data
    },
    syncInstallation: async (slug: string, id: string): Promise<Array<GitHubRepo>> => {
      const { data } = await client.post<Array<GitHubRepo>>(
        `${p(slug)}/github/installations/${id}/sync`
      )
      return data
    },
    removeInstallation: async (slug: string, id: string): Promise<void> => {
      await client.delete(`${p(slug)}/github/installations/${id}`)
    },
    disconnectApp: async (slug: string): Promise<void> => {
      await client.delete(`${p(slug)}/github/app`)
    },
    listRepos: async (slug: string): Promise<Array<GitHubRepo>> => {
      const { data } = await client.get<Array<GitHubRepo>>(`${p(slug)}/github/repos`)
      return data
    },
    listBranches: async (
      slug: string,
      repo: string
    ): Promise<Array<GitHubBranch>> => {
      // ``repo`` is ``owner/name``; pass as two path segments so neither
      // needs encoding.
      const [owner, name] = repo.split("/", 2)
      const { data } = await client.get<Array<GitHubBranch>>(
        `${p(slug)}/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/branches`
      )
      return data
    },
    prepareManifest: async (
      slug: string,
      body: GitHubManifestPrepareRequest
    ): Promise<GitHubManifestPrepareResponse> => {
      const { data } = await client.post<GitHubManifestPrepareResponse>(
        `${p(slug)}/github/manifest/prepare`,
        body
      )
      return data
    },
  },
  platform: {
    listOrphanContainers: async (): Promise<Array<OrphanContainer>> => {
      const { data } = await client.get<Array<OrphanContainer>>(
        "/api/platform/orphan-containers"
      )
      return data
    },
    deleteOrphanContainer: async (containerId: string): Promise<void> => {
      await client.delete(
        `/api/platform/orphan-containers/${encodeURIComponent(containerId)}`
      )
    },
  },
} as const
