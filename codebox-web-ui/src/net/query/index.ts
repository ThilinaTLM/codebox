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

export function useBoxMessages(boxId: string | undefined) {
  return useQuery({
    queryKey: ["boxes", boxId, "messages"],
    queryFn: () => api.boxes.getMessages(boxId!),
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

export function useBoxLogs(
  boxId: string | null,
  tail: number = 200,
  autoRefresh: boolean = false
) {
  return useQuery({
    queryKey: ["boxes", boxId, "logs", tail],
    queryFn: () => api.boxes.logs(boxId!, tail),
    enabled: !!boxId,
    refetchInterval: autoRefresh ? 3000 : false,
  })
}

// ── Model queries ────────────────────────────────────────────

export function useModels(provider?: string) {
  return useQuery({
    queryKey: ["models", provider ?? "default"],
    queryFn: () => api.models.list(provider),
    staleTime: 5 * 60 * 1000,
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

// ── Auth queries & mutations ────────────────────────────────

export function useUsers() {
  return useQuery({
    queryKey: ["users"],
    queryFn: () => api.auth.listUsers(),
  })
}

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      username: string
      password: string
      userType: string
    }) => api.auth.createUser(data.username, data.password, data.userType),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] })
    },
  })
}

export function useDeleteUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => api.auth.deleteUser(userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] })
    },
  })
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (data: { oldPassword: string; newPassword: string }) =>
      api.auth.changePassword(data.oldPassword, data.newPassword),
  })
}
