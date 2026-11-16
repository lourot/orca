import { ipcMain } from 'electron'
import { humanizeBranchSlug } from '../../../shared/branch-name-from-work'
import { getCommitMessageModelDiscoveryHostKey } from '../../../shared/commit-message-host-key'
import type {
  RollingAgentTitleArgs,
  RollingAgentTitleResult
} from '../../../shared/rolling-agent-title'
import { resolveGenerationTarget } from '../../agent-hooks/first-work-generation-target'
import {
  generateBranchNameFromContext,
  resolveTextGenerationParams
} from '../../text-generation/commit-message-text-generation'
import type { FilesystemHandlerContext } from './filesystem-handler-context'
import {
  getRepoForSourceControlAi,
  resolveModelDiscoveryLocalPath
} from './filesystem-source-control-ai-targets'

/**
 * Regenerates one agent tab's title from its latest finished turn. Shares the
 * `branchName` operation's agent/model choice and generation machinery - the
 * same spawn the first-work branch rename already uses.
 */
export function registerFilesystemAgentRollingTitleHandlers(
  context: FilesystemHandlerContext
): void {
  const { store, commitMessageAgentEnv } = context
  ipcMain.handle(
    'agentStatus:generateRollingTitle',
    async (_event, args: RollingAgentTitleArgs): Promise<RollingAgentTitleResult> => {
      const prompt = args.prompt.trim()
      if (!prompt) {
        return { success: false, error: 'No prompt to summarize.' }
      }
      const resolved = resolveTextGenerationParams(
        store.getSettings(),
        getCommitMessageModelDiscoveryHostKey(args.connectionId ?? null),
        'branchName',
        await getRepoForSourceControlAi(store, args)
      )
      if (!resolved.ok) {
        return { success: false, error: resolved.error }
      }

      // Why: title generation spawns its agent locally; an SSH workspace's files live on its host.
      if (args.connectionId) {
        return { success: false, error: 'Rolling titles are not available for SSH workspaces.' }
      }
      let cwd: string
      try {
        // Also accepts a folder-workspace root, which has no worktree meta.
        cwd = await resolveModelDiscoveryLocalPath(store, args.worktreePath)
      } catch {
        return { success: false, error: 'Workspace path is not authorized.' }
      }
      const target = await resolveGenerationTarget(cwd, resolved.params.agentId, {
        getAgentEnvResolvers: () => commitMessageAgentEnv
      })
      if (!target) {
        return { success: false, error: 'Could not prepare the title generation environment.' }
      }

      const generated = await generateBranchNameFromContext(
        { firstPrompt: prompt, assistantMessage: args.assistantMessage },
        resolved.params,
        target
      )
      if (!generated.success) {
        return { success: false, error: generated.error }
      }
      const title = humanizeBranchSlug(generated.slug).trim()
      return title
        ? { success: true, title }
        : { success: false, error: 'Generated an empty title.' }
    }
  )
}
