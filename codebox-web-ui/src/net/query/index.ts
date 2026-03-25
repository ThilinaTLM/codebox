import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { api } from "@/net/http/api"
import type { SandboxCreatePayload, TaskCreatePayload } from "@/net/http/types"

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

// ── Sandbox queries ──────────────────────────────────────────

export function useSandboxes() {
  return useQuery({
    queryKey: ["sandboxes"],
    queryFn: () => api.sandboxes.list(),
    refetchInterval: 5000,
  })
}

export function useSandbox(sandboxId: string | undefined) {
  return useQuery({
    queryKey: ["sandboxes", sandboxId],
    queryFn: () => api.sandboxes.get(sandboxId!),
    enabled: !!sandboxId,
    refetchInterval: 3000,
  })
}

export function useSandboxFiles(
  sandboxId: string | undefined,
  path: string,
) {
  return useQuery({
    queryKey: ["sandboxes", sandboxId, "files", path],
    queryFn: () => api.sandboxes.listFiles(sandboxId!, path),
    enabled: !!sandboxId,
    refetchInterval: 10000,
  })
}

export function useSandboxFileContent(
  sandboxId: string | undefined,
  path: string | null,
) {
  return useQuery({
    queryKey: ["sandboxes", sandboxId, "file-content", path],
    queryFn: () => api.sandboxes.readFile(sandboxId!, path!),
    enabled: !!sandboxId && !!path,
  })
}

// ── Sandbox mutations ────────────────────────────────────────

export function useCreateSandbox() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: SandboxCreatePayload) =>
      api.sandboxes.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sandboxes"] })
    },
  })
}

export function useStopSandbox() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (sandboxId: string) => api.sandboxes.stop(sandboxId),
    onSuccess: (_data, sandboxId) => {
      qc.invalidateQueries({ queryKey: ["sandboxes", sandboxId] })
      qc.invalidateQueries({ queryKey: ["sandboxes"] })
    },
  })
}

export function useDeleteSandbox() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (sandboxId: string) => api.sandboxes.delete(sandboxId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sandboxes"] })
    },
  })
}

// ── GitHub queries ──────────────────────────────────────────

export function useGitHubStatus() {
  return useQuery({
    queryKey: ["github", "status"],
    queryFn: () => api.github.status(),
  })
}

export function useGitHubInstallations() {
  return useQuery({
    queryKey: ["github", "installations"],
    queryFn: () => api.github.listInstallations(),
  })
}

export function useGitHubRepos() {
  return useQuery({
    queryKey: ["github", "repos"],
    queryFn: () => api.github.listRepos(),
  })
}

export function useAddGitHubInstallation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (installationId: number) =>
      api.github.addInstallation(installationId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["github", "installations"] })
    },
  })
}

export function useSyncGitHubInstallation() {
  return useMutation({
    mutationFn: (id: string) => api.github.syncInstallation(id),
  })
}

export function useRemoveGitHubInstallation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.github.removeInstallation(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["github", "installations"] })
    },
  })
}
