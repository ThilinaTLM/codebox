import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {  useAuthQueryEnabled } from "./_internal"
import { authKeys } from "./keys"
import type {QueryHookOptions} from "./_internal";
import { api } from "@/net/http/api"

export function useMe(enabled: boolean = true) {
  return useQuery({
    queryKey: authKeys.me(),
    queryFn: () => api.auth.me(),
    enabled,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })
}

export function useUsers(options?: QueryHookOptions) {
  const enabled = useAuthQueryEnabled(options?.enabled)
  return useQuery({
    queryKey: authKeys.users.all(),
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
      qc.invalidateQueries({ queryKey: authKeys.users.all() })
    },
  })
}

export function useUpdateProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { firstName: string | null; lastName: string | null }) =>
      api.auth.updateProfile(data.firstName, data.lastName),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: authKeys.users.all() })
    },
  })
}

export function useDeleteUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => api.auth.deleteUser(userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: authKeys.users.all() })
    },
  })
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (data: { oldPassword: string; newPassword: string }) =>
      api.auth.changePassword(data.oldPassword, data.newPassword),
  })
}