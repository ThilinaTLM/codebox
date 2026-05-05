import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {  useAuthQueryEnabled } from "./_internal"
import { projectsKeys } from "./keys"
import type {QueryHookOptions} from "./_internal";
import type { ProjectSettingsUpdate } from "@/net/http/types"
import { api } from "@/net/http/api"

export function useProjectSettings(slug: string | undefined, options?: QueryHookOptions) {
  const enabled = useAuthQueryEnabled((options?.enabled ?? true) && !!slug)
  return useQuery({
    queryKey: projectsKeys.settings(slug!),
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
      qc.invalidateQueries({ queryKey: projectsKeys.settings(slug) })
      qc.invalidateQueries({ queryKey: projectsKeys.github.status(slug) })
    },
  })
}