import { useState } from "react"
import { Link } from "@tanstack/react-router"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  AlertCircleIcon,
  ArrowLeft01Icon,
  Clock02Icon,
  Delete02Icon,
  MoreHorizontalCircle01Icon,
} from "@hugeicons/core-free-icons"
import { triggerKindMeta } from "./metadata"
import type { Automation } from "@/net/http/types"
import {
  useDeleteAutomation,
  useGitHubStatus,
  useUpdateAutomation,
} from "@/net/query"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

interface AutomationDetailHeaderProps {
  projectSlug: string
  automation: Automation
  canManage: boolean
  onDeleted: () => void
}

export function AutomationDetailHeader({
  projectSlug,
  automation,
  canManage,
  onDeleted,
}: AutomationDetailHeaderProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const updateMutation = useUpdateAutomation(projectSlug)
  const deleteMutation = useDeleteAutomation(projectSlug)
  const { data: ghStatus } = useGitHubStatus(projectSlug)
  const githubConfigured = Boolean(ghStatus?.enabled)
  const trigger = triggerKindMeta(automation.trigger_kind)

  const isScheduled = automation.trigger_kind === "schedule"
  const isGithubTrigger = automation.trigger_kind.startsWith("github.")
  const showGithubMissing = isGithubTrigger && !githubConfigured
  const nextRunRelative = (() => {
    if (!automation.next_run_at) return null
    try {
      return formatDistanceToNow(new Date(automation.next_run_at), {
        addSuffix: true,
      })
    } catch {
      return null
    }
  })()

  const handleToggleEnabled = (next: boolean) => {
    updateMutation.mutate(
      { id: automation.id, payload: { enabled: next } },
      {
        onSuccess: () => {
          toast.success(next ? "Automation enabled" : "Automation disabled")
        },
        onError: () => toast.error("Failed to update automation"),
      }
    )
  }

  const handleDelete = () => {
    deleteMutation.mutate(automation.id, {
      onSuccess: () => {
        toast.success(`Automation "${automation.name}" deleted`)
        setConfirmDelete(false)
        onDeleted()
      },
      onError: () => toast.error("Failed to delete automation"),
    })
  }

  return (
    <div className="space-y-3">
      <Link
        to="/projects/$projectSlug/configs/automations"
        params={{ projectSlug }}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <HugeiconsIcon
          icon={ArrowLeft01Icon}
          strokeWidth={2}
          className="size-3.5"
        />
        Automations
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl">{automation.name}</h2>
            <Badge variant="outline" className="gap-1">
              <HugeiconsIcon
                icon={trigger.icon}
                strokeWidth={2}
                className="size-3"
              />
              {trigger.title}
            </Badge>
            {!automation.enabled && (
              <Badge variant="secondary">Disabled</Badge>
            )}
            {showGithubMissing && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Badge
                      variant="outline"
                      className="gap-1 border-amber-500/40 text-amber-600 dark:text-amber-400"
                    >
                      <HugeiconsIcon
                        icon={AlertCircleIcon}
                        strokeWidth={2}
                        className="size-3.5"
                      />
                      GitHub not configured
                    </Badge>
                  }
                />
                <TooltipContent className="max-w-xs">
                  This automation will not fire until a GitHub App is configured
                  for this project.
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          {automation.description && (
            <p className="max-w-2xl text-sm text-muted-foreground">
              {automation.description}
            </p>
          )}
          {isScheduled && nextRunRelative && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <HugeiconsIcon
                icon={Clock02Icon}
                strokeWidth={2}
                className="size-3.5"
              />
              Next run {nextRunRelative}
            </p>
          )}
        </div>

        {canManage && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border border-border/60 bg-muted/30 px-3 py-1">
              <Label
                htmlFor="tpl-enabled"
                className="text-xs text-muted-foreground"
              >
                Enabled
              </Label>
              <Switch
                id="tpl-enabled"
                size="sm"
                checked={automation.enabled}
                onCheckedChange={handleToggleEnabled}
                disabled={updateMutation.isPending}
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label="Automation actions"
                  />
                }
              >
                <HugeiconsIcon
                  icon={MoreHorizontalCircle01Icon}
                  strokeWidth={2}
                  className="size-4"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => handleToggleEnabled(!automation.enabled)}
                >
                  {automation.enabled ? "Disable" : "Enable"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setConfirmDelete(true)}
                >
                  <HugeiconsIcon
                    icon={Delete02Icon}
                    strokeWidth={2}
                    data-icon="inline-start"
                  />
                  Delete automation
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Automation</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{automation.name}&rdquo;?
              This cannot be undone. Run history stays available.
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
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
