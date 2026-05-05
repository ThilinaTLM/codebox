import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {  useAuthQueryEnabled } from "./_internal"
import { projectsKeys } from "./keys"
import type {QueryHookOptions} from "./_internal";
import { api } from "@/net/http/api"

export function useGitHubStatus(slug: string | undefined, options?: QueryHookOptions) {
  const enabled = useAuthQueryEnabled((options?.enabled ?? true) && !!slug)
  return useQuery({
    queryKey: projectsKeys.github.status(slug!),
    queryFn: () => api.github.status(slug!),
    enabled,
  })
}

export function useGitHubInstallations(slug: string | undefined, options?: QueryHookOptions) {
  const enabled = useAuthQueryEnabled((options?.enabled ?? true) && !!slug)
  return useQuery({
    queryKey: projectsKeys.github.installations(slug!),
    queryFn: () => api.github.listInstallations(slug!),
    enabled,
  })
}

export function useGitHubRepos(slug: string | undefined, options?: QueryHookOptions) {
  const enabled = useAuthQueryEnabled((options?.enabled ?? true) && !!slug)
  return useQuery({
    queryKey: projectsKeys.github.repos(slug!),
    queryFn: () => api.github.listRepos(slug!),
    enabled,
  })
}

export function useGitHubBranches(
  slug: string | undefined,
  repo: string | undefined,
  options?: QueryHookOptions,
) {
  const validRepo = !!repo && /^[^/\s]+\/[^/\s]+$/.test(repo)
  const enabled = useAuthQueryEnabled(
    (options?.enabled ?? true) && !!slug && validRepo,
  )
  return useQuery({
    queryKey: projectsKeys.github.branches(slug!, repo),
    queryFn: () => api.github.listBranches(slug!, repo!),
    enabled,
    staleTime: 60_000,
  })
}

export function useAddGitHubInstallation(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (installationId: number) =>
      api.github.addInstallation(slug, installationId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectsKeys.github.installations(slug) })
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
      qc.invalidateQueries({ queryKey: projectsKeys.github.installations(slug) })
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

export function useDisconnectGitHubApp(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.github.disconnectApp(slug),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectsKeys.github.all(slug) })
      qc.invalidateQueries({ queryKey: projectsKeys.settings(slug) })
    },
  })
}