import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type {
  AgentTemplateCreate,
  AgentTemplateDryRunRequest,
  AgentTemplateUpdate,
  Box,
  BoxCreatePayload,
  LLMProfileCreate,
  LLMProfileExportRequest,
  LLMProfileImportRequest,
  LLMProfileUpdate,
  ModelsPreviewRequest,
  ProjectSettingsUpdate,
  ProjectUpdatePayload,
} from "@/net/http/types"
import { ContainerStatus } from "@/net/http/types"
import { useAuthStore } from "@/lib/auth"
import { api } from "@/net/http/api"

interface QueryHookOptions {
  enabled?: boolean
}

function useAuthQueryEnabled(enabled: boolean = true): boolean {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return isAuthenticated && enabled
}

// ── Project queries ─────────────────────────────────────────

export function useProjects(options?: QueryHookOptions) {
  const enabled = useAuthQueryEnabled(options?.enabled)
  return useQuery({
    queryKey: ["projects"],
    queryFn: () => api.projects.list(),
    enabled,
  })
}

export function useProject(slug: string | undefined, options?: QueryHookOptions) {
  const enabled = useAuthQueryEnabled((options?.enabled ?? true) && !!slug)
  return useQuery({
    queryKey: ["projects", slug],
    queryFn: () => api.projects.get(slug!),
    enabled,
  })
}

export function useProjectMembers(slug: string | undefined, options?: QueryHookOptions) {
  const enabled = useAuthQueryEnabled((options?.enabled ?? true) && !!slug)
  return useQuery({
    queryKey: ["projects", slug, "members"],
    queryFn: () => api.projects.listMembers(slug!),
    enabled,
  })
}

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; description?: string | null }) =>
      api.projects.create(data.name, data.description),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] })
    },
  })
}

export function useUpdateProject(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: ProjectUpdatePayload) =>
      api.projects.update(slug, payload),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ["projects"] })
      qc.setQueryData(["projects", updated.slug], updated)
    },
  })
}

export function useArchiveProject(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.projects.archive(slug),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ["projects"] })
      qc.setQueryData(["projects", updated.slug], updated)
    },
  })
}

export function useRestoreProject(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.projects.restore(slug),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ["projects"] })
      qc.setQueryData(["projects", updated.slug], updated)
    },
  })
}

export function useDeleteProject(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.projects.delete(slug),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] })
      qc.removeQueries({ queryKey: ["projects", slug] })
    },
  })
}

export function useProjectMemberCandidates(
  slug: string | undefined,
  query: string,
  limit: number = 20,
  options?: QueryHookOptions
) {
  const enabled = useAuthQueryEnabled((options?.enabled ?? true) && !!slug)
  return useQuery({
    queryKey: ["projects", slug, "member-candidates", query, limit],
    queryFn: () => api.projects.searchMemberCandidates(slug!, query, limit),
    enabled,
    staleTime: 10_000,
  })
}

export function useAddProjectMember(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { userId: string; role?: string }) =>
      api.projects.addMember(slug, data.userId, data.role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects", slug, "members"] })
    },
  })
}

export function useUpdateProjectMemberRole(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { userId: string; role: string }) =>
      api.projects.updateMemberRole(slug, data.userId, data.role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects", slug, "members"] })
    },
  })
}

export function useRemoveProjectMember(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => api.projects.removeMember(slug, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects", slug, "members"] })
    },
  })
}

// ── Box queries (project-scoped) ────────────────────────────

export function useBoxes(
  slug: string | undefined,
  status?: string,
  trigger?: string,
  options?: QueryHookOptions
) {
  const enabled = useAuthQueryEnabled((options?.enabled ?? true) && !!slug)
  return useQuery({
    queryKey: ["projects", slug, "boxes", status ?? "all", trigger ?? "all"],
    queryFn: () => api.boxes.list(slug!, status, trigger),
    enabled,
  })
}

export function useBox(
  slug: string | undefined,
  boxId: string | undefined,
  options?: QueryHookOptions
) {
  const enabled = useAuthQueryEnabled((options?.enabled ?? true) && !!slug && !!boxId)
  return useQuery({
    queryKey: ["projects", slug, "boxes", boxId],
    queryFn: () => api.boxes.get(slug!, boxId!),
    enabled,
  })
}

