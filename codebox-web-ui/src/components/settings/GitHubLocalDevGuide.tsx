import { toast } from "sonner"
import { ExternalLink } from "lucide-react"
import { API_URL } from "@/lib/constants"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

interface GitHubLocalDevGuideProps {
  projectSlug: string
}

/**
 * Inline walkthrough for unblocking the GitHub App manifest flow on a
 * localhost deployment. Rendered when `manifest_supported` is false and
 * the browser is on localhost — i.e. the user can't proceed without
 * forwarding webhooks through smee.io.
 *
 * The commands embed the project slug and the browser's `API_URL` so
 * they're valid to copy-paste as-is.
 */
export function GitHubLocalDevGuide({ projectSlug }: GitHubLocalDevGuideProps) {
  const apiBase = API_URL.replace(/\/$/, "")
  const smeeTarget = `${apiBase}/api/projects/${projectSlug}/github/webhook`
  const envLine = `CODEBOX_ORCHESTRATOR_PUBLIC_URL=https://smee.io/<your-channel>`
  const smeeCommand = `pnpm dlx smee-client -u https://smee.io/<your-channel> --target ${smeeTarget}`

  const copy = (value: string, label: string) => () => {
    navigator.clipboard.writeText(value)
    toast.success(`${label} copied`)
  }

  return (
    <Alert className="max-w-xl">
      <AlertTitle>Local development detected</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>
          GitHub can&apos;t reach <code>localhost</code>, so the one-click flow
          is disabled. Forward webhooks with{" "}
          <a
            href="https://smee.io"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            smee.io
          </a>{" "}
          in four steps:
        </p>

        <ol className="ml-4 list-decimal space-y-3">
          <li className="space-y-1.5">
            <p>
              Create a channel at smee.io and copy its URL (looks like{" "}
              <code>https://smee.io/aB3xYz…</code>).
            </p>
            <a
              href="https://smee.io"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs underline underline-offset-2"
            >
              Open smee.io
              <ExternalLink className="size-3" />
            </a>
          </li>

          <li className="space-y-1.5">
            <p>
              Add this line to <code>codebox-orchestrator/.env</code>, swapping
              in your channel:
            </p>
            <CopyableLine value={envLine} onCopy={copy(envLine, "Env line")} />
          </li>

          <li className="space-y-1.5">
            <p>
              In a second terminal, forward that channel to this project&apos;s
              webhook URL:
            </p>
            <CopyableLine
              value={smeeCommand}
              onCopy={copy(smeeCommand, "Command")}
            />
            <p className="text-xs text-muted-foreground">
              Keep this terminal running whenever you want GitHub webhooks to
              reach this project.
            </p>
          </li>

          <li>
            <p>
              Restart the orchestrator, then reload this page. The{" "}
              <strong>Create GitHub App</strong> button will enable.
            </p>
          </li>
        </ol>

        <p className="text-xs text-muted-foreground">
          Or skip smee entirely and use <em>Use an existing GitHub App</em>{" "}
          below to paste credentials from an App you registered manually.
        </p>
      </AlertDescription>
    </Alert>
  )
}

function CopyableLine({
  value,
  onCopy,
}: {
  value: string
  onCopy: () => void
}) {
  return (
    <div className="flex items-start gap-2">
      <code className="flex-1 break-all rounded bg-muted px-2 py-1 font-mono text-xs">
        {value}
      </code>
      <Button variant="ghost" size="xs" onClick={onCopy}>
        Copy
      </Button>
    </div>
  )
}
