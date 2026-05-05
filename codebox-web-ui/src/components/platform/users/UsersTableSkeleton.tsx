import { Skeleton } from "@/components/ui/skeleton"

export function UsersTableSkeleton() {
  return (
    <div className="space-y-3 pt-2">
      <div className="flex items-center gap-8 px-3">
        <Skeleton className="h-3 w-16 rounded" />
        <Skeleton className="h-3 w-10 rounded" />
        <Skeleton className="h-3 w-14 rounded" />
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-3">
          <Skeleton className="size-6 shrink-0 rounded-full" />
          <Skeleton className="h-3 w-24 rounded" />
          <Skeleton className="ml-4 h-5 w-14 rounded-full" />
          <Skeleton className="ml-auto h-3 w-20 rounded" />
        </div>
      ))}
    </div>
  )
}