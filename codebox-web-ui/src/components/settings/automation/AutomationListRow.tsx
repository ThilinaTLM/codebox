import { useState } from "react"
import { Link } from "@tanstack/react-router"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  AlertCircleIcon,
  CheckmarkCircle02Icon,
  Clock02Icon,
  Delete02Icon,
  MinusSignCircleIcon,
  MoreHorizontalCircle01Icon,
} from "@hugeicons/core-free-icons"
import { OP_LABELS, fieldLabel, triggerKindMeta } from "./metadata"
import type { Automation, AutomationRun } from "@/net/http/types"
import {
  useAutomationRuns,
  useDeleteAutomation,
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
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

interface AutomationListRowProps {
  projectSlug: string
  automation: Automation
  readOnly: boolean
  githubConfigured: boolean
}

export function AutomationListRow({
  projectSlug,
  automation,
  readOnly,
  githubConfigured,
}: AutomationListRowProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const updateMutation = useUpdateAutomation(projectSlug)
  const deleteMutation = useDeleteAutomation(projectSlug)
  const { data: runsData } = useAutomationRuns(projectSlug, automation.id, {
    limit: 1,
  })

  const trigger = triggerKindMeta(automation.trigger_kind)
  const lastRun: AutomationRun | undefined = runsData?.runs[0]
  const isScheduled = automation.trigger_kind === "schedule"
  const isGithubTrigger = automation.trigger_kind.startsWith("github.")
  const showGithubMissing = isGithubTrigger && !githubConfigured

  const nextRunRelative = (() => {
    if (!isScheduled || !automation.next_run_at) return null
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
        onError: () => toast.error("Failed to update automation"),
      }
    )
  }

  const handleDelete = () => {
    deleteMutation.mutate(automation.id, {
      onSuccess: () => {
        toast.success(`Automation "${automation.name}" deleted`)
        setConfirmDelete(false)
      },
      onError: () => toast.error("Failed to delete automation"),
    })
  }

  return (
    <>
      <li className="group/row rounded-xl border border-border/50 bg-card transition-colors hover:border-border">
        <div className="flex items-center gap-3 p-4">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <HugeiconsIcon
              icon={trigger.icon}
              strokeWidth={2}
              className="size-4"
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to="/projects/$projectSlug/configs/automations/$automationId"
                params={{ projectSlug, automationId: automation.id }}
                className="truncate font-display text-sm font-medium hover:underline"
              >
                {automation.name}
              </Link>
              <Badge variant="outline" className="text-[10px]">
                {trigger.title}
              </Badge>
              {!automation.enabled && (
                <Badge variant="secondary" className="text-[10px]">
                  Disabled
                </Badge>
              )}
              {showGithubMissing && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Badge
                        variant="outline"
                        className="gap-1 border-amber-500/40 text-[10px] text-amber-600 dark:text-amber-400"
                      >
                        <HugeiconsIcon
                          icon={AlertCircleIcon}
                          strokeWidth={2}
                          className="size-3"
                        />
                        GitHub not configured
                      </Badge>
                    }
                  />
                  <TooltipContent className="max-w-xs">
                    This automation will not fire until a GitHub App is
                    configured for this project.
                  </TooltipContent>
                </Tooltip>
              )}
              <LastRunChip run={lastRun} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {isScheduled ? (
                <>
                  <span className="inline-flex items-center gap-1">
                    <HugeiconsIcon
                      icon={Clock02Icon}
                      strokeWidth={2}
                      className="size-3"
                    />
                    <code className="font-mono text-[11px]">
                      {automation.schedule_cron}
                    </code>
                  </span>
                  {nextRunRelative && <span>· Next {nextRunRelative}</span>}
                  {automation.schedule_timezone && (
                    <span>· {automation.schedule_timezone}</span>
                  )}
                </>
              ) : (
                <FilterSummary automation={automation} />
              )}
              <span className="truncate">· {automation.trigger_repo}</span>
            </div>
          </div>

          {!readOnly && (
            <div className="flex shrink-0 items-center gap-2">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Switch
                      size="sm"
                      checked={automation.enabled}
                      onCheckedChange={handleToggleEnabled}
                      disabled={updateMutation.isPending}
                      aria-label={
                        automation.enabled
                          ? "Disable automation"
                          : "Enable automation"
                      }
                    />
                  }
                />
                <TooltipContent>
                  {automation.enabled ? "Disable" : "Enable"}
                </TooltipContent>
              </Tooltip>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
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
                    render={
                      <Link
                        to="/projects/$projectSlug/configs/automations/$automationId"
                        params={{ projectSlug, automationId: automation.id }}
                      />
                    }
                  >
                    Edit
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
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </li>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Automation</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{automation.name}&rdquo;?
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
    </>
  )
}

function LastRunChip({ run }: { run?: AutomationRun }) {
  if (!run) return null
  const { icon, variant, label } = (() => {
    switch (run.status) {
      case "spawned":
        return {
          icon: CheckmarkCircle02Icon,
          variant: "default" as const,
          label: "Ran",
        }
      case "skipped_filter":
        return {
          icon: MinusSignCircleIcon,
          variant: "secondary" as const,
          label: "Skipped",
        }
      case "error":
        return {
          icon: AlertCircleIcon,
          variant: "destructive" as const,
          label: "Errored",
        }
    }
  })()
  let relative = ""
  try {
    relative = formatDistanceToNow(new Date(run.created_at), {
      addSuffix: true,
    })
  } catch {
    relative = ""
  }
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Badge variant={variant} className="gap-1 text-[10px]">
            <HugeiconsIcon icon={icon} strokeWidth={2} className="size-3" />
            {label}
          </Badge>
        }
      />
      <TooltipContent>
        Last run {relative || new Date(run.created_at).toLocaleString()}
      </TooltipContent>
    </Tooltip>
  )
}

function FilterSummary({ automation }: { automation: Automation }) {
  const actions = automation.trigger_actions ?? []
  const filters = automation.trigger_filters ?? []

  if (actions.length === 0 && filters.length === 0) {
    return <span>Any event</span>
  }

  const shownActions = actions.slice(0, 3)
  const moreActions = actions.length - shownActions.length
  const shownFilters = filters.slice(0, 2)
  const moreFilters = filters.length - shownFilters.length

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {shownActions.map((a) => (
        <span
          key={a}
          className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary"
        >
          {a}
        </span>
      ))}
      {moreActions > 0 && (
        <span className="text-[10px] text-muted-foreground">
          +{moreActions}
        </span>
      )}
      {shownFilters.map((f, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: positional
          key={i}
          className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px]"
        >
          <span>{fieldLabel(f.field)}</span>
          <span className="text-muted-foreground/80">{OP_LABELS[f.op]}</span>
          <span className="max-w-[120px] truncate font-mono">
            {Array.isArray(f.value) ? f.value.join(",") : f.value}
          </span>
        </span>
      ))}
      {moreFilters > 0 && (
        <span className="text-[10px] text-muted-foreground">
          +{moreFilters} more
        </span>
      )}
    </span>
  )
}
