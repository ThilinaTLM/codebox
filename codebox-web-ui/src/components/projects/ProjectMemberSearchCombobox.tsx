import { useEffect, useState } from "react"
import type { ProjectMemberCandidate } from "@/net/http/types"
import { useProjectMemberCandidates } from "@/net/query"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Spinner } from "@/components/ui/spinner"

function displayName(user: ProjectMemberCandidate): string {
  const parts = [user.first_name, user.last_name].filter(Boolean)
  return parts.length > 0 ? parts.join(" ") : user.username
}

interface ProjectMemberSearchComboboxProps {
  projectSlug: string
  value: ProjectMemberCandidate | null
  onChange: (user: ProjectMemberCandidate | null) => void
}

export function ProjectMemberSearchCombobox({
  projectSlug,
  value,
  onChange,
}: ProjectMemberSearchComboboxProps) {
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 200)
    return () => clearTimeout(t)
  }, [query])

  const { data: candidates, isFetching } = useProjectMemberCandidates(
    projectSlug,
    debouncedQuery
  )

  const list = candidates ?? []

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Command shouldFilter={false}>
        <CommandInput
          placeholder="Search users by name or username"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {isFetching && list.length === 0 ? (
            <div className="flex items-center justify-center py-6">
              <Spinner className="size-4" />
            </div>
          ) : list.length === 0 ? (
            <CommandEmpty>
              {query
                ? "No matching users found"
                : "No users available to add"}
            </CommandEmpty>
          ) : (
            <CommandGroup heading="Users">
              {list.map((user) => {
                const selected = value?.id === user.id
                return (
                  <CommandItem
                    key={user.id}
                    value={`${user.username} ${displayName(user)}`}
                    onSelect={() =>
                      onChange(selected ? null : user)
                    }
                    data-checked={selected ? "true" : "false"}
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm">
                        {displayName(user)}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {user.username}
                      </span>
                    </div>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </div>
  )
}
