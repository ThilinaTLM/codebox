import { useCallback } from "react"
import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import {
  useBox,
  useCancelBox,
  useDeleteBox,
  useRestartBox,
  useSendMessage,
  useStopBox,
} from "@/net/query"

export function useBoxActions(slug: string, boxId: string) {
  const { refetch } = useBox(slug, boxId)
  const navigate = useNavigate()

  const stopMutation = useStopBox(slug)
  const deleteMutation = useDeleteBox(slug)
  const restartMutation = useRestartBox(slug)
  const sendMessageMutation = useSendMessage(slug)
  const cancelMutation = useCancelBox(slug)

  const handleStop = useCallback(() => {
    stopMutation.mutate(boxId, {
      onSuccess: () => toast.success("Agent stopped"),
      onError: () => toast.error("Failed to stop"),
    })
  }, [stopMutation, boxId])

  const handleRestart = useCallback(() => {
    restartMutation.mutate(boxId, {
      onSuccess: () => {
        toast.success("Agent restarting")
        refetch()
      },
      onError: () => toast.error("Failed to restart"),
    })
  }, [restartMutation, boxId, refetch])

  const handleDelete = useCallback(() => {
    deleteMutation.mutate(boxId, {
      onSuccess: () => {
        toast.success("Agent deleted")
        navigate({ to: `/projects/${slug}` })
      },
      onError: () => toast.error("Failed to delete"),
    })
  }, [deleteMutation, boxId, navigate, slug])

  const handleSendMessage = useCallback(
    (content: string) => {
      sendMessageMutation.mutate({ boxId, message: content })
    },
    [sendMessageMutation, boxId]
  )

  const handleCancel = useCallback(() => {
    cancelMutation.mutate(boxId)
  }, [cancelMutation, boxId])

  return {
    stop: handleStop,
    restart: handleRestart,
    delete: handleDelete,
    sendMessage: handleSendMessage,
    cancel: handleCancel,
    isStopPending: stopMutation.isPending,
    isDeletePending: deleteMutation.isPending,
    isRestartPending: restartMutation.isPending,
  }
}
