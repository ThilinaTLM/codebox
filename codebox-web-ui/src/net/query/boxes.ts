import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {  useAuthQueryEnabled } from "./_internal"
import { boxesKeys } from "./keys"
import type {QueryHookOptions} from "./_internal";
import type { Box, BoxCreatePayload } from "@/net/http/types"
import { ContainerStatus } from "@/net/http/types"
import { api } from "@/net/http/api"

export function useBoxes(
  slug: string | undefined,
  status?: string,
  trigger?: string,
  options?: QueryHookOptions
) {
  const enabled = useAuthQueryEnabled((options?.enabled ?? true) && !!slug)
  return useQuery({
    queryKey: boxesKeys.list(slug!, status, trigger),
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
    queryKey: boxesKeys.detail(slug!, boxId!),
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
    queryKey: boxesKeys.events(slug!, boxId!, limit),
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
    queryKey: boxesKeys.files(slug!, boxId!, path),
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
    queryKey: boxesKeys.fileContent(slug!, boxId!, path!),
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
      queryClient.invalidateQueries({ queryKey: boxesKeys.files(slug, boxId, "") })
    },
  })
}

export function useUploadFile(slug: string, boxId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ path, file }: { path: string; file: File }) =>
      api.boxes.uploadFile(slug, boxId, path, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: boxesKeys.files(slug, boxId, "") })
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
    queryKey: boxesKeys.logs(slug!, boxId!, tail),
    queryFn: () => api.boxes.logs(slug!, boxId!, tail),
    enabled,
    refetchInterval: enabled && autoRefresh ? 3000 : false,
  })
}

export function useCreateBox(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: BoxCreatePayload) => api.boxes.create(slug, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: boxesKeys.all(slug) })
    },
  })
}

export function useStopBox(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (boxId: string) => api.boxes.stop(slug, boxId),
    onMutate: async (boxId) => {
      await qc.cancelQueries({ queryKey: boxesKeys.detail(slug, boxId) })
      await qc.cancelQueries({ queryKey: boxesKeys.all(slug) })

      const previousBox = qc.getQueryData<Box>(boxesKeys.detail(slug, boxId))
      if (previousBox) {
        qc.setQueryData<Box>(boxesKeys.detail(slug, boxId), {
          ...previousBox,
          container_status: ContainerStatus.STOPPED,
          activity: null,
        })
      }

      const previousLists = qc.getQueriesData<Array<Box>>({
        queryKey: boxesKeys.all(slug),
      })
      qc.setQueriesData<Array<Box>>({ queryKey: boxesKeys.all(slug) }, (old) =>
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
        qc.setQueryData(boxesKeys.detail(slug, boxId), context.previousBox)
      }
      context.previousLists.forEach(([key, data]) => {
        qc.setQueryData(key, data)
      })
    },
    onSettled: (_data, _err, boxId) => {
      qc.invalidateQueries({ queryKey: boxesKeys.detail(slug, boxId) })
      qc.invalidateQueries({ queryKey: boxesKeys.all(slug) })
    },
  })
}

export function useRestartBox(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (boxId: string) => api.boxes.restart(slug, boxId),
    onSuccess: (_data, boxId) => {
      qc.invalidateQueries({ queryKey: boxesKeys.detail(slug, boxId) })
      qc.invalidateQueries({ queryKey: boxesKeys.all(slug) })
    },
  })
}

export function useCancelBox(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (boxId: string) => api.boxes.cancel(slug, boxId),
    onSuccess: (_data, boxId) => {
      qc.invalidateQueries({ queryKey: boxesKeys.detail(slug, boxId) })
      qc.invalidateQueries({ queryKey: boxesKeys.all(slug) })
    },
  })
}

export function useDeleteBox(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (boxId: string) => api.boxes.delete(slug, boxId),
    onMutate: async (boxId) => {
      await qc.cancelQueries({ queryKey: boxesKeys.all(slug) })

      const previousLists = qc.getQueriesData<Array<Box>>({
        queryKey: boxesKeys.all(slug),
      })

      qc.setQueriesData<Array<Box>>({ queryKey: boxesKeys.all(slug) }, (old) =>
        Array.isArray(old) ? old.filter((b) => b.id !== boxId) : old
      )

      qc.removeQueries({ queryKey: boxesKeys.detail(slug, boxId) })

      return { previousLists }
    },
    onError: (_err, _boxId, context) => {
      if (!context) return
      context.previousLists.forEach(([key, data]) => {
        qc.setQueryData(key, data)
      })
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: boxesKeys.all(slug) })
    },
  })
}

export function useSendMessage(slug: string) {
  return useMutation({
    mutationFn: ({ boxId, message }: { boxId: string; message: string }) =>
      api.boxes.sendMessage(slug, boxId, message),
  })
}