export function useBoxEvents(
  slug: string | undefined,
  boxId: string | undefined,
  options?: QueryHookOptions & { limit?: number }
) {
  const enabled = useAuthQueryEnabled((options?.enabled ?? true) && !!slug && !!boxId)
  const limit = options?.limit
  return useQuery({
    queryKey: ["projects", slug, "boxes", boxId, "events", limit ?? "all"],
    queryFn: () => api.boxes.getEvents(slug!, boxId!, undefined, limit),
    enabled,
  })
}

export function useBoxFiles(
  slug: string | undefined,
  boxId: string | undefined,
  path: string,
  options?: QueryHookOptions
) {
  const enabled = useAuthQueryEnabled((options?.enabled ?? true) && !!slug && !!boxId)
  return useQuery({
    queryKey: ["projects", slug, "boxes", boxId, "files", path],
    queryFn: () => api.boxes.listFiles(slug!, boxId!, path),
    enabled,
    refetchInterval: enabled ? 10000 : false,
  })
}

export function useBoxFileContent(
  slug: string | undefined,
  boxId: string | undefined,
  path: string | null,
  options?: QueryHookOptions
) {
  const enabled = useAuthQueryEnabled(
    (options?.enabled ?? true) && !!slug && !!boxId && !!path
  )
  return useQuery({
    queryKey: ["projects", slug, "boxes", boxId, "file-content", path],
    queryFn: () => api.boxes.readFile(slug!, boxId!, path!),
    enabled,
  })
}

export function useWriteFile(slug: string, boxId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ path, content }: { path: string; content: string }) =>
      api.boxes.writeFile(slug, boxId, path, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", slug, "boxes", boxId, "files"] })
    },
  })
}

export function useUploadFile(slug: string, boxId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ path, file }: { path: string; file: File }) =>
      api.boxes.uploadFile(slug, boxId, path, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", slug, "boxes", boxId, "files"] })
    },
  })
}

export function useBoxLogs(
  slug: string | undefined,
  boxId: string | null,
  tail: number = 200,
  autoRefresh: boolean = false,
  options?: QueryHookOptions
) {
  const enabled = useAuthQueryEnabled((options?.enabled ?? true) && !!slug && !!boxId)
  return useQuery({
    queryKey: ["projects", slug, "boxes", boxId, "logs", tail],
    queryFn: () => api.boxes.logs(slug!, boxId!, tail),
    enabled,
    refetchInterval: enabled && autoRefresh ? 3000 : false,
  })
}

// ── Model queries (project-scoped) ──────────────────────────

export function useModels(
  slug: string | undefined,
  profileId?: string,
  options?: QueryHookOptions
) {
  const enabled = useAuthQueryEnabled((options?.enabled ?? true) && !!slug)
  return useQuery({
    queryKey: ["projects", slug, "models", profileId ?? "default"],
    queryFn: () => api.models.list(slug!, profileId),
    enabled,
    staleTime: 5 * 60 * 1000,
  })
}

export function usePreviewModels(slug: string) {
  return useMutation({
    mutationFn: (payload: ModelsPreviewRequest) => api.models.preview(slug, payload),
  })
}

// ── LLM Profile queries & mutations (project-scoped) ────────

export function useLLMProfiles(slug: string | undefined, options?: QueryHookOptions) {
  const enabled = useAuthQueryEnabled((options?.enabled ?? true) && !!slug)
  return useQuery({
    queryKey: ["projects", slug, "llm-profiles"],
    queryFn: () => api.llmProfiles.list(slug!),
    enabled,
  })
}

export function useCreateLLMProfile(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: LLMProfileCreate) => api.llmProfiles.create(slug, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects", slug, "llm-profiles"] })
    },
  })
}

export function useUpdateLLMProfile(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: LLMProfileUpdate }) =>
      api.llmProfiles.update(slug, id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects", slug, "llm-profiles"] })
    },
  })
}

export function useDeleteLLMProfile(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.llmProfiles.delete(slug, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects", slug, "llm-profiles"] })
    },
  })
}

export function useDuplicateLLMProfile(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.llmProfiles.duplicate(slug, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects", slug, "llm-profiles"] })
    },
  })
}

