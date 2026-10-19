import { ipcMain } from 'electron'
import { humanizeBranchSlug } from '../../../shared/branch-name-from-work'
import { getCommitMessageModelDiscoveryHostKey } from '../../../shared/commit-message-host-key'
import type {
  RollingAgentTitleArgs,
  RollingAgentTitleResult
} from '../../../shared/rolling-agent-title'
import { resolveGenerationTarget } from '../../agent-hooks/first-work-generation-target'
import {
  getSshGitProvider,
  SSH_GIT_PROVIDER_UNAVAILABLE_MESSAGE
} from '../../providers/ssh-git-dispatch'
import type { SshGitProvider } from '../../providers/ssh-git-provider'
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

      let provider: SshGitProvider | null = null
      let cwd = args.worktreePath
      if (args.connectionId) {
        provider = getSshGitProvider(args.connectionId) ?? null
        if (!provider) {
          return { success: false, error: SSH_GIT_PROVIDER_UNAVAILABLE_MESSAGE }
        }
      } else {
        try {
          // Also accepts a folder-workspace root, which has no worktree meta.
          cwd = await resolveModelDiscoveryLocalPath(store, args.worktreePath)
        } catch {
          return { success: false, error: 'Workspace path is not authorized.' }
        }
      }
      const target = await resolveGenerationTarget(cwd, resolved.params.agentId, provider, {
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
