import { useState } from "react"
import { toast } from "sonner"
import {
  AiCloud01Icon,
  AiGenerativeIcon,
  MoreHorizontalCircle01Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { LLMProfileExportDialog } from "./LLMProfileExportDialog"
import { LLMProfileFormDialog } from "./LLMProfileFormDialog"
import { LLMProfileImportDialog } from "./LLMProfileImportDialog"
import { SectionSkeleton } from "./SectionSkeleton"
import type { IconSvgElement } from "@hugeicons/react"
import type { LLMProfile } from "@/net/http/types"
import {
  useDeleteLLMProfile,
  useDuplicateLLMProfile,
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

function getProviderMeta(provider: string): {
  label: string
  icon: IconSvgElement
  color: string
  bg: string
} {
  switch (provider) {
    case "openrouter":
      return {
        label: "OpenRouter",
        icon: SparklesIcon,
        color: "text-violet-600 dark:text-violet-400",
        bg: "bg-violet-500/10",
      }
    case "openai":
      return {
        label: "OpenAI",
        icon: AiGenerativeIcon,
        color: "text-emerald-600 dark:text-emerald-400",
        bg: "bg-emerald-500/10",
      }
    default:
      return {
        label: "Custom",
        icon: AiCloud01Icon,
        color: "text-sky-600 dark:text-sky-400",
        bg: "bg-sky-500/10",
      }
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function LLMProfilesSection() {
  const { data: profiles = [], isLoading } = useLLMProfiles()
  const { data: settings } = useUserSettings()
  const [createOpen, setCreateOpen] = useState(false)
  const [editingProfile, setEditingProfile] = useState<LLMProfile | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportProfileIds, setExportProfileIds] = useState<Array<string> | null>(null)
  const [importOpen, setImportOpen] = useState(false)

  if (isLoading) {
    return <SectionSkeleton />
  }

  const nextProfileNumber = profiles.length + 1

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
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setImportOpen(true)}
            >
              Import
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setExportProfileIds(null)
                setExportOpen(true)
              }}
            >
              Export All
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              Create Profile
            </Button>
          </div>
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
              onExport={() => {
                setExportProfileIds([profile.id])
                setExportOpen(true)
              }}
            />
          ))}
        </div>
      )}

      <LLMProfileFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        nextProfileNumber={nextProfileNumber}
      />

      <LLMProfileFormDialog
        open={editingProfile !== null}
        onOpenChange={(open) => {
          if (!open) setEditingProfile(null)
        }}
        mode="edit"
        profile={editingProfile ?? undefined}
      />

      <LLMProfileExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        profileIds={exportProfileIds}
      />

      <LLMProfileImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
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
  onExport,
}: {
  profile: LLMProfile
  isDefault: boolean
  onEdit: () => void
  onExport: () => void
}) {
  const deleteMutation = useDeleteLLMProfile()
  const duplicateMutation = useDuplicateLLMProfile()
  const updateSettingsMutation = useUpdateUserSettings()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const meta = getProviderMeta(profile.provider)

  const handleSetDefault = () => {
    updateSettingsMutation.mutate(
      { default_llm_profile_id: profile.id },
      {
        onSuccess: () => toast.success(`"${profile.name}" set as default`),
        onError: () => toast.error("Failed to set default profile"),
      },
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
      <Card className="group/card rounded-lg border-border bg-card transition-shadow hover:shadow-sm">
        <CardContent className="p-4">
          {/* Header row: provider icon + dropdown */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div
                className={`flex size-8 items-center justify-center rounded-lg ${meta.bg}`}
              >
                <HugeiconsIcon
                  icon={meta.icon}
                  size={16}
                  strokeWidth={2}
                  className={meta.color}
                />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-display truncate text-sm font-medium">
                    {profile.name}
                  </span>
                  {isDefault && (
                    <Badge variant="default" className="shrink-0 text-[10px]">
                      Default
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{meta.label}</p>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="opacity-0 transition-opacity group-hover/card:opacity-100 data-[state=open]:opacity-100"
                  />
                }
              >
                <HugeiconsIcon
                  icon={MoreHorizontalCircle01Icon}
                  size={16}
                  strokeWidth={2}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
                <DropdownMenuItem onClick={onExport}>Export</DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    duplicateMutation.mutate(profile.id, {
                      onSuccess: (newProfile) => {
                        toast.success(`Profile "${newProfile.name}" created`)
                      },
                      onError: () =>
                        toast.error("Failed to duplicate profile"),
                    })
                  }}
                  disabled={duplicateMutation.isPending}
                >
                  Duplicate
                </DropdownMenuItem>
                {!isDefault && (
                  <DropdownMenuItem
                    onClick={handleSetDefault}
                    disabled={updateSettingsMutation.isPending}
                  >
                    Set as Default
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Body: model, key, base url */}
          <div className="mt-3 space-y-1 pl-[42px]">
            <p className="truncate font-mono text-xs">{profile.model}</p>
            <p className="truncate font-mono text-xs text-muted-foreground">
              {profile.api_key_masked}
            </p>
            {profile.base_url && (
              <p className="truncate font-mono text-xs text-muted-foreground">
                {profile.base_url}
              </p>
            )}
          </div>

          {/* Footer: date */}
          <div className="mt-3 pl-[42px]">
            <span className="text-[11px] text-muted-foreground">
              Created {formatDate(profile.created_at)}
            </span>
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
