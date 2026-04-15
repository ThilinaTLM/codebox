import axios from "axios"
import type {
  AuthUser,
  Box,
  BoxCreatePayload,
  CanonicalEvent,
  ContainerLogs,
  FileContent,
  FileListResponse,
  GitHubInstallation,
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
  UploadFileResponse,
  UserSettings,
  UserSettingsUpdate,
  WriteFileResponse,
} from "./types"
import { API_URL } from "@/lib/constants"
import { useAuthStore } from "@/lib/auth"

const client = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
})

export function isAuthError(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 401
}

// Clear auth state on 401 responses
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (isAuthError(error)) {
      // Don't logout on failed login attempts
      const url = error.config?.url ?? ""
      if (!url.endsWith("/auth/login")) {
        useAuthStore.getState().logout()
      }
    }
    return Promise.reject(error)
  }
)

export const api = {
  boxes: {
    list: async (status?: string, trigger?: string): Promise<Array<Box>> => {
      const params: Record<string, string> = {}
      if (status) params.status = status
      if (trigger) params.trigger = trigger
      const { data } = await client.get<Array<Box>>("/api/boxes", { params })
      return data
    },
    get: async (boxId: string): Promise<Box> => {
      const { data } = await client.get<Box>(`/api/boxes/${boxId}`)
      return data
    },
    create: async (payload: BoxCreatePayload): Promise<Box> => {
      const { data } = await client.post<Box>("/api/boxes", payload)
      return data
    },
    stop: async (boxId: string): Promise<Box> => {
      const { data } = await client.post<Box>(`/api/boxes/${boxId}/stop`)
      return data
    },
    restart: async (boxId: string): Promise<Box> => {
      const { data } = await client.post<Box>(`/api/boxes/${boxId}/restart`)
      return data
    },
    cancel: async (boxId: string): Promise<void> => {
      await client.post(`/api/boxes/${boxId}/cancel`)
    },
    delete: async (boxId: string): Promise<void> => {
      await client.delete(`/api/boxes/${boxId}`)
    },
    sendMessage: async (boxId: string, message: string): Promise<void> => {
      await client.post(`/api/boxes/${boxId}/message`, { message })
    },
    sendExec: async (boxId: string, command: string): Promise<void> => {
      await client.post(`/api/boxes/${boxId}/exec`, { command })
    },
    getEvents: async (
      boxId: string,
      afterSeq?: number
    ): Promise<Array<CanonicalEvent>> => {
      const { data } = await client.get<Array<CanonicalEvent>>(
        `/api/boxes/${boxId}/events`,
        { params: afterSeq != null ? { after_seq: afterSeq } : undefined }
      )
      return data
    },
    listFiles: async (
      boxId: string,
      path: string = "/workspace"
    ): Promise<FileListResponse> => {
      const { data } = await client.get<FileListResponse>(
        `/api/boxes/${boxId}/files`,
        { params: { path } }
      )
      return data
    },
    readFile: async (boxId: string, path: string): Promise<FileContent> => {
      const { data } = await client.get<FileContent>(
        `/api/boxes/${boxId}/files/read`,
        { params: { path } }
      )
      return data
    },
    getDownloadUrl: (boxId: string, path: string): string => {
      const params = new URLSearchParams({ path })
      return `${API_URL}/api/boxes/${boxId}/files/download?${params.toString()}`
    },
    writeFile: async (
      boxId: string,
      path: string,
      content: string
    ): Promise<WriteFileResponse> => {
      const { data } = await client.post<WriteFileResponse>(
        `/api/boxes/${boxId}/files/write`,
        content,
        {
          params: { path },
          headers: { "Content-Type": "application/octet-stream" },
        }
      )
      return data
    },
    uploadFile: async (
      boxId: string,
      path: string,
      file: File
    ): Promise<UploadFileResponse> => {
      const formData = new FormData()
      formData.append("file", file)
      const { data } = await client.post<UploadFileResponse>(
        `/api/boxes/${boxId}/files/upload`,
        formData,
        {
          params: { path },
          headers: { "Content-Type": "multipart/form-data" },
        }
      )
      return data
    },
    logs: async (boxId: string, tail: number = 200): Promise<ContainerLogs> => {
      const { data } = await client.get<ContainerLogs>(
        `/api/boxes/${boxId}/logs`,
        { params: { tail } }
      )
      return data
    },
  },
  models: {
    list: async (profileId?: string): Promise<Array<Model>> => {
      const { data } = await client.get<Array<Model>>("/api/models", {
        params: profileId ? { profile_id: profileId } : undefined,
      })
      return data
    },
    preview: async (payload: ModelsPreviewRequest): Promise<Array<Model>> => {
      const { data } = await client.post<Array<Model>>("/api/models/preview", payload)
      return data
    },
  },
  llmProfiles: {
    list: async (): Promise<Array<LLMProfile>> => {
      const { data } = await client.get<Array<LLMProfile>>("/api/llm-profiles")
      return data
    },
    get: async (id: string): Promise<LLMProfile> => {
      const { data } = await client.get<LLMProfile>(`/api/llm-profiles/${id}`)
      return data
    },
    create: async (payload: LLMProfileCreate): Promise<LLMProfile> => {
      const { data } = await client.post<LLMProfile>("/api/llm-profiles", payload)
      return data
    },
    update: async (id: string, payload: LLMProfileUpdate): Promise<LLMProfile> => {
      const { data } = await client.put<LLMProfile>(`/api/llm-profiles/${id}`, payload)
      return data
    },
    delete: async (id: string): Promise<void> => {
      await client.delete(`/api/llm-profiles/${id}`)
    },
    duplicate: async (id: string): Promise<LLMProfile> => {
      const { data } = await client.post<LLMProfile>(`/api/llm-profiles/${id}/duplicate`)
      return data
    },
    export: async (payload: LLMProfileExportRequest): Promise<LLMProfileExportFile> => {
      const { data } = await client.post<LLMProfileExportFile>("/api/llm-profiles/export", payload)
      return data
    },
    import: async (payload: LLMProfileImportRequest): Promise<LLMProfileImportResult> => {
      const { data } = await client.post<LLMProfileImportResult>("/api/llm-profiles/import", payload)
      return data
    },
  },
  userSettings: {
    get: async (): Promise<UserSettings> => {
      const { data } = await client.get<UserSettings>("/api/user/settings")
      return data
    },
    update: async (payload: UserSettingsUpdate): Promise<UserSettings> => {
      const { data } = await client.patch<UserSettings>("/api/user/settings", payload)
      return data
    },
  },
  auth: {
    login: async (
      username: string,
      password: string
    ): Promise<LoginResponse> => {
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
    changePassword: async (
      oldPassword: string,
      newPassword: string
    ): Promise<void> => {
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
    status: async (): Promise<GitHubStatus> => {
      const { data } = await client.get<GitHubStatus>("/api/github/status")
      return data
    },
    listInstallations: async (): Promise<Array<GitHubInstallation>> => {
      const { data } = await client.get<Array<GitHubInstallation>>(
        "/api/github/installations"
      )
      return data
    },
    addInstallation: async (
      installationId: number
    ): Promise<GitHubInstallation> => {
      const { data } = await client.post<GitHubInstallation>(
        "/api/github/installations",
        { installation_id: installationId }
      )
      return data
    },
    syncInstallation: async (id: string): Promise<Array<GitHubRepo>> => {
      const { data } = await client.post<Array<GitHubRepo>>(
        `/api/github/installations/${id}/sync`
      )
      return data
    },
    removeInstallation: async (id: string): Promise<void> => {
      await client.delete(`/api/github/installations/${id}`)
    },
    listRepos: async (): Promise<Array<GitHubRepo>> => {
      const { data } = await client.get<Array<GitHubRepo>>("/api/github/repos")
      return data
    },
  },
} as const
