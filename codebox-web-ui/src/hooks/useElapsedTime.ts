import { useEffect, useState } from "react"

/**
 * Returns a formatted elapsed-time string that updates every second.
 *
 * @param startedAt  ISO timestamp (or null)
 * @param isActive   whether the timer should be ticking
 * @returns e.g. "3m 04s", "1h 12m", or "" when startedAt is null
 */
export function useElapsedTime(
  startedAt: string | null,
  isActive: boolean
): string {
  const [elapsed, setElapsed] = useState("")

  useEffect(() => {
    if (!startedAt || !isActive) {
      setElapsed("")
      return
    }

    const start = new Date(startedAt).getTime()

    function tick() {
      const diff = Date.now() - start
      const totalMinutes = Math.floor(diff / 60_000)
      const seconds = Math.floor((diff % 60_000) / 1_000)

      if (totalMinutes >= 60) {
        const hours = Math.floor(totalMinutes / 60)
        const mins = totalMinutes % 60
        setElapsed(`${hours}h ${mins}m`)
      } else {
        setElapsed(`${totalMinutes}m ${seconds.toString().padStart(2, "0")}s`)
      }
    }

    tick()
    const interval = setInterval(tick, 1_000)
    return () => clearInterval(interval)
  }, [startedAt, isActive])

  return elapsed
}
