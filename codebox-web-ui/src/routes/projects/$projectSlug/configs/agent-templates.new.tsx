import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import type {
  AgentTemplateCreate,
  AgentTemplateUpdate,
} from "@/net/http/types"
import { AgentTemplateForm } from "@/components/settings/AgentTemplateForm"
import { useProjectPermissions } from "@/hooks/useProjectPermissions"
import { useCreateAgentTemplate } from "@/net/query"

export const Route = createFileRoute(
  "/projects/$projectSlug/configs/agent-templates/new"
)({
  component: NewAgentTemplatePage,
})

function NewAgentTemplatePage() {
  const { projectSlug } = Route.useParams()
  const navigate = useNavigate()
  const { canManageProjectSettings, isLoadingPermissions } =
    useProjectPermissions(projectSlug)
  const createMutation = useCreateAgentTemplate(projectSlug)

  if (isLoadingPermissions) {
    return null
  }
  if (!canManageProjectSettings) {
    return (
      <p className="text-sm text-muted-foreground">
        Project admin access required.
      </p>
    )
  }

  const handleSubmit = (
    payload: AgentTemplateCreate | AgentTemplateUpdate
  ) => {
    createMutation.mutate(payload as AgentTemplateCreate, {
      onSuccess: (tpl) => {
        toast.success(`Template "${tpl.name}" created`)
        navigate({
          to: "/projects/$projectSlug/configs/agent-templates/$templateId",
          params: { projectSlug, templateId: tpl.id },
        })
      },
      onError: (err: unknown) => {
        const msg =
          err && typeof err === "object" && "response" in err
            ? (err as { response?: { data?: { detail?: string } } }).response
                ?.data?.detail
            : null
        toast.error(msg || "Failed to create template")
      },
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg">New Agent Template</h2>
      </div>
      <AgentTemplateForm
        projectSlug={projectSlug}
        submitting={createMutation.isPending}
        submitLabel="Create template"
        onSubmit={handleSubmit}
        onCancel={() =>
          navigate({
            to: "/projects/$projectSlug/configs/agent-templates",
            params: { projectSlug },
          })
        }
      />
    </div>
  )
}