export function useExportLLMProfiles(slug: string) {
  return useMutation({
    mutationFn: (payload: LLMProfileExportRequest) =>
      api.llmProfiles.export(slug, payload),
  })
}

export function useImportLLMProfiles(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: LLMProfileImportRequest) =>
      api.llmProfiles.import(slug, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects", slug, "llm-profiles"] })
    },
  })
}

// ── Agent Templates queries & mutations ─────────────────────

export function useAgentTemplates(
  slug: string | undefined,
  options?: QueryHookOptions
) {
  const enabled = useAuthQueryEnabled((options?.enabled ?? true) && !!slug)
  return useQuery({
    queryKey: ["projects", slug, "agent-templates"],
    queryFn: () => api.agentTemplates.list(slug!),
    enabled,
  })
}

export function useAgentTemplate(
  slug: string | undefined,
  id: string | undefined,
  options?: QueryHookOptions
) {
  const enabled = useAuthQueryEnabled(
    (options?.enabled ?? true) && !!slug && !!id
  )
  return useQuery({
    queryKey: ["projects", slug, "agent-templates", id],
    queryFn: () => api.agentTemplates.get(slug!, id!),
    enabled,
  })
}

export function useCreateAgentTemplate(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: AgentTemplateCreate) =>
      api.agentTemplates.create(slug, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects", slug, "agent-templates"] })
    },
  })
}

export function useUpdateAgentTemplate(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: AgentTemplateUpdate }) =>
      api.agentTemplates.update(slug, id, payload),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["projects", slug, "agent-templates"] })
      qc.invalidateQueries({
        queryKey: ["projects", slug, "agent-templates", variables.id],
      })
    },
  })
}

export function useDeleteAgentTemplate(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.agentTemplates.delete(slug, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects", slug, "agent-templates"] })
    },
  })
}

export function useAgentTemplateRuns(
  slug: string | undefined,
  id: string | undefined,
  params: { status?: string | null; limit?: number } = {},
  options?: QueryHookOptions
) {
  const enabled = useAuthQueryEnabled(
    (options?.enabled ?? true) && !!slug && !!id
  )
  return useQuery({
    queryKey: ["projects", slug, "agent-templates", id, "runs", params],
    queryFn: () => api.agentTemplates.listRuns(slug!, id!, params),
    enabled,
  })
}

export function useDryRunAgentTemplate(slug: string, id: string) {
  return useMutation({
    mutationFn: (payload: AgentTemplateDryRunRequest) =>
      api.agentTemplates.dryRun(slug, id, payload),
  })
}

// ── Project Settings queries & mutations ────────────────────

export function useProjectSettings(slug: string | undefined, options?: QueryHookOptions) {
  const enabled = useAuthQueryEnabled((options?.enabled ?? true) && !!slug)
  return useQuery({
    queryKey: ["projects", slug, "settings"],
    queryFn: () => api.projectSettings.get(slug!),
    enabled,
  })
}

export function useUpdateProjectSettings(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: ProjectSettingsUpdate) =>
      api.projectSettings.update(slug, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects", slug, "settings"] })
      qc.invalidateQueries({ queryKey: ["projects", slug, "github", "status"] })
    },
  })
}

// ── Box mutations (project-scoped) ──────────────────────────

export function useCreateBox(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: BoxCreatePayload) => api.boxes.create(slug, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects", slug, "boxes"] })
    },
  })
}

export function useStopBox(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (boxId: string) => api.boxes.stop(slug, boxId),
    onMutate: async (boxId) => {
      await qc.cancelQueries({ queryKey: ["projects", slug, "boxes", boxId] })
      await qc.cancelQueries({ queryKey: ["projects", slug, "boxes"] })

      const previousBox = qc.getQueryData<Box>(["projects", slug, "boxes", boxId])
      if (previousBox) {
        qc.setQueryData<Box>(["projects", slug, "boxes", boxId], {
          ...previousBox,
          container_status: ContainerStatus.STOPPED,
          activity: null,
        })
      }

      const previousLists = qc.getQueriesData<Array<Box>>({
        queryKey: ["projects", slug, "boxes"],
      })
      qc.setQueriesData<Array<Box>>({ queryKey: ["projects", slug, "boxes"] }, (old) =>
        Array.isArray(old)
          ? old.map((b) =>
              b.id === boxId
                ? { ...b, container_status: ContainerStatus.STOPPED, activity: null }
                : b
            )
          : old
      )

      return { previousBox, previousLists }
    },
    onError: (_err, boxId, context) => {
      if (!context) return
      if (context.previousBox) {
        qc.setQueryData(["projects", slug, "boxes", boxId], context.previousBox)
      }
      context.previousLists.forEach(([key, data]) => {
        qc.setQueryData(key, data)
      })
    },
    onSettled: (_data, _err, boxId) => {
      qc.invalidateQueries({ queryKey: ["projects", slug, "boxes", boxId] })
      qc.invalidateQueries({ queryKey: ["projects", slug, "boxes"] })
    },
  })
}

