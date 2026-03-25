import axios from "axios"
import type { Container, Task, TaskCreatePayload, TaskEvent } from "./types"
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
} as const
