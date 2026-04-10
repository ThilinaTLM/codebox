import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "sonner"
import type { AuthUser, GitHubInstallation, GitHubRepo } from "@/net/http/types"
import {
  useAddGitHubInstallation,
  useChangePassword,
  useCreateUser,
  useDeleteUser,
  useGitHubInstallations,
  useGitHubStatus,
  useRemoveGitHubInstallation,
  useSyncGitHubInstallation,
  useUsers,
} from "@/net/query"
import { useAuthStore } from "@/lib/auth"
import { ThemeToggle } from "@/components/layout/ThemeToggle"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { API_URL } from "@/lib/constants"

const VALID_TABS = [
  "account",
  "appearance",
  "users",
  "github",
  "about",
] as const
type SettingsTab = (typeof VALID_TABS)[number]

export const Route = createFileRoute("/settings/")({
  validateSearch: (search: Record<string, unknown>): { tab: SettingsTab } => {
    const tab = VALID_TABS.includes(search.tab as SettingsTab)
      ? (search.tab as SettingsTab)
      : "account"
    return { tab }
  },
  component: SettingsPage,
})

function SettingsPage() {
  const { tab } = Route.useSearch()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.user_type === "admin"

  return (
    <div className="flex h-[calc(100svh-24px)] flex-col overflow-y-auto">
      {/* Page header */}
      <div className="px-6 pt-8 pb-2">
        <div className="mx-auto max-w-6xl">
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Settings
          </h1>
        </div>
      </div>

      {/* Tabbed content */}
      <div className="flex-1 px-6 pb-12">
        <div className="mx-auto max-w-6xl">
          <Tabs
            value={tab}
            onValueChange={(value) =>
              navigate({
                to: "/settings",
                search: { tab: value as SettingsTab },
                replace: true,
              })
            }
          >
            <TabsList variant="line" className="mb-6">
              <TabsTrigger value="account" className="font-terminal text-sm">
                Account
              </TabsTrigger>
              <TabsTrigger value="appearance" className="font-terminal text-sm">
                Appearance
              </TabsTrigger>
              {isAdmin && (
                <TabsTrigger value="users" className="font-terminal text-sm">
                  Users
                </TabsTrigger>
              )}
              <TabsTrigger value="github" className="font-terminal text-sm">
                GitHub
              </TabsTrigger>
              <TabsTrigger value="about" className="font-terminal text-sm">
                About
              </TabsTrigger>
            </TabsList>

            <TabsContent value="account">
              <AccountTab />
            </TabsContent>
            <TabsContent value="appearance">
              <AppearanceTab />
            </TabsContent>
            {isAdmin && (
              <TabsContent value="users">
                <UsersTab />
              </TabsContent>
            )}
            <TabsContent value="github">
              <GitHubTab />
            </TabsContent>
            <TabsContent value="about">
              <AboutTab />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}

// ── Account Tab ─────────────────────────────────────────────

function AccountTab() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  return (
    <div className="space-y-10">
      <section>
        <h2 className="font-display text-lg font-semibold">Profile</h2>
        <div className="mt-4 grid max-w-md gap-3">
          <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
            <span className="text-sm text-muted-foreground">Username</span>
            <span className="font-terminal text-sm">{user?.username}</span>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
            <span className="text-sm text-muted-foreground">Role</span>
            <Badge variant="outline" className="font-terminal text-xs">
              {user?.user_type}
            </Badge>
          </div>
        </div>
      </section>

      <ChangePasswordSection />

      <section>
        <h2 className="font-display text-lg font-semibold">Session</h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Sign out of your current session.
        </p>
        <Button variant="destructive" className="mt-4" onClick={logout}>
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match")
      return
    }
    if (newPassword.length < 4) {
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
      <h2 className="font-display text-lg font-semibold">Change Password</h2>
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
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-password">Confirm new password</Label>
          <Input
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        <Button
          type="submit"
          size="sm"
          disabled={
            changePasswordMutation.isPending ||
            !oldPassword ||
            !newPassword ||
            !confirmPassword
          }
        >
          {changePasswordMutation.isPending ? "Changing..." : "Change password"}
        </Button>
      </form>
    </section>
  )
}

// ── Users Tab (admin only) ──────────────────────────────────

function UsersTab() {
  const { data: users = [], isLoading } = useUsers()

  return (
    <div className="space-y-10">
      <AddUserSection />
      <UsersList users={users} isLoading={isLoading} />
    </div>
  )
}

