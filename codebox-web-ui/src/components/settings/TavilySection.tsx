import { useState } from "react"
import { toast } from "sonner"
import { useUpdateUserSettings, useUserSettings } from "@/net/query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"

export function TavilySection() {
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="font-display text-lg">Tavily</h2>
          <Badge variant="outline" className="text-xs">
            Optional
          </Badge>
        </div>
        <p className="mt-1 max-w-lg text-sm text-muted-foreground">
          Tavily enables web search during agent runs, letting the agent look up
          documentation, APIs, and other resources while working on your issues.
        </p>
        <p className="mt-2 max-w-lg text-sm text-muted-foreground">
          Codebox works without it, but the web search tool won&apos;t be
          available.
        </p>
      </div>
      <TavilyKeyForm />
    </div>
  )
}

function TavilyKeyForm() {
  const { data: settings } = useUserSettings()
  const updateMutation = useUpdateUserSettings()
  const [tavilyKey, setTavilyKey] = useState("")

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    if (!tavilyKey) return
    updateMutation.mutate(
      { tavily_api_key: tavilyKey },
      {
        onSuccess: () => {
          toast.success("Tavily API key saved")
          setTavilyKey("")
        },
        onError: () => toast.error("Failed to save Tavily API key"),
      }
    )
  }

  const handleRemove = () => {
    updateMutation.mutate(
      { tavily_api_key: "" },
      {
        onSuccess: () => toast.success("Tavily API key removed"),
        onError: () => toast.error("Failed to remove Tavily API key"),
      }
    )
  }

  return (
    <section>
      <form onSubmit={handleSave} className="max-w-md space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="tavily-key">API Key</Label>
          {settings?.tavily_api_key_masked ? (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5">
              <span className="font-mono text-sm text-muted-foreground">
                {settings.tavily_api_key_masked}
              </span>
              <Badge variant="outline" className="ml-auto text-xs">
                Configured
              </Badge>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-4 py-2.5">
              <span className="text-sm text-muted-foreground">
                Not configured
              </span>
            </div>
          )}
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="tavily-key-input">
              {settings?.tavily_api_key_masked
                ? "Replace key"
                : "Enter API key"}
            </Label>
            <Input
              id="tavily-key-input"
              type="password"
              value={tavilyKey}
              onChange={(e) => setTavilyKey(e.target.value)}
              placeholder="tvly-..."
            />
          </div>
          <Button
            type="submit"
            size="sm"
            disabled={updateMutation.isPending || !tavilyKey}
          >
            {updateMutation.isPending ? "Saving..." : "Save"}
          </Button>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Get a key at{" "}
            <a
              href="https://tavily.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              tavily.com
            </a>
          </p>
          {settings?.tavily_api_key_masked && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="text-destructive hover:text-destructive"
              onClick={handleRemove}
              disabled={updateMutation.isPending}
            >
              Remove key
            </Button>
          )}
        </div>
      </form>
    </section>
  )
}
