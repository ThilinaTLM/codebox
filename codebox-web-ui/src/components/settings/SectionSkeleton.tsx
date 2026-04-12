import { Skeleton } from "@/components/ui/skeleton"

export function SectionSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-80" />
      <Skeleton className="mt-4 h-32 w-full max-w-md rounded-lg" />
    </div>
  )
}