function AddUserSection() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [userType, setUserType] = useState<"user" | "admin">("user")
  const createUserMutation = useCreateUser()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password) return
    if (password.length < 4) {
      toast.error("Password must be at least 4 characters")
      return
    }
    createUserMutation.mutate(
      { username, password, userType },
      {
        onSuccess: () => {
          toast.success(`User "${username}" created`)
          setUsername("")
          setPassword("")
          setUserType("user")
        },
        onError: () =>
          toast.error("Failed to create user. Username may already exist."),
      }
    )
  }

  return (
    <section>
      <h2 className="font-display text-lg font-semibold">Add User</h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        Create a new user account. Users can only be created by admins.
      </p>
      <form onSubmit={handleSubmit} className="mt-4 max-w-md space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="new-username">Username</Label>
          <Input
            id="new-username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-user-password">Password</Label>
          <Input
            id="new-user-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-user-type">Role</Label>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={userType === "user" ? "default" : "outline"}
              onClick={() => setUserType("user")}
            >
              User
            </Button>
            <Button
              type="button"
              size="sm"
              variant={userType === "admin" ? "default" : "outline"}
              onClick={() => setUserType("admin")}
            >
              Admin
            </Button>
          </div>
        </div>
        <Button
          type="submit"
          size="sm"
          disabled={createUserMutation.isPending || !username || !password}
        >
          {createUserMutation.isPending ? "Creating..." : "Create user"}
        </Button>
      </form>
    </section>
  )
}

function UsersList({
  users,
  isLoading,
}: {
  users: Array<AuthUser>
  isLoading: boolean
}) {
  const currentUser = useAuthStore((s) => s.user)

  if (isLoading) {
    return (
      <section>
        <h2 className="font-display text-lg font-semibold">All Users</h2>
        <p className="mt-2 text-sm text-muted-foreground">Loading...</p>
      </section>
    )
  }

  return (
    <section>
      <h2 className="font-display text-lg font-semibold">All Users</h2>
      {users.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No users found.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {users.map((u) => (
            <UserRow key={u.id} user={u} isSelf={u.id === currentUser?.id} />
          ))}
        </div>
      )}
    </section>
  )
}

