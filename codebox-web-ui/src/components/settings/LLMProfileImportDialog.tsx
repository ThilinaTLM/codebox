import { useCallback, useRef, useState } from "react"
import { toast } from "sonner"
import type { LLMProfileExportFile } from "@/net/http/types"
import { useImportLLMProfiles } from "@/net/query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface LLMProfileImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function LLMProfileImportDialog({
  open,
  onOpenChange,
}: LLMProfileImportDialogProps) {
  const importMutation = useImportLLMProfiles()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [exportFile, setExportFile] = useState<LLMProfileExportFile | null>(
    null,
  )
  const [parseError, setParseError] = useState<string | null>(null)
  const [password, setPassword] = useState("")
  const [fileName, setFileName] = useState<string | null>(null)

  const resetForm = useCallback(() => {
    setExportFile(null)
    setParseError(null)
    setPassword("")
    setFileName(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    setParseError(null)
    setExportFile(null)

    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string) as Record<string, unknown>
        if (!data.version || !Array.isArray(data.profiles)) {
          setParseError("Invalid export file format.")
          return
        }
        setExportFile(data as unknown as LLMProfileExportFile)
      } catch {
        setParseError("Could not parse the file. Make sure it is a valid JSON export.")
      }
    }
    reader.onerror = () => setParseError("Failed to read the file.")
    reader.readAsText(file)
  }

  const needsPassword = exportFile?.key_mode === "password_encrypted"
  const isNoKeys = exportFile?.key_mode === "no_keys"

  const isValid =
    exportFile != null &&
    exportFile.profiles.length > 0 &&
    (!needsPassword || password.length >= 4)

  const handleImport = () => {
    if (!exportFile) return
    importMutation.mutate(
      {
        file: exportFile,
        password: needsPassword ? password : null,
      },
      {
        onSuccess: (result) => {
          const parts: Array<string> = []
          if (result.imported > 0) {
            parts.push(
              `Imported ${result.imported} profile${result.imported !== 1 ? "s" : ""}`,
            )
          }
          if (result.skipped > 0) {
            parts.push(
              `${result.skipped} skipped (no API key)`,
            )
          }
          toast.success(parts.join(", ") || "Import complete")
          onOpenChange(false)
          resetForm()
        },
        onError: (err) => {
          const message =
            (err as { response?: { data?: { detail?: string } } }).response
              ?.data?.detail ?? "Import failed"
          toast.error(message)
        },
      },
    )
  }

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
          <DialogTitle>Import Profiles</DialogTitle>
          <DialogDescription>
            Upload a previously exported JSON file to import LLM profiles.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* File picker */}
          <div className="space-y-1.5">
            <Label htmlFor="import-file">Export File</Label>
            <Input
              ref={fileInputRef}
              id="import-file"
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
            />
            {parseError && (
              <p className="text-xs text-destructive">{parseError}</p>
            )}
          </div>

          {/* Preview */}
          {exportFile && (
            <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2">
              <p className="text-sm">
                <span className="font-medium">
                  {exportFile.profiles.length}
                </span>{" "}
                profile{exportFile.profiles.length !== 1 ? "s" : ""} found
                {fileName && (
                  <span className="text-muted-foreground">
                    {" "}
                    in {fileName}
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {exportFile.key_mode === "no_keys" &&
                  "API keys were not included — you'll need to add them after import."}
                {exportFile.key_mode === "plaintext" &&
                  "API keys are included in plaintext."}
                {exportFile.key_mode === "password_encrypted" &&
                  "API keys are password-protected. Enter the password below."}
              </p>
            </div>
          )}

          {/* Password for encrypted imports */}
          {needsPassword && (
            <div className="space-y-1.5">
              <Label htmlFor="import-password">Password</Label>
              <Input
                id="import-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter the export password"
              />
            </div>
          )}

          {/* Warning for no-keys imports */}
          {isNoKeys && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Profiles will be imported without API keys. Only profiles with
              keys can be used to create Boxes — you&apos;ll need to edit each
              profile and add a key.
            </p>
          )}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" size="sm" />}>
            Cancel
          </DialogClose>
          <Button
            size="sm"
            onClick={handleImport}
            disabled={!isValid || importMutation.isPending}
          >
            {importMutation.isPending
              ? "Importing..."
              : `Import${exportFile ? ` ${exportFile.profiles.length} Profile${exportFile.profiles.length !== 1 ? "s" : ""}` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
