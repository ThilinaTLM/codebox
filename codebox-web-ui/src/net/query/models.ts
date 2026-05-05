import { useMutation, useQuery } from "@tanstack/react-query"
import {  useAuthQueryEnabled } from "./_internal"
import { modelsKeys } from "./keys"
import type {QueryHookOptions} from "./_internal";
import type { ModelsPreviewRequest } from "@/net/http/types"
import { api } from "@/net/http/api"

export function useModels(
  slug: string | undefined,
  profileId?: string,
  options?: QueryHookOptions
) {
  const enabled = useAuthQueryEnabled((options?.enabled ?? true) && !!slug)
  return useQuery({
    queryKey: modelsKeys.list(slug!, profileId),
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