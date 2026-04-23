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
import type { AgentTemplate, AgentTemplateRun } from "@/net/http/types"
import {
  useAgentTemplateRuns,
  useDeleteAgentTemplate,
  useUpdateAgentTemplate,
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

interface TemplateListRowProps {
  projectSlug: string
  template: AgentTemplate
  readOnly: boolean
  githubConfigured: boolean
}

export function TemplateListRow({
  projectSlug,
  template,
  readOnly,
  githubConfigured,
}: TemplateListRowProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const updateMutation = useUpdateAgentTemplate(projectSlug)
  const deleteMutation = useDeleteAgentTemplate(projectSlug)
  const { data: runsData } = useAgentTemplateRuns(projectSlug, template.id, {
    limit: 1,
  })

  const trigger = triggerKindMeta(template.trigger_kind)
  const lastRun: AgentTemplateRun | undefined = runsData?.runs[0]
  const isScheduled = template.trigger_kind === "schedule"
  const isGithubTrigger = template.trigger_kind.startsWith("github.")
  const showGithubMissing = isGithubTrigger && !githubConfigured

  const nextRunRelative = (() => {
    if (!isScheduled || !template.next_run_at) return null
    try {
      return formatDistanceToNow(new Date(template.next_run_at), {
        addSuffix: true,
      })
    } catch {
      return null
    }
  })()

  const handleToggleEnabled = (next: boolean) => {
    updateMutation.mutate(
      { id: template.id, payload: { enabled: next } },
      {
        onError: () => toast.error("Failed to update template"),
      }
    )
  }

  const handleDelete = () => {
    deleteMutation.mutate(template.id, {
      onSuccess: () => {
        toast.success(`Template "${template.name}" deleted`)
        setConfirmDelete(false)
      },
      onError: () => toast.error("Failed to delete template"),
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
                to="/projects/$projectSlug/configs/agent-templates/$templateId"
                params={{ projectSlug, templateId: template.id }}
                className="truncate font-display text-sm font-medium hover:underline"
              >
                {template.name}
              </Link>
              <Badge variant="outline" className="text-[10px]">
                {trigger.title}
              </Badge>
              {!template.enabled && (
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
                    This template will not fire until a GitHub App is
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
                      {template.schedule_cron}
                    </code>
                  </span>
                  {nextRunRelative && <span>· Next {nextRunRelative}</span>}
                  {template.schedule_timezone && (
                    <span>· {template.schedule_timezone}</span>
                  )}
                </>
              ) : (
                <FilterSummary template={template} />
              )}
              {template.pinned_repo && (
                <span className="truncate">· {template.pinned_repo}</span>
              )}
            </div>
          </div>

          {!readOnly && (
            <div className="flex shrink-0 items-center gap-2">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Switch
                      size="sm"
                      checked={template.enabled}
                      onCheckedChange={handleToggleEnabled}
                      disabled={updateMutation.isPending}
                      aria-label={
                        template.enabled ? "Disable template" : "Enable template"
                      }
                    />
                  }
                />
                <TooltipContent>
                  {template.enabled ? "Disable" : "Enable"}
                </TooltipContent>
              </Tooltip>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Template actions"
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
                        to="/projects/$projectSlug/configs/agent-templates/$templateId"
                        params={{ projectSlug, templateId: template.id }}
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
            <DialogTitle>Delete Template</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{template.name}&rdquo;?
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

function LastRunChip({ run }: { run?: AgentTemplateRun }) {
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

function FilterSummary({ template }: { template: AgentTemplate }) {
  const filters = template.trigger_filters ?? []
  if (filters.length === 0) {
    return <span>Any event</span>
  }
  const shown = filters.slice(0, 2)
  const remaining = filters.length - shown.length
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {shown.map((f, i) => (
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
      {remaining > 0 && (
        <span className="text-[10px] text-muted-foreground">
          +{remaining} more
        </span>
      )}
    </span>
  )
}
