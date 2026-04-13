import { useState } from "react"
import { toast } from "sonner"
import {
  CheckmarkCircle02Icon,
  MultiplicationSignCircleIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useChangePassword, useUpdateProfile } from "@/net/query"
import { useAuthStore } from "@/lib/auth"
import { ConfirmActionDialog } from "@/components/ConfirmActionDialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"

function getDisplayName(user: {
  username: string
  first_name?: string | null
  last_name?: string | null
}): string {
  const parts = [user.first_name, user.last_name].filter(Boolean)
  return parts.length > 0 ? parts.join(" ") : user.username
}

function getInitials(user: {
  username: string
  first_name?: string | null
  last_name?: string | null
}): string {
  if (user.first_name && user.last_name) {
    return (
      user.first_name.charAt(0) + user.last_name.charAt(0)
    ).toUpperCase()
  }
  if (user.first_name) {
    return user.first_name.charAt(0).toUpperCase()
  }
  return user.username.charAt(0).toUpperCase()
}

export function AccountSection() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const [signOutOpen, setSignOutOpen] = useState(false)

  if (!user) return null

  return (
    <div className="space-y-10">
      <section>
        <h2 className="font-display text-lg">Profile</h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Your account information.
        </p>

        {/* User avatar + name */}
        <div className="mt-4 flex items-center gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-lg font-semibold text-primary">
            {getInitials(user)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-display text-base font-medium">
                {getDisplayName(user)}
              </p>
              <Badge variant="outline" className="text-xs">
                {user.user_type === "admin" ? "Administrator" : "User"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              @{user.username}
            </p>
          </div>
        </div>
      </section>

      <EditNameSection />

      <ChangePasswordSection />

      {/* Session */}
      <section>
        <h2 className="font-display text-lg">Session</h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Manage your current session.
        </p>
        <Button variant="outline" className="mt-4" onClick={() => setSignOutOpen(true)}>
          Sign out
        </Button>

        <ConfirmActionDialog
          open={signOutOpen}
          onOpenChange={setSignOutOpen}
          title="Sign out"
          description="Are you sure you want to sign out?"
          confirmLabel="Sign out"
          confirmVariant="destructive"
          onConfirm={logout}
        />
      </section>
    </div>
  )
}

function EditNameSection() {
  const user = useAuthStore((s) => s.user)
  const updateUser = useAuthStore((s) => s.updateUser)
  const [firstName, setFirstName] = useState(user?.first_name ?? "")
  const [lastName, setLastName] = useState(user?.last_name ?? "")
  const updateProfileMutation = useUpdateProfile()

  const hasChanges =
    firstName !== (user?.first_name ?? "") ||
    lastName !== (user?.last_name ?? "")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateProfileMutation.mutate(
      {
        firstName: firstName || null,
        lastName: lastName || null,
      },
      {
        onSuccess: (data) => {
          toast.success("Profile updated")
          updateUser({
            first_name: data.first_name,
            last_name: data.last_name,
          })
        },
        onError: () => toast.error("Failed to update profile"),
      }
    )
  }

  return (
    <section>
      <h2 className="font-display text-lg">Name</h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        Set your display name.
      </p>
      <form onSubmit={handleSubmit} className="mt-4 max-w-md space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="first-name">First name</Label>
            <Input
              id="first-name"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First name"
              autoComplete="given-name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="last-name">Last name</Label>
            <Input
              id="last-name"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Last name"
              autoComplete="family-name"
            />
          </div>
        </div>
        <Button
          type="submit"
          size="sm"
          disabled={updateProfileMutation.isPending || !hasChanges}
        >
          {updateProfileMutation.isPending ? "Saving..." : "Save"}
        </Button>
      </form>
    </section>
  )
}

function ChangePasswordSection() {
  const [oldPassword, setOldPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const changePasswordMutation = useChangePassword()

  const passwordsMatch = newPassword === confirmPassword
  const passwordLongEnough = newPassword.length >= 4

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!passwordsMatch) return
    if (!passwordLongEnough) {
      toast.error("Password must be at least 4 characters")
      return
    }
    changePasswordMutation.mutate(
      { oldPassword, newPassword },
      {
        onSuccess: () => {
          toast.success("Password changed successfully")
          setOldPassword("")
          setNewPassword("")
          setConfirmPassword("")
        },
        onError: () =>
          toast.error(
            "Failed to change password. Check your current password."
          ),
      }
    )
  }

  return (
    <section>
      <h2 className="font-display text-lg">Change Password</h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        Update your account password.
      </p>
      <form onSubmit={handleSubmit} className="mt-4 max-w-md space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="old-password">Current password</Label>
          <Input
            id="old-password"
            type="password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
          />
          <p className="text-xs text-muted-foreground">
            Minimum 4 characters
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-password">Confirm new password</Label>
          <div className="relative">
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
            {confirmPassword.length > 0 && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2">
                <HugeiconsIcon
                  icon={
                    passwordsMatch
                      ? CheckmarkCircle02Icon
                      : MultiplicationSignCircleIcon
                  }
                  size={16}
                  strokeWidth={2}
                  className={
                    passwordsMatch ? "text-green-500" : "text-destructive"
                  }
                />
              </span>
            )}
          </div>
        </div>
        <Button
          type="submit"
          size="sm"
          disabled={
            changePasswordMutation.isPending ||
            !oldPassword ||
            !newPassword ||
            !confirmPassword ||
            !passwordsMatch
          }
        >
          {changePasswordMutation.isPending ? "Changing..." : "Change password"}
        </Button>
      </form>
    </section>
  )
}
