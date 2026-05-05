import { useState } from "react"
import { LLMProfileExportDialog } from "./LLMProfileExportDialog"
import { LLMProfileFormDialog } from "./LLMProfileFormDialog"
import { LLMProfileImportDialog } from "./LLMProfileImportDialog"
import { SectionSkeleton } from "./SectionSkeleton"
import { LLMProfileCard } from "./LLMProfileCard"
import type { LLMProfile } from "@/net/http/types"
import {
  useLLMProfiles,
  useProjectSettings,
} from "@/net/query"
import { Button } from "@/components/ui/button"

interface LLMProfilesSectionProps {
  projectSlug: string
  readOnly?: boolean
}

export function LLMProfilesSection({
  projectSlug,
  readOnly = false,
}: LLMProfilesSectionProps) {
  const slug = projectSlug
  const { data: profiles = [], isLoading } = useLLMProfiles(slug || undefined)
  const { data: settings } = useProjectSettings(slug || undefined)
  const [createOpen, setCreateOpen] = useState(false)
  const [editingProfile, setEditingProfile] = useState<LLMProfile | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportProfileIds, setExportProfileIds] = useState<Array<string> | null>(null)
  const [importOpen, setImportOpen] = useState(false)

  if (isLoading) {
    return <SectionSkeleton />
  }

  const nextProfileNumber = profiles.length + 1

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-display text-lg">LLM Profiles</h2>
          <p className="mt-1 max-w-lg text-sm text-muted-foreground">
            Manage your LLM provider configurations. Each profile stores a
            provider, model, and API key.
          </p>
        </div>
        {!readOnly && profiles.length > 0 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setImportOpen(true)}
            >
              Import
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setExportProfileIds(null)
                setExportOpen(true)
              }}
            >
              Export All
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              Create Profile
            </Button>
          </div>
        )}
      </div>

      {profiles.length === 0 ? (
        <LLMProfilesEmptyState
          readOnly={readOnly}
          onCreateClick={() => setCreateOpen(true)}
          onImportClick={() => setImportOpen(true)}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {profiles.map((profile) => (
            <LLMProfileCard
              key={profile.id}
              projectSlug={slug}
              profile={profile}
              readOnly={readOnly}
              isDefault={settings?.default_llm_profile_id === profile.id}
              onEdit={() => setEditingProfile(profile)}
              onExport={() => {
                setExportProfileIds([profile.id])
                setExportOpen(true)
              }}
            />
          ))}
        </div>
      )}

      {!readOnly && (
        <>
          <LLMProfileFormDialog
            projectSlug={slug}
            open={createOpen}
            onOpenChange={setCreateOpen}
            mode="create"
            nextProfileNumber={nextProfileNumber}
          />

          <LLMProfileFormDialog
            projectSlug={slug}
            open={editingProfile !== null}
            onOpenChange={(open) => {
              if (!open) setEditingProfile(null)
            }}
            mode="edit"
            profile={editingProfile ?? undefined}
          />

          <LLMProfileExportDialog
            projectSlug={slug}
            open={exportOpen}
            onOpenChange={setExportOpen}
            profileIds={exportProfileIds}
          />

          <LLMProfileImportDialog
            projectSlug={slug}
            open={importOpen}
            onOpenChange={setImportOpen}
          />
        </>
      )}
    </div>
  )
}

function LLMProfilesEmptyState({
  readOnly,
  onCreateClick,
  onImportClick,
}: {
  readOnly: boolean
  onCreateClick: () => void
  onImportClick: () => void
}) {
  return (
    <div className="rounded-lg border border-dashed border-border p-12 text-center">
      <h3 className="font-display text-base">
        No LLM profiles configured yet
      </h3>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
        {readOnly
          ? "A project admin can configure LLM profiles for this project."
          : "LLM profiles tell Codebox which AI model to use when working on your issues. You can create multiple profiles for different providers and switch between them."}
      </p>
      {!readOnly && (
        <>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            You&apos;ll need an API key from OpenRouter, OpenAI, or a compatible
            service.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Button variant="outline" onClick={onImportClick}>
              Import
            </Button>
            <Button onClick={onCreateClick}>
              Create Your First Profile
            </Button>
          </div>
        </>
      )}
    </div>
  )
}