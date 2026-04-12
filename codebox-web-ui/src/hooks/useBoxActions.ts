import { useCallback } from "react"
import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import {
  useBox,
  useCancelBox,
  useDeleteBox,
  useRestartBox,
  useSendExec,
  useSendMessage,
  useStopBox,
} from "@/net/query"

export function useBoxActions(boxId: string) {
  const { refetch } = useBox(boxId)
  const navigate = useNavigate()

  const stopMutation = useStopBox()
  const deleteMutation = useDeleteBox()
  const restartMutation = useRestartBox()
  const sendMessageMutation = useSendMessage()
  const sendExecMutation = useSendExec()
  const cancelMutation = useCancelBox()

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
        navigate({ to: "/" })
      },
      onError: () => toast.error("Failed to delete"),
    })
  }, [deleteMutation, boxId, navigate])

  const handleSendMessage = useCallback(
    (content: string) => {
      sendMessageMutation.mutate({ boxId, message: content })
    },
    [sendMessageMutation, boxId]
  )

  const handleSendExec = useCallback(
    (command: string) => {
      sendExecMutation.mutate({ boxId, command })
    },
    [sendExecMutation, boxId]
  )

  const handleCancel = useCallback(() => {
    cancelMutation.mutate(boxId)
  }, [cancelMutation, boxId])

  return {
    stop: handleStop,
    restart: handleRestart,
    delete: handleDelete,
    sendMessage: handleSendMessage,
    sendExec: handleSendExec,
    cancel: handleCancel,
    isStopPending: stopMutation.isPending,
    isDeletePending: deleteMutation.isPending,
    isRestartPending: restartMutation.isPending,
  }
}
