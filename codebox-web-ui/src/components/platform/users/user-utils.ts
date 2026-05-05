import { formatDistanceToNow } from "date-fns"
import type { AuthUser } from "@/net/http/types"

export function getInitials(user: AuthUser): string {
  if (user.first_name && user.last_name) {
    return (
      user.first_name.charAt(0) + user.last_name.charAt(0)
    ).toUpperCase()
  }
  if (user.first_name) {
    return user.first_name.charAt(0).toUpperCase()
  }
  return user.username.slice(0, 2).toUpperCase()
}

export function getDisplayName(user: AuthUser): string {
  const parts = [user.first_name, user.last_name].filter(Boolean)
  return parts.length > 0 ? parts.join(" ") : user.username
}

export function formatCreatedAt(dateStr: string | undefined): string {
  if (!dateStr) return ""
  return formatDistanceToNow(new Date(dateStr), { addSuffix: true })
}