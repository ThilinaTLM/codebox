import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {  useAuthQueryEnabled } from "./_internal"
import { llmProfilesKeys } from "./keys"
import type {QueryHookOptions} from "./_internal";
import type {
  LLMProfileCreate,
  LLMProfileExportRequest,
  LLMProfileImportRequest,
  LLMProfileUpdate,
} from "@/net/http/types"
import { api } from "@/net/http/api"

export function useLLMProfiles(slug: string | undefined, options?: QueryHookOptions) {
  const enabled = useAuthQueryEnabled((options?.enabled ?? true) && !!slug)
  return useQuery({
    queryKey: llmProfilesKeys.all(slug!),
    queryFn: () => api.llmProfiles.list(slug!),
    enabled,
  })
}

export function useCreateLLMProfile(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: LLMProfileCreate) => api.llmProfiles.create(slug, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: llmProfilesKeys.all(slug) })
    },
  })
}

export function useUpdateLLMProfile(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: LLMProfileUpdate }) =>
      api.llmProfiles.update(slug, id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: llmProfilesKeys.all(slug) })
    },
  })
}

export function useDeleteLLMProfile(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.llmProfiles.delete(slug, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: llmProfilesKeys.all(slug) })
    },
  })
}

export function useDuplicateLLMProfile(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.llmProfiles.duplicate(slug, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: llmProfilesKeys.all(slug) })
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
      qc.invalidateQueries({ queryKey: llmProfilesKeys.all(slug) })
    },
  })
}