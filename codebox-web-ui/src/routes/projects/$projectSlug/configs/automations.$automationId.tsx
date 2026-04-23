import {
  createFileRoute,
  useNavigate,
  useSearch,
} from "@tanstack/react-router"
import { AutomationConfigurationTab } from "@/components/settings/automation/AutomationConfigurationTab"
import { AutomationDetailHeader } from "@/components/settings/automation/AutomationDetailHeader"
import { AutomationDryRunPanel } from "@/components/settings/automation/AutomationDryRunPanel"
import { AutomationRunsPanel } from "@/components/settings/automation/AutomationRunsPanel"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { useProjectPermissions } from "@/hooks/useProjectPermissions"
import { useAutomation } from "@/net/query"

type AutomationTab = "configuration" | "dry-run" | "runs"

const VALID_TABS: ReadonlyArray<AutomationTab> = [
  "configuration",
  "dry-run",
  "runs",
]

interface Search {
  tab?: AutomationTab
}

export const Route = createFileRoute(
  "/projects/$projectSlug/configs/automations/$automationId"
)({
  validateSearch: (search: Record<string, unknown>): Search => {
    const raw = search.tab
    if (
      typeof raw === "string" &&
      (VALID_TABS as ReadonlyArray<string>).includes(raw)
    ) {
      return { tab: raw as AutomationTab }
    }
    return {}
  },
  component: EditAutomationPage,
})

function EditAutomationPage() {
  const { projectSlug, automationId } = Route.useParams()
  const search = useSearch({ from: Route.id })
  const tab: AutomationTab = search.tab ?? "configuration"
  const navigate = useNavigate({ from: Route.id })

  const { canManageProjectSettings, isLoadingPermissions } =
    useProjectPermissions(projectSlug)
  const { data: automation, isLoading } = useAutomation(
    projectSlug,
    automationId
  )

  if (isLoading || isLoadingPermissions) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }
  if (!automation) {
    return (
      <p className="text-sm text-muted-foreground">Automation not found.</p>
    )
  }

  const handleTabChange = (value: unknown) => {
    if (typeof value !== "string") return
    if (!(VALID_TABS as ReadonlyArray<string>).includes(value)) return
    navigate({
      search: { tab: value as AutomationTab },
      replace: true,
    })
  }

  const handleDeleted = () => {
    navigate({
      to: "/projects/$projectSlug/configs/automations",
      params: { projectSlug },
    })
  }

  return (
    <div className="space-y-6">
      <AutomationDetailHeader
        projectSlug={projectSlug}
        automation={automation}
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
          <AutomationConfigurationTab
            projectSlug={projectSlug}
            automation={automation}
            readOnly={!canManageProjectSettings}
          />
        </TabsContent>

        <TabsContent value="dry-run" className="mt-4">
          {canManageProjectSettings ? (
            <AutomationDryRunPanel
              projectSlug={projectSlug}
              automation={automation}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Project admin access required.
            </p>
          )}
        </TabsContent>

        <TabsContent value="runs" className="mt-4">
          <AutomationRunsPanel
            projectSlug={projectSlug}
            automationId={automation.id}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
