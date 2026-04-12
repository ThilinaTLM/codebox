import { useState } from "react"
import { toast } from "sonner"
import { MoreHorizontalCircle01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { LLMProfileFormDialog } from "./LLMProfileFormDialog"
import { SectionSkeleton } from "./SectionSkeleton"
import type { LLMProfile } from "@/net/http/types"
import {
  useDeleteLLMProfile,
  useLLMProfiles,
  useUpdateUserSettings,
  useUserSettings,
} from "@/net/query"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"

export function LLMProfilesSection() {
  const { data: profiles = [], isLoading } = useLLMProfiles()
  const { data: settings } = useUserSettings()
  const [createOpen, setCreateOpen] = useState(false)
  const [editingProfile, setEditingProfile] = useState<LLMProfile | null>(null)

  if (isLoading) {
    return <SectionSkeleton />
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-display text-lg">LLM Profiles</h2>
          <p className="mt-1 max-w-lg text-sm text-muted-foreground">
            Manage your LLM provider configurations. Each profile stores a
            provider, model, and API key.
          </p>
        </div>
        {profiles.length > 0 && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            Create Profile
          </Button>
        )}
      </div>

      {profiles.length === 0 ? (
        <LLMProfilesEmptyState onCreateClick={() => setCreateOpen(true)} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {profiles.map((profile) => (
            <LLMProfileCard
              key={profile.id}
              profile={profile}
              isDefault={settings?.default_llm_profile_id === profile.id}
              onEdit={() => setEditingProfile(profile)}
            />
          ))}
        </div>
      )}

      <LLMProfileFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
      />

      <LLMProfileFormDialog
        open={editingProfile !== null}
        onOpenChange={(open) => {
          if (!open) setEditingProfile(null)
        }}
        mode="edit"
        profile={editingProfile ?? undefined}
      />
    </div>
  )
}

function LLMProfilesEmptyState({
  onCreateClick,
}: {
  onCreateClick: () => void
}) {
  return (
    <div className="rounded-lg border border-dashed border-border p-12 text-center">
      <h3 className="font-display text-base">
        No LLM profiles configured yet
      </h3>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
        LLM profiles tell Codebox which AI model to use when working on your
        issues. You can create multiple profiles for different providers and
        switch between them.
      </p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
        You&apos;ll need an API key from OpenRouter, OpenAI, or a compatible
        service.
      </p>
      <Button className="mt-6" onClick={onCreateClick}>
        Create Your First Profile
      </Button>
    </div>
  )
}

function LLMProfileCard({
  profile,
  isDefault,
  onEdit,
}: {
  profile: LLMProfile
  isDefault: boolean
  onEdit: () => void
}) {
  const deleteMutation = useDeleteLLMProfile()
  const updateSettingsMutation = useUpdateUserSettings()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleSetDefault = () => {
    updateSettingsMutation.mutate(
      { default_llm_profile_id: profile.id },
      {
        onSuccess: () => toast.success(`"${profile.name}" set as default`),
        onError: () => toast.error("Failed to set default profile"),
      }
    )
  }

  const handleDelete = () => {
    deleteMutation.mutate(profile.id, {
      onSuccess: () => {
        toast.success(`Profile "${profile.name}" deleted`)
        setConfirmDelete(false)
      },
      onError: () => toast.error("Failed to delete profile"),
    })
  }

  return (
    <>
      <Card className="rounded-lg border-border bg-card">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-display truncate">{profile.name}</span>
                {isDefault && (
                  <Badge variant="default" className="shrink-0 text-xs">
                    Default
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {profile.provider} &middot; {profile.model}
              </p>
              {profile.base_url && (
                <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                  {profile.base_url}
                </p>
              )}
            </div>
          </div>
          <Separator className="my-3" />
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="xs" onClick={onEdit}>
              Edit
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="ghost" size="icon-xs" />}
                className="ml-auto"
              >
                <HugeiconsIcon
                  icon={MoreHorizontalCircle01Icon}
                  size={16}
                  strokeWidth={2}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {!isDefault && (
                  <DropdownMenuItem
                    onClick={handleSetDefault}
                    disabled={updateSettingsMutation.isPending}
                  >
                    Set as Default
                  </DropdownMenuItem>
                )}
                {!isDefault && <DropdownMenuSeparator />}
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardContent>
      </Card>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Profile</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{profile.name}&rdquo;?
              {isDefault &&
                " This is your default profile — the default will be cleared."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>
              Cancel
            </DialogClose>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
