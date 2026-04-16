import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { useBoxDetail } from "@/components/box/BoxDetailContext"
import { FileExplorer } from "@/components/box/FileExplorer"
import { FileViewer } from "@/components/box/FileViewer"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"

export const Route = createFileRoute(
  "/projects/$projectSlug/boxes/$boxId/files"
)({
  component: BoxFilesPage,
})

function BoxFilesPage() {
  const { boxId, isActive } = useBoxDetail()
  const [selectedFile, setSelectedFile] = useState<string | null>(null)

  return (
    <div className="h-full">
      <ResizablePanelGroup orientation="horizontal" id="box-files">
        <ResizablePanel
          id="file-tree"
          defaultSize={25}
          minSize={15}
          className="rounded-bl-lg border-r border-border/40 bg-card"
        >
          <FileExplorer
            boxId={boxId}
            onFileSelect={(path) => setSelectedFile(path)}
            disabled={!isActive}
          />
        </ResizablePanel>
        <ResizableHandle withHandle className="bg-transparent" />
        <ResizablePanel id="file-content" defaultSize={75} minSize={30}>
          <FileViewer boxId={boxId} filePath={selectedFile} />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
