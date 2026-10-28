import { toast } from 'sonner'
import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import { newAgentLaunchRequestId } from '@/lib/agent-launch-request-id'
import { workspaceKindForWorktreeId } from '@/lib/agent-launch-route-input'
import {
  adoptAgentSessionLaunchVerdict,
  planAgentSessionLaunch
} from '@/lib/agent-session-launch-plan'
import { useAppStore } from '@/store'
import type { ProjectExecutionRuntimeResolution } from '../../../../shared/project-execution-runtime'
import { copyAgentSessionForkContext } from './terminal-agent-session-fork-clipboard'
import { getForkAgentLaunchPlatform } from './terminal-agent-session-fork-launch-platform'
import type { PreparedAgentSessionFork } from './terminal-agent-session-fork'

type ForkLaunchTarget = {
  worktreeId: string
  worktreePath: string | null | undefined
  repo: { connectionId?: string | null } | null | undefined
  projectRuntime: ProjectExecutionRuntimeResolution | undefined
  groupId?: string
  /** Reveals a newly created fork workspace; absent when the fork stays in the source's. */
  reveal?: (providesInitialSurface: boolean) => boolean
  openedMessage: string
}

/** Opens the fork agent in a new tab of `target`, falling back to copying its context. */
export async function launchForkAgent(
  fork: PreparedAgentSessionFork,
  resumeAgentArgs: string | null,
  target: ForkLaunchTarget
): Promise<boolean> {
  if (!fork.agent) {
    target.reveal?.(false)
    return copyAgentSessionForkContext(fork)
  }
  const requestId = newAgentLaunchRequestId()
  // Why: a chat never applies argv, so a full-conversation fork must open as a terminal.
  const agentSessionLaunchPlan = resumeAgentArgs
    ? adoptAgentSessionLaunchVerdict({
        route: 'terminal-tui',
        requestId,
        agent: fork.agent,
        worktreeId: target.worktreeId
      })
    : planAgentSessionLaunch(useAppStore.getState(), {
        requestId,
        agent: fork.agent,
        workspace: {
          kind: workspaceKindForWorktreeId(target.worktreeId),
          worktreeId: target.worktreeId
        },
        prompt: fork.prompt,
        promptDelivery: 'draft'
      })
  const launchPlatform = getForkAgentLaunchPlatform({
    repo: target.repo,
    worktreePath: target.worktreePath,
    projectRuntime: target.projectRuntime
  })
  const { reveal } = target
  const result = launchAgentInNewTab({
    agent: fork.agent,
    worktreeId: target.worktreeId,
    ...(target.groupId ? { groupId: target.groupId } : {}),
    launchSource: 'terminal_context_menu',
    // Why: the resumed conversation already holds the history, so sending the
    // scrollback draft too would make the agent read it back as new input. The fork argv replaces
    // the settings defaults on purpose: like resolveResumeLaunchRecipe, a resume never widens to them.
    ...(resumeAgentArgs
      ? { agentArgs: resumeAgentArgs }
      : { prompt: fork.prompt, promptDelivery: 'draft' as const }),
    ...(fork.agent === 'codex' && fork.codexForkContext?.status === 'available'
      ? {
          agentEnvOverride: fork.codexForkContext.env
        }
      : {}),
    agentSessionLaunchPlan,
    // Why: the launcher opens the fork's surface itself (chat, host terminal or local terminal), so
    // revealing must not seed a sibling shell beside it.
    ...(reveal ? { beforeSurfaceOpen: () => reveal(true) } : {}),
    ...(launchPlatform ? { launchPlatform } : {})
  })
  if (!result) {
    reveal?.(false)
    return copyAgentSessionForkContext(fork)
  }
  toast.success(target.openedMessage)
  return true
}
