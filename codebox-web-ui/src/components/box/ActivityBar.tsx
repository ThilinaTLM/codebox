interface ActivityBarProps {
  activity: {
    label: string
    animate: boolean
    dotColor: string
    isWorking: boolean
  }
}

export function ActivityBar({ activity }: ActivityBarProps) {
  const getBarColor = () => {
    if (activity.label.includes("Thinking")) return "from-state-thinking"
    if (activity.label.includes("Writing")) return "from-state-writing"
    if (activity.label.includes("Using")) return "from-state-tool-use"
    return "from-border"
  }

  return (
    <div
      className={`w-full overflow-hidden transition-all duration-300 ${
        activity.isWorking ? "h-[3px]" : "h-0"
      }`}
    >
      <div
        className={`h-full w-full bg-gradient-to-r ${getBarColor()} to-transparent transition-colors duration-500 ${
          activity.animate ? "animate-glow-pulse" : ""
        }`}
      />
    </div>
  )
}