export function useRestartBox(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (boxId: string) => api.boxes.restart(slug, boxId),
    onSuccess: (_data, boxId) => {
      qc.invalidateQueries({ queryKey: ["projects", slug, "boxes", boxId] })
      qc.invalidateQueries({ queryKey: ["projects", slug, "boxes"] })
    },
  })
}

export function useCancelBox(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (boxId: string) => api.boxes.cancel(slug, boxId),
    onSuccess: (_data, boxId) => {
      qc.invalidateQueries({ queryKey: ["projects", slug, "boxes", boxId] })
      qc.invalidateQueries({ queryKey: ["projects", slug, "boxes"] })
    },
  })
}

export function useDeleteBox(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (boxId: string) => api.boxes.delete(slug, boxId),
    onMutate: async (boxId) => {
      await qc.cancelQueries({ queryKey: ["projects", slug, "boxes"] })

      const previousLists = qc.getQueriesData<Array<Box>>({
        queryKey: ["projects", slug, "boxes"],
      })

      qc.setQueriesData<Array<Box>>({ queryKey: ["projects", slug, "boxes"] }, (old) =>
        Array.isArray(old) ? old.filter((b) => b.id !== boxId) : old
      )

      qc.removeQueries({ queryKey: ["projects", slug, "boxes", boxId] })

      return { previousLists }
    },
    onError: (_err, _boxId, context) => {
      if (!context) return
      context.previousLists.forEach(([key, data]) => {
        qc.setQueryData(key, data)
      })
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["projects", slug, "boxes"] })
    },
  })
}

export function useSendMessage(slug: string) {
  return useMutation({
    mutationFn: ({ boxId, message }: { boxId: string; message: string }) =>
      api.boxes.sendMessage(slug, boxId, message),
  })
}

// ── GitHub queries (project-scoped) ─────────────────────────

export function useGitHubStatus(slug: string | undefined, options?: QueryHookOptions) {
  const enabled = useAuthQueryEnabled((options?.enabled ?? true) && !!slug)
  return useQuery({
    queryKey: ["projects", slug, "github", "status"],
    queryFn: () => api.github.status(slug!),
    enabled,
  })
}

export function useGitHubInstallations(slug: string | undefined, options?: QueryHookOptions) {
  const enabled = useAuthQueryEnabled((options?.enabled ?? true) && !!slug)
  return useQuery({
    queryKey: ["projects", slug, "github", "installations"],
    queryFn: () => api.github.listInstallations(slug!),
    enabled,
  })
}

export function useGitHubRepos(slug: string | undefined, options?: QueryHookOptions) {
  const enabled = useAuthQueryEnabled((options?.enabled ?? true) && !!slug)
  return useQuery({
    queryKey: ["projects", slug, "github", "repos"],
    queryFn: () => api.github.listRepos(slug!),
    enabled,
  })
}

export function useAddGitHubInstallation(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (installationId: number) =>
      api.github.addInstallation(slug, installationId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects", slug, "github", "installations"] })
    },
  })
}

export function useSyncGitHubInstallation(slug: string) {
  return useMutation({
    mutationFn: (id: string) => api.github.syncInstallation(slug, id),
  })
}

export function useRemoveGitHubInstallation(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.github.removeInstallation(slug, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects", slug, "github", "installations"] })
    },
  })
}

export function usePrepareGitHubManifest(slug: string) {
  return useMutation({
    mutationFn: (body: {
      owner_type: "user" | "organization"
      owner_name?: string | null
    }) => api.github.prepareManifest(slug, body),
  })
}

// ── Auth queries & mutations (global, not project-scoped) ───

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
