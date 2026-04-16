import { useEffect, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useBoxes } from "@/net/query"
import { useActiveProjectSlug } from "@/hooks/useActiveProjectSlug"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const slug = useActiveProjectSlug()
  const { data: boxes } = useBoxes(slug ?? undefined)
  const navigate = useNavigate()

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  function handleSelect(cb: () => void) {
    setOpen(false)
    cb()
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <Command>
        <CommandInput placeholder="Search agents, actions..." />
        <CommandList>
          <CommandEmpty>No results</CommandEmpty>

          <CommandGroup heading="Actions">
            <CommandItem
              onSelect={() =>
                handleSelect(() =>
                  slug
                    ? navigate({
                        to: "/projects/$projectSlug/boxes/create",
                        params: { projectSlug: slug },
                      })
                    : navigate({ to: "/projects" })
                )
              }
            >
              Create Agent
            </CommandItem>
            <CommandItem
              onSelect={() =>
                handleSelect(() => navigate({ to: "/projects" }))
              }
            >
              Switch Project
            </CommandItem>
            <CommandItem
              onSelect={() =>
                handleSelect(() => navigate({ to: "/settings/account" }))
              }
            >
              Account Settings
            </CommandItem>
          </CommandGroup>

          {slug && boxes && boxes.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Agents">
                {boxes.map((box) => (
                  <CommandItem
                    key={box.id}
                    onSelect={() =>
                      handleSelect(() =>
                        navigate({
                          to: "/projects/$projectSlug/boxes/$boxId",
                          params: { projectSlug: slug, boxId: box.id },
                        })
                      )
                    }
                  >
                    <span>{box.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {box.model}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
