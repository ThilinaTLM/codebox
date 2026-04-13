import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type {
  BoxCreatePayload,
  LLMProfileCreate,
  LLMProfileUpdate,
  UserSettingsUpdate,
} from "@/net/http/types"
import { useAuthStore } from "@/lib/auth"
import { api } from "@/net/http/api"

interface QueryHookOptions {
  enabled?: boolean
}

function useAuthQueryEnabled(enabled: boolean = true): boolean {
  const hasToken = useAuthStore((s) => !!s.token)
  return hasToken && enabled
}

// ── Box queries ──────────────────────────────────────────────

export function useBoxes(
  status?: string,
  trigger?: string,
  options?: QueryHookOptions
) {
  const enabled = useAuthQueryEnabled(options?.enabled)
  return useQuery({
    queryKey: ["boxes", status ?? "all", trigger ?? "all"],
    queryFn: () => api.boxes.list(status, trigger),
    enabled,
  })
}

export function useBox(boxId: string | undefined, options?: QueryHookOptions) {
  const enabled = useAuthQueryEnabled((options?.enabled ?? true) && !!boxId)
  return useQuery({
    queryKey: ["boxes", boxId],
    queryFn: () => api.boxes.get(boxId!),
    enabled,
  })
}

export function useBoxEvents(
  boxId: string | undefined,
  options?: QueryHookOptions
) {
  const enabled = useAuthQueryEnabled((options?.enabled ?? true) && !!boxId)
  return useQuery({
    queryKey: ["boxes", boxId, "events"],
    queryFn: () => api.boxes.getEvents(boxId!),
    enabled,
  })
}

export function useBoxFiles(
  boxId: string | undefined,
  path: string,
  options?: QueryHookOptions
) {
  const enabled = useAuthQueryEnabled((options?.enabled ?? true) && !!boxId)
  return useQuery({
    queryKey: ["boxes", boxId, "files", path],
    queryFn: () => api.boxes.listFiles(boxId!, path),
    enabled,
    refetchInterval: enabled ? 10000 : false,
  })
}

export function useBoxFileContent(
  boxId: string | undefined,
  path: string | null,
  options?: QueryHookOptions
) {
  const enabled = useAuthQueryEnabled(
    (options?.enabled ?? true) && !!boxId && !!path
  )
  return useQuery({
    queryKey: ["boxes", boxId, "file-content", path],
    queryFn: () => api.boxes.readFile(boxId!, path!),
    enabled,
  })
}

export function useBoxLogs(
  boxId: string | null,
  tail: number = 200,
  autoRefresh: boolean = false,
  options?: QueryHookOptions
) {
  const enabled = useAuthQueryEnabled((options?.enabled ?? true) && !!boxId)
  return useQuery({
    queryKey: ["boxes", boxId, "logs", tail],
    queryFn: () => api.boxes.logs(boxId!, tail),
    enabled,
    refetchInterval: enabled && autoRefresh ? 3000 : false,
  })
}

// ── Model queries ────────────────────────────────────────────

export function useModels(profileId?: string, options?: QueryHookOptions) {
  const enabled = useAuthQueryEnabled(options?.enabled)
  return useQuery({
    queryKey: ["models", profileId ?? "default"],
    queryFn: () => api.models.list(profileId),
    enabled,
    staleTime: 5 * 60 * 1000,
  })
}

// ── LLM Profile queries & mutations ─────────────────────────

export function useLLMProfiles(options?: QueryHookOptions) {
  const enabled = useAuthQueryEnabled(options?.enabled)
  return useQuery({
    queryKey: ["llm-profiles"],
    queryFn: () => api.llmProfiles.list(),
    enabled,
  })
}

export function useCreateLLMProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: LLMProfileCreate) => api.llmProfiles.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["llm-profiles"] })
    },
  })
}

export function useUpdateLLMProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: LLMProfileUpdate }) =>
      api.llmProfiles.update(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["llm-profiles"] })
    },
  })
}

export function useDeleteLLMProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.llmProfiles.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["llm-profiles"] })
    },
  })
}

// ── User Settings queries & mutations ───────────────────────

export function useUserSettings(options?: QueryHookOptions) {
  const enabled = useAuthQueryEnabled(options?.enabled)
  return useQuery({
    queryKey: ["user-settings"],
    queryFn: () => api.userSettings.get(),
    enabled,
  })
}

export function useUpdateUserSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: UserSettingsUpdate) =>
      api.userSettings.update(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-settings"] })
      qc.invalidateQueries({ queryKey: ["github", "status"] })
    },
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

export function useGitHubStatus(options?: QueryHookOptions) {
  const enabled = useAuthQueryEnabled(options?.enabled)
  return useQuery({
    queryKey: ["github", "status"],
    queryFn: () => api.github.status(),
    enabled,
  })
}

export function useGitHubInstallations(options?: QueryHookOptions) {
  const enabled = useAuthQueryEnabled(options?.enabled)
  return useQuery({
    queryKey: ["github", "installations"],
    queryFn: () => api.github.listInstallations(),
    enabled,
  })
}

export function useGitHubRepos(options?: QueryHookOptions) {
  const enabled = useAuthQueryEnabled(options?.enabled)
  return useQuery({
    queryKey: ["github", "repos"],
    queryFn: () => api.github.listRepos(),
    enabled,
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

export function useUsers(options?: QueryHookOptions) {
  const enabled = useAuthQueryEnabled(options?.enabled)
  return useQuery({
    queryKey: ["users"],
    queryFn: () => api.auth.listUsers(),
    enabled,
  })
}

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      username: string
      password: string
      userType: string
      firstName?: string | null
      lastName?: string | null
    }) =>
      api.auth.createUser(
        data.username,
        data.password,
        data.userType,
        data.firstName,
        data.lastName
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] })
    },
  })
}

export function useUpdateProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { firstName: string | null; lastName: string | null }) =>
      api.auth.updateProfile(data.firstName, data.lastName),
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