function UserRow({ user, isSelf }: { user: AuthUser; isSelf: boolean }) {
  const deleteMutation = useDeleteUser()

  const handleDelete = () => {
    if (!confirm(`Delete user "${user.username}"?`)) return
    deleteMutation.mutate(user.id, {
      onSuccess: () => toast.success(`User "${user.username}" deleted`),
      onError: () => toast.error("Failed to delete user"),
    })
  }

  return (
    <Card className="rounded-lg border-border bg-card">
      <CardContent className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <span className="font-display font-semibold">{user.username}</span>
          <Badge variant="outline" className="font-terminal text-xs">
            {user.user_type}
          </Badge>
          {isSelf && (
            <span className="text-xs text-muted-foreground">(you)</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="font-terminal text-xs text-muted-foreground">
            {user.created_at
              ? new Date(user.created_at).toLocaleDateString()
              : ""}
          </span>
          {!isSelf && (
            <Button
              variant="ghost"
              size="xs"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="text-destructive hover:text-destructive"
            >
              Delete
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ── Appearance Tab ──────────────────────────────────────────

function AppearanceTab() {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-display text-lg font-semibold">Theme</h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Choose your preferred theme. Dark theme is the default for the
          command-center aesthetic.
        </p>
      </div>
      <ThemeToggle />
    </section>
  )
}

// ── GitHub Tab ──────────────────────────────────────────────

function GitHubTab() {
  const { data: status, isLoading: statusLoading } = useGitHubStatus()
  const { data: installations, isLoading: installationsLoading } =
    useGitHubInstallations()

  if (statusLoading) {
    return <p className="text-sm text-muted-foreground">Loading...</p>
  }

  if (!status?.enabled) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center">
        <h2 className="font-display text-lg font-semibold">
          GitHub Integration Not Configured
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Set{" "}
          <code className="font-terminal rounded bg-muted px-1.5 py-0.5 text-xs">
            GITHUB_APP_ID
          </code>{" "}
          and{" "}
          <code className="font-terminal rounded bg-muted px-1.5 py-0.5 text-xs">
            GITHUB_APP_PRIVATE_KEY_PATH
          </code>{" "}
          environment variables on the orchestrator to enable GitHub App
          integration.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-10">
      <ConnectSection appSlug={status.app_slug} />
      <ManualInstallSection />
      <InstallationsList
        installations={installations ?? []}
        isLoading={installationsLoading}
      />
    </div>
  )
}

function ConnectSection({ appSlug }: { appSlug: string }) {
  const installUrl = `https://github.com/apps/${appSlug}/installations/new`
  return (
    <section>
      <h2 className="font-display text-lg font-semibold">Connect GitHub</h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        Install the GitHub App on your organization or repositories to enable
        agent triggers from issues and pull requests.
      </p>
      <Button
        className="mt-4"
        nativeButton={false}
        render={
          <a href={installUrl} target="_blank" rel="noopener noreferrer" />
        }
      >
        Install GitHub App
      </Button>
    </section>
  )
}

function ManualInstallSection() {
  const [installationId, setInstallationId] = useState("")
  const addMutation = useAddGitHubInstallation()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const id = parseInt(installationId, 10)
    if (isNaN(id)) {
      toast.error("Invalid installation ID")
      return
    }
    addMutation.mutate(id, {
      onSuccess: () => {
        toast.success("Installation added")
        setInstallationId("")
      },
      onError: () => toast.error("Failed to add installation"),
    })
  }

  return (
    <section>
      <h2 className="font-display text-lg font-semibold">Manual Setup</h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        If the callback redirect doesn&apos;t work, you can manually enter a
        GitHub App installation ID.
      </p>
      <form onSubmit={handleSubmit} className="mt-4 flex items-center gap-2">
        <Input
          type="text"
          value={installationId}
          onChange={(e) => setInstallationId(e.target.value)}
          placeholder="Installation ID"
          className="w-48"
        />
        <Button
          type="submit"
          size="sm"
          disabled={addMutation.isPending || !installationId}
        >
          {addMutation.isPending ? "Adding..." : "Add"}
        </Button>
      </form>
    </section>
  )
}

function InstallationsList({
  installations,
  isLoading,
}: {
  installations: Array<GitHubInstallation>
  isLoading: boolean
}) {
  if (isLoading) {
    return (
      <section>
        <h2 className="font-display text-lg font-semibold">
          Connected Installations
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">Loading...</p>
      </section>
    )
  }

  return (
    <section>
      <h2 className="font-display text-lg font-semibold">
        Connected Installations
      </h2>
      {installations.length === 0 ? (
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          No GitHub App installations connected yet.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {installations.map((inst) => (
            <InstallationCard key={inst.id} installation={inst} />
          ))}
        </div>
      )}
    </section>
  )
}

function InstallationCard({
  installation,
}: {
  installation: GitHubInstallation
}) {
  const syncMutation = useSyncGitHubInstallation()
  const removeMutation = useRemoveGitHubInstallation()
  const [repos, setRepos] = useState<Array<GitHubRepo> | null>(null)

  const handleSync = () => {
    syncMutation.mutate(installation.id, {
      onSuccess: (data) => {
        setRepos(data)
        toast.success(`Synced ${data.length} repos`)
      },
      onError: () => toast.error("Failed to sync repos"),
    })
  }

  const handleRemove = () => {
    removeMutation.mutate(installation.id, {
      onSuccess: () => toast.success("Installation removed"),
      onError: () => toast.error("Failed to remove installation"),
    })
  }

  return (
    <Card className="rounded-lg border-border bg-card">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-display font-semibold">
              {installation.account_login}
            </p>
            <p className="font-terminal text-xs text-muted-foreground">
              {installation.account_type} &middot; ID:{" "}
              {installation.installation_id} &middot;{" "}
              {new Date(installation.created_at).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="xs"
              onClick={handleSync}
              disabled={syncMutation.isPending}
            >
              {syncMutation.isPending ? "Syncing..." : "Sync Repos"}
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={handleRemove}
              disabled={removeMutation.isPending}
              className="text-destructive hover:text-destructive"
            >
              Remove
            </Button>
          </div>
        </div>
        {repos && repos.length > 0 && (
          <div className="mt-3 space-y-1">
            {repos.map((repo) => (
              <div
                key={repo.full_name}
                className="flex items-center gap-2 text-sm"
              >
                <span className="font-terminal">{repo.full_name}</span>
                {repo.private && (
                  <Badge variant="outline" className="py-0 text-xs">
                    private
                  </Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── About Tab ───────────────────────────────────────────────

function AboutTab() {
  return (
    <section className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold">Codebox</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Sandboxed AI coding agent platform.
        </p>
      </div>

      <div className="grid max-w-md gap-3">
        <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
          <span className="text-sm text-muted-foreground">Version</span>
          <span className="font-terminal text-sm">0.1.0</span>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
          <span className="text-sm text-muted-foreground">API URL</span>
          <span className="font-terminal text-xs text-foreground/70">
            {API_URL}
          </span>
        </div>
      </div>
    </section>
  )
}
