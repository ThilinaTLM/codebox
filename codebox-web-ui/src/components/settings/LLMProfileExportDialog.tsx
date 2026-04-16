import { useCallback, useState } from "react"
import { toast } from "sonner"
import type { LLMProfileKeyMode } from "@/net/http/types"
import { useExportLLMProfiles } from "@/net/query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface LLMProfileExportDialogProps {
  projectSlug: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** When set, export only these profiles. `null` = export all. */
  profileIds?: Array<string> | null
}

export function LLMProfileExportDialog({
  projectSlug,
  open,
  onOpenChange,
  profileIds = null,
}: LLMProfileExportDialogProps) {
  const slug = projectSlug
  const exportMutation = useExportLLMProfiles(slug)

  const [keyMode, setKeyMode] = useState<LLMProfileKeyMode>("no_keys")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")

  const passwordMismatch =
    keyMode === "password_encrypted" &&
    password.length > 0 &&
    confirmPassword.length > 0 &&
    password !== confirmPassword

  const isValid =
    keyMode !== "password_encrypted" ||
    (password.length >= 4 && password === confirmPassword)

  const resetForm = useCallback(() => {
    setKeyMode("no_keys")
    setPassword("")
    setConfirmPassword("")
  }, [])

  const handleExport = () => {
    exportMutation.mutate(
      {
        profile_ids: profileIds,
        key_mode: keyMode,
        password: keyMode === "password_encrypted" ? password : null,
      },
      {
        onSuccess: (data) => {
          // Trigger browser file download
          const json = JSON.stringify(data, null, 2)
          const blob = new Blob([json], { type: "application/json" })
          const url = URL.createObjectURL(blob)
          const a = document.createElement("a")
          const date = new Date().toISOString().slice(0, 10)
          a.href = url
          a.download = `codebox-llm-profiles-${date}.json`
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          URL.revokeObjectURL(url)

          const count = data.profiles.length
          toast.success(
            `Exported ${count} profile${count !== 1 ? "s" : ""}`,
          )
          onOpenChange(false)
          resetForm()
        },
        onError: () => toast.error("Failed to export profiles"),
      },
    )
  }

  const isSingle = profileIds != null && profileIds.length === 1

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetForm()
        onOpenChange(v)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isSingle ? "Export Profile" : "Export Profiles"}
          </DialogTitle>
          <DialogDescription>
            Choose how API keys should be handled in the export file.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <RadioGroup
            value={keyMode}
            onValueChange={(v) => setKeyMode(v as LLMProfileKeyMode)}
          >
            <div className="flex items-start gap-3">
              <RadioGroupItem value="no_keys" className="mt-0.5" />
              <div>
                <Label
                  htmlFor="no_keys"
                  className="cursor-pointer"
                  onClick={() => setKeyMode("no_keys")}
                >
                  Without API keys
                </Label>
                <p className="text-xs text-muted-foreground">
                  You&apos;ll need to re-enter keys after import.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <RadioGroupItem value="plaintext" className="mt-0.5" />
              <div>
                <Label
                  htmlFor="plaintext"
                  className="cursor-pointer"
                  onClick={() => setKeyMode("plaintext")}
                >
                  With API keys (plaintext)
                </Label>
                <p className="text-xs text-muted-foreground">
                  The export file will contain your real API keys.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <RadioGroupItem
                value="password_encrypted"
                className="mt-0.5"
              />
              <div>
                <Label
                  htmlFor="password_encrypted"
                  className="cursor-pointer"
                  onClick={() => setKeyMode("password_encrypted")}
                >
                  With password protection
                </Label>
                <p className="text-xs text-muted-foreground">
                  API keys encrypted with a password you choose.
                </p>
              </div>
            </div>
          </RadioGroup>

          {keyMode === "password_encrypted" && (
            <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3">
              <div className="space-y-1.5">
                <Label htmlFor="export-password">Password</Label>
                <Input
                  id="export-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter a password"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="export-confirm-password">
                  Confirm Password
                </Label>
                <Input
                  id="export-confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                />
                {passwordMismatch && (
                  <p className="text-xs text-destructive">
                    Passwords do not match.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" size="sm" />}>
            Cancel
          </DialogClose>
          <Button
            size="sm"
            onClick={handleExport}
            disabled={!isValid || exportMutation.isPending}
          >
            {exportMutation.isPending ? "Exporting..." : "Export"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
