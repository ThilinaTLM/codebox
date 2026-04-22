import { useState } from "react"
import { Link } from "@tanstack/react-router"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Clock02Icon,
  Github01Icon,
  MoreHorizontalCircle01Icon,
} from "@hugeicons/core-free-icons"
import { SectionSkeleton } from "./SectionSkeleton"
import type { AgentTemplate } from "@/net/http/types"
import {
  useAgentTemplates,
  useDeleteAgentTemplate,
  useUpdateAgentTemplate,
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

function triggerLabel(kind: string): string {
  switch (kind) {
    case "github.issues":
      return "GitHub: Issue"
    case "github.issue_comment":
      return "GitHub: Issue Comment"
    case "github.pull_request":
      return "GitHub: Pull Request"
    case "github.pull_request_review":
      return "GitHub: PR Review"
    case "github.pull_request_review_comment":
      return "GitHub: PR Review Comment"
    case "github.push":
      return "GitHub: Push"
    case "schedule":
      return "Scheduled (cron)"
    default:
      return kind
  }
}

interface AgentTemplatesSectionProps {
  projectSlug: string
  readOnly?: boolean
}

export function AgentTemplatesSection({
  projectSlug,
  readOnly = false,
}: AgentTemplatesSectionProps) {
  const { data: templates = [], isLoading } = useAgentTemplates(projectSlug)

  if (isLoading) {
    return <SectionSkeleton />
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-display text-lg">Agent Templates</h2>
          <p className="mt-1 max-w-lg text-sm text-muted-foreground">
            Spawn agents automatically from GitHub events or on a schedule.
          </p>
        </div>
        {!readOnly && templates.length > 0 && (
          <Button
            size="sm"
            nativeButton={false}
            render={
              <Link
                to="/projects/$projectSlug/configs/agent-templates/new"
                params={{ projectSlug }}
              />
            }
          >
            Create Template
          </Button>
        )}
      </div>

      {templates.length === 0 ? (
        <EmptyState projectSlug={projectSlug} readOnly={readOnly} />
      ) : (
        <div className="grid gap-3">
          {templates.map((tpl) => (
            <TemplateRow
              key={tpl.id}
              projectSlug={projectSlug}
              template={tpl}
              readOnly={readOnly}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function EmptyState({
  projectSlug,
  readOnly,
}: {
  projectSlug: string
  readOnly: boolean
}) {
  return (
    <div className="rounded-lg border border-dashed border-border p-12 text-center">
      <h3 className="font-display text-base">No agent templates yet</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Templates let you spawn agents automatically from GitHub events or on a
        schedule.
      </p>
      {!readOnly && (
        <div className="mt-6 flex items-center justify-center">
          <Button
            nativeButton={false}
            render={
              <Link
                to="/projects/$projectSlug/configs/agent-templates/new"
                params={{ projectSlug }}
              />
            }
          >
            Create Your First Template
          </Button>
        </div>
      )}
    </div>
  )
}

function TemplateRow({
  projectSlug,
  template,
  readOnly,
}: {
  projectSlug: string
  template: AgentTemplate
  readOnly: boolean
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const deleteMutation = useDeleteAgentTemplate(projectSlug)
  const updateMutation = useUpdateAgentTemplate(projectSlug)

  const icon = template.trigger_kind === "schedule" ? Clock02Icon : Github01Icon

  const handleToggleEnabled = () => {
    updateMutation.mutate(
      { id: template.id, payload: { enabled: !template.enabled } },
      {
        onSuccess: () => {
          toast.success(
            `Template ${template.enabled ? "disabled" : "enabled"}`
          )
        },
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
      <Card className="group/card rounded-lg">
        <CardContent className="flex items-center gap-4 p-4">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
            <HugeiconsIcon icon={icon} size={18} strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Link
                to="/projects/$projectSlug/configs/agent-templates/$templateId"
                params={{ projectSlug, templateId: template.id }}
                className="font-display truncate text-sm font-medium hover:underline"
              >
                {template.name}
              </Link>
              {!template.enabled && (
                <Badge variant="secondary" className="text-[10px]">
                  Disabled
                </Badge>
              )}
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {triggerLabel(template.trigger_kind)}
              {template.schedule_cron ? ` — ${template.schedule_cron}` : ""}
              {template.pinned_repo ? ` — ${template.pinned_repo}` : ""}
            </p>
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
                <DropdownMenuItem onClick={handleToggleEnabled}>
                  {template.enabled ? "Disable" : "Enable"}
                </DropdownMenuItem>
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
        </CardContent>
      </Card>

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
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

