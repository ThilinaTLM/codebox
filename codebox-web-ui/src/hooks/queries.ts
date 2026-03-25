import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import {
  cancelTask,
  createTask,
  deleteTask,
  getContainers,
  getTask,
  getTaskEvents,
  getTasks,
  sendFeedback,
  stopContainer,
} from "@/lib/api"
import type { TaskCreatePayload } from "@/lib/types"

// ── Task queries ──────────────────────────────────────────────

export function useTasks(status?: string) {
  return useQuery({
    queryKey: ["tasks", status ?? "all"],
    queryFn: () => getTasks(status),
    refetchInterval: 5000,
  })
}

export function useTask(taskId: string | undefined) {
  return useQuery({
    queryKey: ["tasks", taskId],
    queryFn: () => getTask(taskId!),
    enabled: !!taskId,
    refetchInterval: 3000,
  })
}

export function useTaskEvents(taskId: string | undefined) {
  return useQuery({
    queryKey: ["tasks", taskId, "events"],
    queryFn: () => getTaskEvents(taskId!),
    enabled: !!taskId,
  })
}

// ── Container queries ─────────────────────────────────────────

export function useContainers() {
  return useQuery({
    queryKey: ["containers"],
    queryFn: getContainers,
    refetchInterval: 10000,
  })
}

// ── Mutations ─────────────────────────────────────────────────

export function useCreateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: TaskCreatePayload) => createTask(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] })
    },
  })
}

export function useCancelTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (taskId: string) => cancelTask(taskId),
    onSuccess: (_data, taskId) => {
      qc.invalidateQueries({ queryKey: ["tasks", taskId] })
      qc.invalidateQueries({ queryKey: ["tasks"] })
    },
  })
}

export function useDeleteTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (taskId: string) => deleteTask(taskId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] })
    },
  })
}

export function useSendFeedback() {
  return useMutation({
    mutationFn: ({ taskId, message }: { taskId: string; message: string }) =>
      sendFeedback(taskId, message),
  })
}

export function useStopContainer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (containerId: string) => stopContainer(containerId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["containers"] })
    },
  })
}
