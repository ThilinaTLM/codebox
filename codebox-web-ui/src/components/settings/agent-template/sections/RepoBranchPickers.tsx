import { useId, useMemo } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Github01Icon } from "@hugeicons/core-free-icons"
import type { GitHubBranch, GitHubRepo } from "@/net/http/types"
import { useGitHubBranches, useGitHubRepos } from "@/net/query"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"

interface RepoPickerProps {
  projectSlug: string
  value: string
  onChange: (repo: string, matched?: GitHubRepo) => void
  disabled?: boolean
  invalid?: boolean
  id?: string
  githubConfigured: boolean
}

export function RepoPicker({
  projectSlug,
  value,
  onChange,
  disabled,
  invalid,
  id,
  githubConfigured,
}: RepoPickerProps) {
  const listId = useId()
  const { data: repos } = useGitHubRepos(projectSlug, {
    enabled: githubConfigured,
  })

  const byName = useMemo(() => {
    const map = new Map<string, GitHubRepo>()
    for (const r of repos ?? []) map.set(r.full_name, r)
    return map
  }, [repos])

  const showList = githubConfigured && (repos?.length ?? 0) > 0

  return (
    <div className="relative">
      <Input
        id={id}
        value={value}
        onChange={(e) => {
          const next = e.target.value
          onChange(next, byName.get(next.trim()))
        }}
        disabled={disabled}
        placeholder="my-org/my-repo"
        list={showList ? listId : undefined}
        autoComplete="off"
        aria-invalid={invalid || undefined}
        className={cn(showList && "pr-9")}
      />
      {showList && (
        <HugeiconsIcon
          icon={Github01Icon}
          strokeWidth={2}
          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
      )}
      {showList && (
        <datalist id={listId}>
          {repos?.map((r) => (
            <option key={r.full_name} value={r.full_name}>
              {r.private ? "private" : "public"} · default: {r.default_branch}
            </option>
          ))}
        </datalist>
      )}
    </div>
  )
}

interface BranchPickerProps {
  projectSlug: string
  repo: string
  value: string
  onChange: (branch: string, matched?: GitHubBranch) => void
  disabled?: boolean
  invalid?: boolean
  id?: string
  githubConfigured: boolean
}

export function BranchPicker({
  projectSlug,
  repo,
  value,
  onChange,
  disabled,
  invalid,
  id,
  githubConfigured,
}: BranchPickerProps) {
  const listId = useId()
  const trimmedRepo = repo.trim()
  const isValidRepo = /^[^/\s]+\/[^/\s]+$/.test(trimmedRepo)
  const { data: branches, isFetching } = useGitHubBranches(
    projectSlug,
    isValidRepo ? trimmedRepo : undefined,
    { enabled: githubConfigured },
  )

  const showList = githubConfigured && (branches?.length ?? 0) > 0

  const byName = useMemo(() => {
    const map = new Map<string, GitHubBranch>()
    for (const b of branches ?? []) map.set(b.name, b)
    return map
  }, [branches])

  return (
    <div className="relative">
      <Input
        id={id}
        value={value}
        onChange={(e) => {
          const next = e.target.value
          onChange(next, byName.get(next.trim()))
        }}
        disabled={disabled}
        placeholder={isFetching ? "Loading branches…" : "main"}
        list={showList ? listId : undefined}
        autoComplete="off"
        aria-invalid={invalid || undefined}
      />
      {showList && (
        <datalist id={listId}>
          {branches?.map((b) => (
            <option key={b.name} value={b.name}>
              {b.protected ? "protected" : ""}
            </option>
          ))}
        </datalist>
      )}
    </div>
  )
}
