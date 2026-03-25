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
      <div className="space-y-1 p-4">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
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
          <TableHead className="w-[72px] font-mono text-[10px]">ID</TableHead>
          <TableHead className="font-mono text-[10px]">Name</TableHead>
          <TableHead className="font-mono text-[10px]">Port</TableHead>
          <TableHead className="font-mono text-[10px]">Status</TableHead>
          <TableHead className="w-[100px] font-mono text-[10px]">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {containers.map((c) => (
          <TableRow key={c.id}>
            <TableCell className="font-mono text-[10px] text-muted-foreground/50">
              {c.id.slice(0, 8)}
            </TableCell>
            <TableCell className="font-mono text-xs">{c.name}</TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground">
              {c.port ?? "-"}
            </TableCell>
            <TableCell>
              <span className="flex items-center gap-1.5 font-mono text-[10px] text-success">
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
                className="font-mono text-xs text-destructive hover:text-destructive"
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
