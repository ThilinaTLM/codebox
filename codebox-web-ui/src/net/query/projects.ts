import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {  useAuthQueryEnabled } from "./_internal"
import { projectsKeys } from "./keys"
import type {QueryHookOptions} from "./_internal";
import type { ProjectUpdatePayload } from "@/net/http/types"
import { useAuthStore } from "@/lib/auth"
import { api } from "@/net/http/api"

export function useProjects(options?: QueryHookOptions) {
  const user = useAuthStore((s) => s.user)
  const enabled = useAuthQueryEnabled(options?.enabled)
  return useQuery({
    queryKey: projectsKeys.list(user?.id),
    queryFn: () => api.projects.list(),
    enabled,
  })
}

export function useProject(slug: string | undefined, options?: QueryHookOptions) {
  const enabled = useAuthQueryEnabled((options?.enabled ?? true) && !!slug)
  return useQuery({
    queryKey: projectsKeys.detail(slug!),
    queryFn: () => api.projects.get(slug!),
    enabled,
  })
}

export function useProjectMembers(slug: string | undefined, options?: QueryHookOptions) {
  const enabled = useAuthQueryEnabled((options?.enabled ?? true) && !!slug)
  return useQuery({
    queryKey: projectsKeys.members(slug!),
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
      qc.invalidateQueries({ queryKey: projectsKeys.all() })
    },
  })
}

export function useUpdateProject(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: ProjectUpdatePayload) =>
      api.projects.update(slug, payload),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: projectsKeys.all() })
      qc.setQueryData(projectsKeys.detail(updated.slug), updated)
    },
  })
}

export function useArchiveProject(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.projects.archive(slug),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: projectsKeys.all() })
      qc.setQueryData(projectsKeys.detail(updated.slug), updated)
    },
  })
}

export function useRestoreProject(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.projects.restore(slug),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: projectsKeys.all() })
      qc.setQueryData(projectsKeys.detail(updated.slug), updated)
    },
  })
}

export function useDeleteProject(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.projects.delete(slug),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectsKeys.all() })
      qc.removeQueries({ queryKey: projectsKeys.detail(slug) })
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
    queryKey: projectsKeys.memberCandidates(slug!, query, limit),
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
      qc.invalidateQueries({ queryKey: projectsKeys.members(slug) })
    },
  })
}

export function useUpdateProjectMemberRole(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { userId: string; role: string }) =>
      api.projects.updateMemberRole(slug, data.userId, data.role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectsKeys.members(slug) })
    },
  })
}

export function useRemoveProjectMember(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => api.projects.removeMember(slug, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectsKeys.members(slug) })
    },
  })
}