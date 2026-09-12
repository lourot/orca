import { toast } from 'sonner'
import type { ManagedPane } from '@/lib/pane-manager/pane-manager'
import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import { buildAgentSessionForkPrompt } from '@/lib/agent-session-fork-context'
import { copyAgentSessionForkContext } from './terminal-agent-session-fork-clipboard'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { useAppStore } from '@/store'
import { makePaneKey } from '../../../../shared/stable-pane-id'
import { TUI_AGENT_CONFIG } from '../../../../shared/tui-agent-config'
import { getForkAgentLaunchPlatform } from './terminal-agent-session-fork-launch-platform'
import { preflightAgentTrust } from '@/lib/agent-trust-preflight'
import { slugifyForWorkspaceName } from '../../../../shared/workspace-name'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../../shared/constants'
import type { TuiAgent } from '../../../../shared/tui-agent'
import {
  getAgentForkResumeArgv,
  isResumableTuiAgent,
  type AgentProviderSessionMetadata
} from '../../../../shared/agent-session-resume'
import { getLocalProjectExecutionRuntimeContext } from '@/lib/local-preflight-context'
import { translate } from '@/i18n/i18n'
import { planAgentSessionLaunch } from '@/lib/agent-session-launch-plan'

type ForkAgentSessionFromPaneArgs = {
  pane: ManagedPane
  tabId: string
  worktreeId: string
  groupId: string | null
}

/** `full-conversation` resumes the agent's real transcript into the new worktree;
 *  `recent-context` hands it a bounded scrollback capture as an editable draft. */
export type AgentSessionForkMode = 'full-conversation' | 'recent-context'

export type PreparedAgentSessionFork = {
  prompt: string
  agent: TuiAgent | null
  worktreeId: string
  pane: ManagedPane
  /** The source pane's provider session, when its agent reported one. */
  providerSession: AgentProviderSessionMetadata | null
  mode: AgentSessionForkMode
}

function buildForkWorkspaceName(sourceName: string): string {
  return slugifyForWorkspaceName(`${sourceName}-fork`) || 'session-fork'
}

function resolveTuiAgent(value: string | null | undefined): TuiAgent | null {
  return value && Object.hasOwn(TUI_AGENT_CONFIG, value) ? (value as TuiAgent) : null
}

function getUsableForkBase(
  worktree:
    | { branch?: string | null; isArchived?: boolean; isBare?: boolean; repoId?: string }
    | null
    | undefined,
  repo: { kind?: string } | null | undefined,
  worktreeId: string
): string | null {
  const branch = worktree?.branch?.trim()
  if (
    worktreeId === FLOATING_TERMINAL_WORKTREE_ID ||
    !branch ||
    worktree?.isArchived ||
    worktree?.isBare ||
    !repo ||
    repo.kind === 'folder'
  ) {
    return null
  }
  return branch
}

export function prepareAgentSessionForkFromPane({
  pane,
  tabId,
  worktreeId
}: ForkAgentSessionFromPaneArgs): PreparedAgentSessionFork | null {
  const paneKey = makePaneKey(tabId, pane.leafId)
  const state = useAppStore.getState()
  const paneStatus = state.agentStatusByPaneKey[paneKey]
  const sourceAgent = resolveTuiAgent(paneStatus?.agentType)
  const tabAgent = resolveTuiAgent(
    state.tabsByWorktree[worktreeId]?.find((tab) => tab.id === tabId)?.launchAgent
  )
  const agent = sourceAgent ?? tabAgent
  // Why capture scrollback even in full-conversation mode: it backs the
  // `recent-context` fork and every clipboard fallback, and it keeps SSH and
  // local panes on one path because both expose xterm state here.
  const prompt = buildAgentSessionForkPrompt({
    capturedText: pane.serializeAddon.serialize({ scrollback: 800 }),
    sourceLabel: paneKey,
    agentLabel: agent
  })

  if (!prompt) {
    toast.error(
      translate(
        'auto.components.terminal.pane.terminal.agent.session.fork.046e8d853c',
        'No terminal context to fork'
      )
    )
    pane.terminal.focus()
    return null
  }

  return {
    prompt,
    agent,
    worktreeId,
    pane,
    providerSession: paneStatus?.providerSession ?? null,
    mode: 'recent-context'
  }
}

/** CLI arguments that resume the source conversation into a fresh copy, or null
 *  when this fork is a scrollback capture. */
function getForkResumeAgentArgs(fork: PreparedAgentSessionFork): string | null {
  if (fork.mode !== 'full-conversation' || !fork.agent || !isResumableTuiAgent(fork.agent)) {
    return null
  }
  const argv = fork.providerSession
    ? getAgentForkResumeArgv(fork.agent, fork.providerSession)
    : null
  // Safe to join bare: the launcher re-quotes every word for the target shell,
  // and getAgentForkResumeArgv only returns ids that survive being re-split.
  return argv ? argv.slice(1).join(' ') : null
}

