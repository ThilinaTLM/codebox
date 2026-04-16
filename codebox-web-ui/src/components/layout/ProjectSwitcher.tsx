import { useMemo, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowDown01Icon,
  FolderFavouriteIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import type { Project } from "@/net/http/types"
import { cn } from "@/lib/utils"
import { useProjects } from "@/net/query"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Spinner } from "@/components/ui/spinner"

interface ProjectSwitcherProps {
  activeSlug: string | null
  collapsed: boolean
}

export function ProjectSwitcher({ activeSlug, collapsed }: ProjectSwitcherProps) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const { data: projects, isLoading } = useProjects()

  const active = useMemo<Project | null>(() => {
    if (!projects || !activeSlug) return null
    return projects.find((p) => p.slug === activeSlug) ?? null
  }, [projects, activeSlug])

  const label = active?.name ?? "Select project"

  if (collapsed) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className="mx-auto mt-2 flex size-9 items-center justify-center rounded-lg bg-sidebar-accent/60 text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
          aria-label="Switch project"
        >
          <HugeiconsIcon icon={FolderFavouriteIcon} size={16} strokeWidth={2} />
        </PopoverTrigger>
        <ProjectSwitcherPopover
          projects={projects ?? []}
          isLoading={isLoading}
          activeSlug={activeSlug}
          onSelect={(slug) => {
            setOpen(false)
            void navigate({
              to: "/projects/$projectSlug",
              params: { projectSlug: slug },
            })
          }}
        />
      </Popover>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          "group/switcher mx-2 mt-2 flex items-center gap-2 rounded-lg border border-sidebar-border/60 bg-sidebar-accent/40 px-2.5 py-1.5 text-left transition-colors hover:bg-sidebar-accent/80"
        )}
        aria-label="Switch project"
      >
        <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <HugeiconsIcon
            icon={FolderFavouriteIcon}
            size={14}
            strokeWidth={2}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
            Project
          </span>
          <span className="truncate text-sm font-medium text-sidebar-foreground">
            {label}
          </span>
        </div>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          size={14}
          strokeWidth={2}
          className="shrink-0 text-muted-foreground"
        />
      </PopoverTrigger>
      <ProjectSwitcherPopover
        projects={projects ?? []}
        isLoading={isLoading}
        activeSlug={activeSlug}
        onSelect={(slug) => {
          setOpen(false)
          void navigate({
            to: "/projects/$projectSlug",
            params: { projectSlug: slug },
          })
        }}
      />
    </Popover>
  )
}

function ProjectSwitcherPopover({
  projects,
  isLoading,
  activeSlug,
  onSelect,
}: {
  projects: Array<Project>
  isLoading: boolean
  activeSlug: string | null
  onSelect: (slug: string) => void
}) {
  // Filter archived projects out of the switcher — archived work belongs
  // in the platform inventory, not in an everyday chooser.
  const selectable = projects.filter((p) => p.status === "active")

  return (
    <PopoverContent
      align="start"
      sideOffset={6}
      className="w-64 rounded-xl p-0"
    >
      <Command>
        <CommandInput placeholder="Search projects..." />
        <CommandList>
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Spinner className="size-4" />
            </div>
          ) : (
            <>
              <CommandEmpty>No projects found</CommandEmpty>
              <CommandGroup heading="Projects">
                {selectable.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={`${p.name} ${p.slug}`}
                    onSelect={() => onSelect(p.slug)}
                  >
                    <HugeiconsIcon
                      icon={FolderFavouriteIcon}
                      size={14}
                      strokeWidth={2}
                      className="text-muted-foreground"
                    />
                    <span className="truncate">{p.name}</span>
                    {p.slug === activeSlug && (
                      <HugeiconsIcon
                        icon={Tick02Icon}
                        size={14}
                        strokeWidth={2}
                        className="ml-auto text-primary"
                      />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </Command>
    </PopoverContent>
  )
}
