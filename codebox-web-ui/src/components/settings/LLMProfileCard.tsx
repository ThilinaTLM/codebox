import { useState } from "react"
import { toast } from "sonner"
import {
  AiCloud01Icon,
  AiGenerativeIcon,
  AiMagicIcon, MoreHorizontalCircle01Icon, SparklesIcon 
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { IconSvgElement } from "@hugeicons/react"
import type { LLMProfile } from "@/net/http/types"
import {
  useDeleteLLMProfile,
  useDuplicateLLMProfile,
  useUpdateProjectSettings,
} from "@/net/query"
import { ConfirmActionDialog } from "@/components/ConfirmActionDialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
    case "opencode-go":
      return {
        label: "OpenCode Go",
        icon: AiMagicIcon,
        color: "text-amber-600 dark:text-amber-400",
        bg: "bg-amber-500/10",
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

export function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export interface LLMProfileCardProps {
  projectSlug: string
  profile: LLMProfile
  isDefault: boolean
  readOnly: boolean
  onEdit: () => void
  onExport: () => void
}

export function LLMProfileCard({
  projectSlug,
  profile,
  isDefault,
  readOnly,
  onEdit,
  onExport,
}: LLMProfileCardProps) {
  const deleteMutation = useDeleteLLMProfile(projectSlug)
  const duplicateMutation = useDuplicateLLMProfile(projectSlug)
  const updateSettingsMutation = useUpdateProjectSettings(projectSlug)
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
            {!readOnly && (
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
            )}
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

      <ConfirmActionDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete Profile"
        description={`Are you sure you want to delete "${profile.name}"?${
          isDefault
            ? " This is your default profile — the default will be cleared."
            : ""
        }}`}
        confirmLabel="Delete"
        confirmVariant="destructive"
        isPending={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </>
  )
}