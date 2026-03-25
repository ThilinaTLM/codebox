import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { api } from "@/net/http/api"
import type { TaskCreatePayload } from "@/net/http/types"

// ── Task queries ──────────────────────────────────────────────

export function useTasks(status?: string) {
  return useQuery({
    queryKey: ["tasks", status ?? "all"],
    queryFn: () => api.tasks.list(status),
    refetchInterval: 5000,
  })
}

export function useTask(taskId: string | undefined) {
  return useQuery({
    queryKey: ["tasks", taskId],
    queryFn: () => api.tasks.get(taskId!),
    enabled: !!taskId,
    refetchInterval: 3000,
  })
}

export function useTaskEvents(taskId: string | undefined) {
  return useQuery({
    queryKey: ["tasks", taskId, "events"],
    queryFn: () => api.tasks.getEvents(taskId!),
    enabled: !!taskId,
  })
}

// ── Container queries ─────────────────────────────────────────

export function useContainers() {
  return useQuery({
    queryKey: ["containers"],
    queryFn: api.containers.list,
    refetchInterval: 10000,
  })
}

// ── Mutations ─────────────────────────────────────────────────

export function useCreateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: TaskCreatePayload) => api.tasks.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] })
    },
  })
}

export function useCancelTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (taskId: string) => api.tasks.cancel(taskId),
    onSuccess: (_data, taskId) => {
      qc.invalidateQueries({ queryKey: ["tasks", taskId] })
      qc.invalidateQueries({ queryKey: ["tasks"] })
    },
  })
}

export function useDeleteTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (taskId: string) => api.tasks.delete(taskId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] })
    },
  })
}

export function useSendFeedback() {
  return useMutation({
    mutationFn: ({ taskId, message }: { taskId: string; message: string }) =>
      api.tasks.sendFeedback(taskId, message),
  })
}

export function useStopContainer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (containerId: string) => api.containers.stop(containerId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["containers"] })
    },
  })
}
