import axios from "axios"
import type {
  Box,
  BoxCreatePayload,
  BoxEvent,
  Container,
  FileContent,
  FileListResponse,
  GitHubInstallation,
  GitHubRepo,
  GitHubStatus,
} from "./types"
import { API_URL } from "@/lib/constants"

const client = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
})

export const api = {
  boxes: {
    list: async (status?: string, trigger?: string): Promise<Box[]> => {
      const params: Record<string, string> = {}
      if (status) params.status = status
      if (trigger) params.trigger = trigger
      const { data } = await client.get<Box[]>("/api/boxes", { params })
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
    cancel: async (boxId: string): Promise<void> => {
      await client.post(`/api/boxes/${boxId}/cancel`)
    },
    delete: async (boxId: string): Promise<void> => {
      await client.delete(`/api/boxes/${boxId}`)
    },
    sendMessage: async (boxId: string, message: string): Promise<void> => {
      await client.post(`/api/boxes/${boxId}/message`, { message })
    },
    getEvents: async (boxId: string): Promise<BoxEvent[]> => {
      const { data } = await client.get<BoxEvent[]>(
        `/api/boxes/${boxId}/events`,
      )
      return data
    },
    listFiles: async (
      boxId: string,
      path: string = "/workspace",
    ): Promise<FileListResponse> => {
      const { data } = await client.get<FileListResponse>(
        `/api/boxes/${boxId}/files`,
        { params: { path } },
      )
      return data
    },
    readFile: async (
      boxId: string,
      path: string,
    ): Promise<FileContent> => {
      const { data } = await client.get<FileContent>(
        `/api/boxes/${boxId}/files/read`,
        { params: { path } },
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
    start: async (containerId: string): Promise<void> => {
      await client.post(`/api/containers/${containerId}/start`)
    },
    delete: async (containerId: string): Promise<void> => {
      await client.delete(`/api/containers/${containerId}`)
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
