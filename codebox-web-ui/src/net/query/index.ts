import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { BoxCreatePayload } from "@/net/http/types"
import { api } from "@/net/http/api"

// ── Box queries ──────────────────────────────────────────────

export function useBoxes(status?: string, trigger?: string) {
  return useQuery({
    queryKey: ["boxes", status ?? "all", trigger ?? "all"],
    queryFn: () => api.boxes.list(status, trigger),
  })
}

export function useBox(boxId: string | undefined) {
  return useQuery({
    queryKey: ["boxes", boxId],
    queryFn: () => api.boxes.get(boxId!),
    enabled: !!boxId,
  })
}

export function useBoxEvents(boxId: string | undefined) {
  return useQuery({
    queryKey: ["boxes", boxId, "events"],
    queryFn: () => api.boxes.getEvents(boxId!),
    enabled: !!boxId,
  })
}

export function useBoxFiles(boxId: string | undefined, path: string) {
  return useQuery({
    queryKey: ["boxes", boxId, "files", path],
    queryFn: () => api.boxes.listFiles(boxId!, path),
    enabled: !!boxId,
    refetchInterval: 10000,
  })
}

export function useBoxFileContent(
  boxId: string | undefined,
  path: string | null
) {
  return useQuery({
    queryKey: ["boxes", boxId, "file-content", path],
    queryFn: () => api.boxes.readFile(boxId!, path!),
    enabled: !!boxId && !!path,
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

export function useContainerLogs(
  containerId: string | null,
  tail: number = 200,
  autoRefresh: boolean = false
) {
  return useQuery({
    queryKey: ["containers", containerId, "logs", tail],
    queryFn: () => api.containers.logs(containerId!, tail),
    enabled: !!containerId,
    refetchInterval: autoRefresh ? 3000 : false,
  })
}

// ── Box mutations ────────────────────────────────────────────

export function useCreateBox() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: BoxCreatePayload) => api.boxes.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["boxes"] })
    },
  })
}

export function useStopBox() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (boxId: string) => api.boxes.stop(boxId),
    onSuccess: (_data, boxId) => {
      qc.invalidateQueries({ queryKey: ["boxes", boxId] })
      qc.invalidateQueries({ queryKey: ["boxes"] })
    },
  })
}

export function useRestartBox() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (boxId: string) => api.boxes.restart(boxId),
    onSuccess: (_data, boxId) => {
      qc.invalidateQueries({ queryKey: ["boxes", boxId] })
      qc.invalidateQueries({ queryKey: ["boxes"] })
    },
  })
}

export function useCancelBox() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (boxId: string) => api.boxes.cancel(boxId),
    onSuccess: (_data, boxId) => {
      qc.invalidateQueries({ queryKey: ["boxes", boxId] })
      qc.invalidateQueries({ queryKey: ["boxes"] })
    },
  })
}

export function useDeleteBox() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (boxId: string) => api.boxes.delete(boxId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["boxes"] })
    },
  })
}

export function useSendMessage() {
  return useMutation({
    mutationFn: ({ boxId, message }: { boxId: string; message: string }) =>
      api.boxes.sendMessage(boxId, message),
  })
}

export function useSendExec() {
  return useMutation({
    mutationFn: ({ boxId, command }: { boxId: string; command: string }) =>
      api.boxes.sendExec(boxId, command),
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

export function useStartContainer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (containerId: string) => api.containers.start(containerId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["containers"] })
    },
  })
}

export function useDeleteContainer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (containerId: string) => api.containers.delete(containerId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["containers"] })
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