export async function startAgentSessionFork(fork: PreparedAgentSessionFork): Promise<boolean> {
  const resumeAgentArgs = getForkResumeAgentArgs(fork)
  if (fork.mode === 'full-conversation' && !resumeAgentArgs) {
    // Unreachable from the dialog, which gates on the same predicate — so this
    // means the session vanished. Say so rather than quietly forking the
    // scrollback the user chose against.
    toast.error(
      translate(
        'auto.components.terminal.pane.terminal.agent.session.fork.97c87c36a7',
        'This agent session can no longer be forked with its full conversation.'
      )
    )
    return false
  }
  const store = useAppStore.getState()
  const sourceWorktree = store.getKnownWorktreeById(fork.worktreeId)
  if (!sourceWorktree) {
    toast.error(
      translate(
        'auto.components.terminal.pane.terminal.agent.session.fork.f867385bb5',
        'Could not find the source workspace for this fork.'
      )
    )
    return false
  }
  const sourceRepo = store.repos.find((repo) => repo.id === sourceWorktree.repoId)
  const sourceProjectRuntime = getLocalProjectExecutionRuntimeContext(store, fork.worktreeId)
  const sourceBranch = getUsableForkBase(sourceWorktree, sourceRepo, fork.worktreeId)
  if (!sourceBranch) {
    toast.error(
      translate(
        'auto.components.terminal.pane.terminal.agent.session.fork.38e41edc6e',
        'This workspace cannot be forked into a git worktree.'
      )
    )
    return false
  }
  const forkName = buildForkWorkspaceName(sourceWorktree.displayName || sourceBranch)
  let created: Awaited<ReturnType<typeof store.createWorktree>>
  try {
    created = await store.createWorktree(
      sourceWorktree.repoId,
      forkName,
      sourceBranch,
      'inherit',
      undefined,
      'terminal_context_menu',
      `Fork of ${sourceWorktree.displayName || forkName}`,
      undefined,
      undefined,
      undefined,
      fork.agent ?? undefined
    )
  } catch (error) {
    toast.error(
      error instanceof Error
        ? error.message
        : translate(
            'auto.components.terminal.pane.terminal.agent.session.fork.fd3d12a1e1',
            'Failed to create fork workspace.'
          )
    )
    return false
  }
  const forkWorktreeId = created.worktree.id

  if (!fork.agent) {
    activateAndRevealWorktree(forkWorktreeId, { sidebarRevealBehavior: 'auto' })
    return copyAgentSessionForkContext(fork)
  }
  const agentSessionLaunchPlan = planAgentSessionLaunch(useAppStore.getState(), {
    agent: fork.agent,
    workspace: { kind: 'git-worktree', worktreeId: forkWorktreeId },
    prompt: fork.prompt,
    promptDelivery: 'draft'
  })
  if (agentSessionLaunchPlan.route !== 'structured-native-chat') {
    await preflightAgentTrust({
      agent: fork.agent,
      workspacePath: created.worktree.path,
      connectionId: sourceRepo?.connectionId
    })
  }
  const launchPlatform = getForkAgentLaunchPlatform({
    repo: sourceRepo,
    worktreePath: created.worktree.path,
    projectRuntime: sourceProjectRuntime
  })
  const result = launchAgentInNewTab({
    agent: fork.agent,
    worktreeId: forkWorktreeId,
    launchSource: 'terminal_context_menu',
    // Why: the resumed conversation already holds the history, so sending the
    // scrollback draft too would make the agent read it back as new input.
    ...(resumeAgentArgs
      ? { agentArgs: resumeAgentArgs }
      : { prompt: fork.prompt, promptDelivery: 'draft' as const }),
    agentSessionLaunchPlan,
    beforeSurfaceOpen: (surface) =>
      activateAndRevealWorktree(forkWorktreeId, {
        sidebarRevealBehavior: 'auto',
        ...(surface.kind === 'local-agent-session' ? { providesInitialSurface: true } : {})
      }) !== false,
    ...(launchPlatform ? { launchPlatform } : {})
  })
  if (!result) {
    activateAndRevealWorktree(forkWorktreeId, { sidebarRevealBehavior: 'auto' })
    return copyAgentSessionForkContext(fork)
  }
  notifyForkOpened()
  return true
}

function notifyForkOpened(): void {
  toast.success(
    translate(
      'auto.components.terminal.pane.terminal.agent.session.fork.88e34d00eb',
      'Top-level session fork opened in a new workspace'
    )
  )
}

export async function forkAgentSessionFromPane(args: ForkAgentSessionFromPaneArgs): Promise<void> {
  const fork = prepareAgentSessionForkFromPane(args)
  if (fork) {
    await startAgentSessionFork(fork)
  }
}
