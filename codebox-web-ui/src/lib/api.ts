import axios from "axios"
import type { Container, Task, TaskCreatePayload, TaskEvent } from "./types"

const API_URL =
  typeof window !== "undefined"
    ? (import.meta.env.VITE_API_URL ?? "http://localhost:8080")
    : "http://localhost:8080"

export const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
})

// ── Tasks ─────────────────────────────────────────────────────

export async function getTasks(status?: string): Promise<Task[]> {
  const params = status ? { status } : undefined
  const { data } = await api.get<Task[]>("/api/tasks", { params })
  return data
}

export async function getTask(taskId: string): Promise<Task> {
  const { data } = await api.get<Task>(`/api/tasks/${taskId}`)
  return data
}

export async function createTask(payload: TaskCreatePayload): Promise<Task> {
  const { data } = await api.post<Task>("/api/tasks", payload)
  return data
}

export async function cancelTask(taskId: string): Promise<Task> {
  const { data } = await api.post<Task>(`/api/tasks/${taskId}/cancel`)
  return data
}

export async function deleteTask(taskId: string): Promise<void> {
  await api.delete(`/api/tasks/${taskId}`)
}

export async function sendFeedback(
  taskId: string,
  message: string,
): Promise<void> {
  await api.post(`/api/tasks/${taskId}/feedback`, { message })
}

export async function getTaskEvents(taskId: string): Promise<TaskEvent[]> {
  const { data } = await api.get<TaskEvent[]>(`/api/tasks/${taskId}/events`)
  return data
}

// ── Containers ────────────────────────────────────────────────

export async function getContainers(): Promise<Container[]> {
  const { data } = await api.get<Container[]>("/api/containers")
  return data
}

export async function stopContainer(containerId: string): Promise<void> {
  await api.post(`/api/containers/${containerId}/stop`)
}

// ── WebSocket URL helper ──────────────────────────────────────

export function getWsUrl(taskId: string): string {
  const wsBase =
    typeof window !== "undefined"
      ? (import.meta.env.VITE_WS_URL ?? "ws://localhost:8080")
      : "ws://localhost:8080"
  return `${wsBase}/api/tasks/${taskId}/ws`
}
