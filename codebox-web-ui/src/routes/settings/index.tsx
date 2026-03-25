import { createFileRoute, Link } from "@tanstack/react-router"
import { ThemeToggle } from "@/components/layout/ThemeToggle"
import { useGitHubStatus } from "@/net/query"

export const Route = createFileRoute("/settings/")({
  component: SettingsPage,
})

function SettingsPage() {
  const { data: githubStatus } = useGitHubStatus()

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
      </div>
      <div className="mx-auto w-full max-w-3xl space-y-8 p-6">
        {/* Appearance */}
        <section>
          <h2 className="text-lg font-medium">Appearance</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Toggle between light and dark mode.
          </p>
          <div className="mt-3">
            <ThemeToggle />
          </div>
        </section>

        {/* GitHub */}
        <section>
          <h2 className="text-lg font-medium">GitHub Integration</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {githubStatus?.enabled
              ? "GitHub App is configured. Manage installations and connected repos."
              : "GitHub integration is not configured on the orchestrator."}
          </p>
          <Link
            to="/settings/github"
            className="mt-3 inline-flex items-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            GitHub Settings
          </Link>
        </section>
      </div>
    </div>
  )
}
