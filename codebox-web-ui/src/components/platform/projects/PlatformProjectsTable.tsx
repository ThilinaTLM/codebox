import { ProjectRow } from "./ProjectRow"
import type { Project } from "@/net/http/types"
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export function PlatformProjectsTable({ projects }: { projects: Array<Project> }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Project</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Slug</TableHead>
          <TableHead>Created</TableHead>
          <TableHead className="w-10">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {projects.map((project) => (
          <ProjectRow key={project.id} project={project} />
        ))}
      </TableBody>
    </Table>
  )
}