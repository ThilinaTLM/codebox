// Re-exports for backward compatibility — all consumers import from "@/net/query"
export type { QueryHookOptions } from "./_internal"
export { authKeys, projectsKeys, boxesKeys, modelsKeys, llmProfilesKeys, automationsKeys, platformKeys } from "./keys"

// Projects
export {
  useProjects,
  useProject,
  useProjectMembers,
  useCreateProject,
  useUpdateProject,
  useArchiveProject,
  useRestoreProject,
  useDeleteProject,
  useProjectMemberCandidates,
  useAddProjectMember,
  useUpdateProjectMemberRole,
  useRemoveProjectMember,
} from "./projects"

// Boxes
export {
  useBoxes,
  useBox,
  useBoxEvents,
  useBoxFiles,
  useBoxFileContent,
  useWriteFile,
  useUploadFile,
  useBoxLogs,
  useCreateBox,
  useStopBox,
  useRestartBox,
  useCancelBox,
  useDeleteBox,
  useSendMessage,
} from "./boxes"

// Models
export { useModels, usePreviewModels } from "./models"

// LLM Profiles
export {
  useLLMProfiles,
  useCreateLLMProfile,
  useUpdateLLMProfile,
  useDeleteLLMProfile,
  useDuplicateLLMProfile,
  useExportLLMProfiles,
  useImportLLMProfiles,
} from "./llmProfiles"

// Automations
export {
  useAutomations,
  useAutomation,
  useCreateAutomation,
  useUpdateAutomation,
  useDeleteAutomation,
  useAutomationRuns,
  useInfiniteAutomationRuns,
  useDryRunAutomation,
} from "./automations"

// Project Settings
export { useProjectSettings, useUpdateProjectSettings } from "./projectSettings"

// GitHub
export {
  useGitHubStatus,
  useGitHubInstallations,
  useGitHubRepos,
  useGitHubBranches,
  useAddGitHubInstallation,
  useSyncGitHubInstallation,
  useRemoveGitHubInstallation,
  usePrepareGitHubManifest,
  useDisconnectGitHubApp,
} from "./github"

// Auth
export {
  useMe,
  useUsers,
  useCreateUser,
  useUpdateProfile,
  useDeleteUser,
  useChangePassword,
} from "./auth"

// Platform
export { useOrphanContainers, useDeleteOrphanContainer } from "./platform"