import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {  useAuthQueryEnabled } from "./_internal"
import { automationsKeys } from "./keys"
import type {QueryHookOptions} from "./_internal";
import type { AutomationCreate, AutomationDryRunRequest, AutomationUpdate } from "@/net/http/types"
import { api } from "@/net/http/api"

export function useAutomations(
  slug: string | undefined,
  options?: QueryHookOptions
) {
  const enabled = useAuthQueryEnabled((options?.enabled ?? true) && !!slug)
  return useQuery({
    queryKey: automationsKeys.all(slug!),
    queryFn: () => api.automations.list(slug!),
    enabled,
  })
}

export function useAutomation(
  slug: string | undefined,
  id: string | undefined,
  options?: QueryHookOptions
) {
  const enabled = useAuthQueryEnabled(
    (options?.enabled ?? true) && !!slug && !!id
  )
  return useQuery({
    queryKey: automationsKeys.detail(slug!, id!),
    queryFn: () => api.automations.get(slug!, id!),
    enabled,
  })
}

export function useCreateAutomation(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: AutomationCreate) =>
      api.automations.create(slug, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: automationsKeys.all(slug) })
    },
  })
}

export function useUpdateAutomation(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: AutomationUpdate }) =>
      api.automations.update(slug, id, payload),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: automationsKeys.all(slug) })
      qc.invalidateQueries({
        queryKey: automationsKeys.detail(slug, variables.id),
      })
    },
  })
}

export function useDeleteAutomation(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.automations.delete(slug, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: automationsKeys.all(slug) })
    },
  })
}

export function useAutomationRuns(
  slug: string | undefined,
  id: string | undefined,
  params: {
    status?: string | null
    limit?: number
    cursor?: string | null
  } = {},
  options?: QueryHookOptions
) {
  const enabled = useAuthQueryEnabled(
    (options?.enabled ?? true) && !!slug && !!id
  )
  return useQuery({
    queryKey: automationsKeys.runs(slug!, id!, params),
    queryFn: () => api.automations.listRuns(slug!, id!, params),
    enabled,
  })
}

export function useInfiniteAutomationRuns(
  slug: string | undefined,
  id: string | undefined,
  params: { status?: string | null; limit?: number } = {},
  options?: QueryHookOptions
) {
  const enabled = useAuthQueryEnabled(
    (options?.enabled ?? true) && !!slug && !!id
  )
  return useInfiniteQuery({
    queryKey: automationsKeys.infiniteRuns(slug!, id!, params),
    queryFn: ({ pageParam }) =>
      api.automations.listRuns(slug!, id!, {
        ...params,
        cursor: pageParam,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
    enabled,
  })
}

export function useDryRunAutomation(slug: string, id: string) {
  return useMutation({
    mutationFn: (payload: AutomationDryRunRequest) =>
      api.automations.dryRun(slug, id, payload),
  })
}