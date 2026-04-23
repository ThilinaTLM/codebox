import {
  createFileRoute,
  useNavigate,
  useSearch,
} from "@tanstack/react-router"
import { AgentTemplateConfigurationTab } from "@/components/settings/agent-template/AgentTemplateConfigurationTab"
import { AgentTemplateDetailHeader } from "@/components/settings/agent-template/AgentTemplateDetailHeader"
import { AgentTemplateDryRunPanel } from "@/components/settings/agent-template/AgentTemplateDryRunPanel"
import { AgentTemplateRunsPanel } from "@/components/settings/agent-template/AgentTemplateRunsPanel"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { useProjectPermissions } from "@/hooks/useProjectPermissions"
import { useAgentTemplate } from "@/net/query"

type AgentTemplateTab = "configuration" | "dry-run" | "runs"

const VALID_TABS: ReadonlyArray<AgentTemplateTab> = [
  "configuration",
  "dry-run",
  "runs",
]

interface Search {
  tab?: AgentTemplateTab
}

export const Route = createFileRoute(
  "/projects/$projectSlug/configs/agent-templates/$templateId"
)({
  validateSearch: (search: Record<string, unknown>): Search => {
    const raw = search.tab
    if (
      typeof raw === "string" &&
      (VALID_TABS as ReadonlyArray<string>).includes(raw)
    ) {
      return { tab: raw as AgentTemplateTab }
    }
    return {}
  },
  component: EditAgentTemplatePage,
})

function EditAgentTemplatePage() {
  const { projectSlug, templateId } = Route.useParams()
  const search = useSearch({ from: Route.id })
  const tab: AgentTemplateTab = search.tab ?? "configuration"
  const navigate = useNavigate({ from: Route.id })

  const { canManageProjectSettings, isLoadingPermissions } =
    useProjectPermissions(projectSlug)
  const { data: template, isLoading } = useAgentTemplate(
    projectSlug,
    templateId
  )

  if (isLoading || isLoadingPermissions) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }
  if (!template) {
    return <p className="text-sm text-muted-foreground">Template not found.</p>
  }

  const handleTabChange = (value: unknown) => {
    if (typeof value !== "string") return
    if (!(VALID_TABS as ReadonlyArray<string>).includes(value)) return
    navigate({
      search: { tab: value as AgentTemplateTab },
      replace: true,
    })
  }

  const handleDeleted = () => {
    navigate({
      to: "/projects/$projectSlug/configs/agent-templates",
      params: { projectSlug },
    })
  }

  return (
    <div className="space-y-6">
      <AgentTemplateDetailHeader
        projectSlug={projectSlug}
        template={template}
        canManage={canManageProjectSettings}
        onDeleted={handleDeleted}
      />

      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="configuration">Configuration</TabsTrigger>
          <TabsTrigger value="dry-run">Dry run</TabsTrigger>
          <TabsTrigger value="runs">Runs</TabsTrigger>
        </TabsList>

        <TabsContent value="configuration" className="mt-4">
          <AgentTemplateConfigurationTab
            projectSlug={projectSlug}
            template={template}
            readOnly={!canManageProjectSettings}
          />
        </TabsContent>

        <TabsContent value="dry-run" className="mt-4">
          {canManageProjectSettings ? (
            <AgentTemplateDryRunPanel
              projectSlug={projectSlug}
              template={template}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Project admin access required.
            </p>
          )}
        </TabsContent>

        <TabsContent value="runs" className="mt-4">
          <AgentTemplateRunsPanel
            projectSlug={projectSlug}
            templateId={template.id}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
