import { useState } from "react"
import { toast } from "sonner"
import {
  CheckmarkCircle02Icon,
  MultiplicationSignCircleIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useChangePassword } from "@/net/query"
import { useAuthStore } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"

export function AccountSection() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  const userInitial = user?.username
    ? user.username.charAt(0).toUpperCase()
    : "?"

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
            {userInitial}
          </div>
          <div>
            <p className="font-display text-base font-medium">
              {user?.username}
            </p>
            <p className="text-sm text-muted-foreground">
              {user?.user_type === "admin" ? "Administrator" : "User"}
            </p>
          </div>
        </div>

        <div className="mt-4 grid max-w-md gap-3">
          <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
            <span className="text-sm text-muted-foreground">Username</span>
            <span className="text-sm">{user?.username}</span>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
            <span className="text-sm text-muted-foreground">Role</span>
            <Badge variant="outline" className="text-xs">
              {user?.user_type}
            </Badge>
          </div>
        </div>
      </section>

      <ChangePasswordSection />

      {/* Session */}
      <section>
        <h2 className="font-display text-lg">Session</h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Manage your current session.
        </p>
        <Button variant="outline" className="mt-4" onClick={logout}>
          Sign out
        </Button>
      </section>
    </div>
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
