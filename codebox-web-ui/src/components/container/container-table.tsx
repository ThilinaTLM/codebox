import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useContainers, useStopContainer } from "@/hooks/queries"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"

export function ContainerTable() {
  const { data: containers, isLoading } = useContainers()
  const stopContainer = useStopContainer()

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    )
  }

  if (!containers?.length) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No running containers
      </p>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Port</TableHead>
          <TableHead className="w-[100px]">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {containers.map((c) => (
          <TableRow key={c.id}>
            <TableCell className="font-mono text-xs">{c.name}</TableCell>
            <TableCell>{c.port ?? "—"}</TableCell>
            <TableCell>
              <Button
                variant="destructive"
                size="sm"
                onClick={() =>
                  stopContainer.mutate(c.id, {
                    onSuccess: () => toast.success("Container stopped"),
                    onError: () => toast.error("Failed to stop container"),
                  })
                }
                disabled={stopContainer.isPending}
              >
                Stop
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
