import { Link, createFileRoute } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/layout/ThemeToggle"
import { useGitHubStatus } from "@/net/query"

export const Route = createFileRoute("/settings/")({
  component: SettingsPage,
})

function SettingsPage() {
  const { data: githubStatus } = useGitHubStatus()

  return (
    <div className="flex h-[calc(100svh-3rem)] flex-col overflow-y-auto">
      {/* Page header */}
      <div className="bg-hero-gradient px-6 pt-10 pb-8">
        <div className="mx-auto max-w-6xl">
          <h1 className="font-display text-4xl font-bold tracking-tight">
            Settings
          </h1>
          <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
            Manage your preferences and integrations.
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-6 pb-12">
        <div className="mx-auto max-w-6xl space-y-10 pt-8">
          {/* Appearance */}
          <section>
            <h2 className="font-display max-w-xs text-lg font-semibold">
              Appearance
            </h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Choose your preferred theme.
            </p>
            <div className="mt-4">
              <ThemeToggle />
            </div>
          </section>

          {/* GitHub */}
          <section>
            <h2 className="font-display max-w-xs text-lg font-semibold">
              GitHub Integration
            </h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              {githubStatus?.enabled
                ? "GitHub App is configured. Manage installations and connected repos."
                : "GitHub integration is not configured on the orchestrator."}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              nativeButton={false}
              render={<Link to="/settings/github" />}
            >
              GitHub Settings
            </Button>
          </section>
        </div>
      </div>
    </div>
  )
}
