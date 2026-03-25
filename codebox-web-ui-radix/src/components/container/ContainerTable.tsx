import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty"
import { useContainers, useStopContainer } from "@/net/query"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"

export function ContainerTable() {
  const { data: containers, isLoading } = useContainers()
  const stopContainer = useStopContainer()

  if (isLoading) {
    return (
      <div className="space-y-1 p-6">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    )
  }

  if (!containers?.length) {
    return (
      <Empty className="py-20">
        <EmptyHeader>
          <EmptyTitle>No running containers</EmptyTitle>
          <EmptyDescription>
            Containers are created automatically when tasks start.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[80px] text-xs font-medium">ID</TableHead>
          <TableHead className="text-xs font-medium">Name</TableHead>
          <TableHead className="text-xs font-medium">Port</TableHead>
          <TableHead className="text-xs font-medium">Status</TableHead>
          <TableHead className="w-[100px] text-xs font-medium">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {containers.map((c) => (
          <TableRow key={c.id}>
            <TableCell className="font-mono text-xs text-muted-foreground/60">
              {c.id.slice(0, 8)}
            </TableCell>
            <TableCell className="font-mono text-sm">{c.name}</TableCell>
            <TableCell className="font-mono text-sm text-muted-foreground">
              {c.port ?? "-"}
            </TableCell>
            <TableCell>
              <span className="flex items-center gap-1.5 text-xs text-success">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-success" />
                </span>
                running
              </span>
            </TableCell>
            <TableCell>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  stopContainer.mutate(c.id, {
                    onSuccess: () => toast.success("Container stopped"),
                    onError: () => toast.error("Failed to stop container"),
                  })
                }
                disabled={stopContainer.isPending}
                className="text-destructive hover:text-destructive"
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
