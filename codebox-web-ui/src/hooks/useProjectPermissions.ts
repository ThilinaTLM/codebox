import { useAuthStore } from "@/lib/auth"
import { useProjectMembers } from "@/net/query"

export interface ProjectPermissions {
  isPlatformAdmin: boolean
  isProjectAdmin: boolean
  isProjectMember: boolean
  canManageMembers: boolean
  canManageProjectSettings: boolean
  canManageLifecycle: boolean
  isLoadingPermissions: boolean
}

/**
 * Compute what the current user can do inside a given project.
 *
 * Platform admins always get full management rights. For non-admins we look
 * them up in the project's member list.
 */
export function useProjectPermissions(
  projectSlug: string | undefined
): ProjectPermissions {
  const user = useAuthStore((s) => s.user)
  const isPlatformAdmin = user?.user_type === "admin"

  // Only fetch members for non-admins; admins already have full rights.
  const { data: members, isLoading } = useProjectMembers(projectSlug, {
    enabled: !!projectSlug && !isPlatformAdmin,
  })

  if (!projectSlug) {
    return {
      isPlatformAdmin,
      isProjectAdmin: false,
      isProjectMember: false,
      canManageMembers: isPlatformAdmin,
      canManageProjectSettings: isPlatformAdmin,
      canManageLifecycle: isPlatformAdmin,
      isLoadingPermissions: false,
    }
  }

  if (isPlatformAdmin) {
    return {
      isPlatformAdmin: true,
      isProjectAdmin: true,
      isProjectMember: true,
      canManageMembers: true,
      canManageProjectSettings: true,
      canManageLifecycle: true,
      isLoadingPermissions: false,
    }
  }

  const membership = user
    ? members?.find((m) => m.user_id === user.id)
    : undefined
  const isProjectAdmin = membership?.role === "admin"
  const isProjectMember = !!membership

  return {
    isPlatformAdmin: false,
    isProjectAdmin,
    isProjectMember,
    canManageMembers: isProjectAdmin,
    canManageProjectSettings: isProjectAdmin,
    canManageLifecycle: false,
    isLoadingPermissions: isLoading,
  }
}
