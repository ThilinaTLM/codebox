import { cn } from "@/lib/utils"
import { HugeiconsIcon } from "@hugeicons/react"
import { Loading03Icon } from "@hugeicons/core-free-icons"

function Spinner({ className, ...props }: Omit<React.ComponentProps<"svg">, "size"> & { size?: number }) {
  return (
    <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} role="status" aria-label="Loading" size={props.size} className={cn("size-4 animate-spin", className)} />
  )
}

export { Spinner }
