import axios from "axios"
import type {
  Container,
  FileContent,
  FileListResponse,
  GitHubInstallation,
  GitHubRepo,
  GitHubStatus,
  Sandbox,
  SandboxCreatePayload,
  Task,
  TaskCreatePayload,
  TaskEvent,
} from "./types"
import { API_URL } from "@/lib/constants"

const client = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
})

export const api = {
  tasks: {
    list: async (status?: string): Promise<Task[]> => {
      const params = status ? { status } : undefined
      const { data } = await client.get<Task[]>("/api/tasks", { params })
      return data
    },
    get: async (taskId: string): Promise<Task> => {
      const { data } = await client.get<Task>(`/api/tasks/${taskId}`)
      return data
    },
    create: async (payload: TaskCreatePayload): Promise<Task> => {
      const { data } = await client.post<Task>("/api/tasks", payload)
      return data
    },
    cancel: async (taskId: string): Promise<Task> => {
      const { data } = await client.post<Task>(`/api/tasks/${taskId}/cancel`)
      return data
    },
    delete: async (taskId: string): Promise<void> => {
      await client.delete(`/api/tasks/${taskId}`)
    },
    sendFeedback: async (taskId: string, message: string): Promise<void> => {
      await client.post(`/api/tasks/${taskId}/feedback`, { message })
    },
    getEvents: async (taskId: string): Promise<TaskEvent[]> => {
      const { data } = await client.get<TaskEvent[]>(
        `/api/tasks/${taskId}/events`,
      )
      return data
    },
  },
  containers: {
    list: async (): Promise<Container[]> => {
      const { data } = await client.get<Container[]>("/api/containers")
      return data
    },
    stop: async (containerId: string): Promise<void> => {
      await client.post(`/api/containers/${containerId}/stop`)
    },
  },
  sandboxes: {
    list: async (): Promise<Sandbox[]> => {
      const { data } = await client.get<Sandbox[]>("/api/sandboxes")
      return data
    },
    get: async (sandboxId: string): Promise<Sandbox> => {
      const { data } = await client.get<Sandbox>(`/api/sandboxes/${sandboxId}`)
      return data
    },
    create: async (payload: SandboxCreatePayload): Promise<Sandbox> => {
      const { data } = await client.post<Sandbox>("/api/sandboxes", payload)
      return data
    },
    stop: async (sandboxId: string): Promise<Sandbox> => {
      const { data } = await client.post<Sandbox>(
        `/api/sandboxes/${sandboxId}/stop`,
      )
      return data
    },
    delete: async (sandboxId: string): Promise<void> => {
      await client.delete(`/api/sandboxes/${sandboxId}`)
    },
    listFiles: async (
      sandboxId: string,
      path: string = "/workspace",
    ): Promise<FileListResponse> => {
      const { data } = await client.get<FileListResponse>(
        `/api/sandboxes/${sandboxId}/files`,
        { params: { path } },
      )
      return data
    },
    readFile: async (
      sandboxId: string,
      path: string,
    ): Promise<FileContent> => {
      const { data } = await client.get<FileContent>(
        `/api/sandboxes/${sandboxId}/files/read`,
        { params: { path } },
      )
      return data
    },
  },
  github: {
    status: async (): Promise<GitHubStatus> => {
      const { data } = await client.get<GitHubStatus>("/api/github/status")
      return data
    },
    listInstallations: async (): Promise<GitHubInstallation[]> => {
      const { data } = await client.get<GitHubInstallation[]>(
        "/api/github/installations",
      )
      return data
    },
    addInstallation: async (
      installationId: number,
    ): Promise<GitHubInstallation> => {
      const { data } = await client.post<GitHubInstallation>(
        "/api/github/installations",
        { installation_id: installationId },
      )
      return data
    },
    syncInstallation: async (id: string): Promise<GitHubRepo[]> => {
      const { data } = await client.post<GitHubRepo[]>(
        `/api/github/installations/${id}/sync`,
      )
      return data
    },
    removeInstallation: async (id: string): Promise<void> => {
      await client.delete(`/api/github/installations/${id}`)
    },
    listRepos: async (): Promise<GitHubRepo[]> => {
      const { data } = await client.get<GitHubRepo[]>("/api/github/repos")
      return data
    },
  },
} as const
