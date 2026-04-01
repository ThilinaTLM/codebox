import axios from "axios"
import type {
  Box,
  BoxCreatePayload,
  BoxEvent,
  Container,
  ContainerLogs,
  FileContent,
  FileListResponse,
  GitHubInstallation,
  GitHubRepo,
  GitHubStatus,
  Model,
} from "./types"
import { API_URL } from "@/lib/constants"

const client = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
})

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
    getEvents: async (boxId: string): Promise<Array<BoxEvent>> => {
      const { data } = await client.get<Array<BoxEvent>>(
        `/api/boxes/${boxId}/events`
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
  },
  models: {
    list: async (): Promise<Array<Model>> => {
      const { data } = await client.get<Array<Model>>("/api/models")
      return data
    },
  },
  containers: {
    list: async (): Promise<Array<Container>> => {
      const { data } = await client.get<Array<Container>>("/api/containers")
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
    logs: async (
      containerId: string,
      tail: number = 200
    ): Promise<ContainerLogs> => {
      const { data } = await client.get<ContainerLogs>(
        `/api/containers/${containerId}/logs`,
        { params: { tail } }
      )
      return data
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
