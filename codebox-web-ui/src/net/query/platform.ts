import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {  useAuthQueryEnabled } from "./_internal"
import { platformKeys } from "./keys"
import type {QueryHookOptions} from "./_internal";
import { api } from "@/net/http/api"

export function useOrphanContainers(options?: QueryHookOptions) {
  const enabled = useAuthQueryEnabled(options?.enabled ?? true)
  return useQuery({
    queryKey: platformKeys.orphanContainers(),
    queryFn: () => api.platform.listOrphanContainers(),
    enabled,
    staleTime: 5_000,
  })
}

export function useDeleteOrphanContainer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (containerId: string) =>
      api.platform.deleteOrphanContainer(containerId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKeys.orphanContainers() })
    },
  })
}