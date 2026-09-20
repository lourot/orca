import { toast } from 'sonner'
import type { ManagedPane } from '@/lib/pane-manager/pane-manager'
import { buildAgentSessionForkPrompt } from '@/lib/agent-session-fork-context'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { resolveOwner } from '@/lib/resolve-owner'
import { toRuntimeExecutionHostId, type ExecutionHostId } from '../../../../shared/execution-host'
import { useAppStore } from '@/store'
import { makePaneKey } from '../../../../shared/stable-pane-id'
import { TUI_AGENT_CONFIG } from '../../../../shared/tui-agent-config'
import { launchForkAgent } from './terminal-agent-session-fork-launch'
import { slugifyForWorkspaceName } from '../../../../shared/workspace-name'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../../shared/constants'
import type { TuiAgent } from '../../../../shared/tui-agent'
import type { CodexForkContext } from '../../../../shared/codex-fork-context'
import {
  isResumableTuiAgent,
  type AgentProviderSessionMetadata
} from '../../../../shared/agent-session-resume'
import { getAgentForkResumeArgv } from '../../../../shared/agent-session-fork-resume-argv'
import { getLocalProjectExecutionRuntimeContext } from '@/lib/local-preflight-context'
import { translate } from '@/i18n/i18n'

type ForkAgentSessionFromPaneArgs = {
  pane: ManagedPane
  tabId: string
  worktreeId: string
  groupId: string | null
}

/** `full-conversation` resumes the agent's real transcript under a new session id;
 *  `recent-context` hands it a bounded scrollback capture as an editable draft. */
export type AgentSessionForkMode = 'full-conversation' | 'recent-context'

/** `new-workspace` creates a top-level git worktree for the fork; `this-workspace` opens it in a
 *  new tab beside the source pane. */
export type AgentSessionForkDestination = 'new-workspace' | 'this-workspace'

export type PreparedAgentSessionFork = {
  prompt: string
  agent: TuiAgent | null
  worktreeId: string
  /** The source pane's tab group, so a same-workspace fork opens beside it. */
  groupId?: string | null
  /** The source cannot get a git worktree of its own (folder, floating, branchless, archived). */
  newWorkspaceBlocked?: boolean
  pane: ManagedPane
  /** The source pane's provider session, when its agent reported one. */
  providerSession: AgentProviderSessionMetadata | null
  mode: AgentSessionForkMode
  sourcePtyId?: string | null
  sourceCodexCommand?: string | null
  codexForkContext?: CodexForkContext
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
  worktreeId,
  groupId
}: ForkAgentSessionFromPaneArgs): PreparedAgentSessionFork | null {
  const paneKey = makePaneKey(tabId, pane.leafId)
  const state = useAppStore.getState()
  const paneStatus = state.agentStatusByPaneKey[paneKey]
  const sourceAgent = resolveTuiAgent(paneStatus?.agentType)
  const tabAgent = resolveTuiAgent(
    state.tabsByWorktree[worktreeId]?.find((tab) => tab.id === tabId)?.launchAgent
  )
  const agent = sourceAgent ?? tabAgent
  const sourcePtyId = state.terminalLayoutsByTabId?.[tabId]?.ptyIdsByLeafId?.[pane.leafId] ?? null
  const sourceCodexCommand = state.settings?.agentCmdOverrides?.codex ?? null
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

  const sourceWorktree = state.getKnownWorktreeById(worktreeId)
  const sourceRepo = state.repos.find((repo) => repo.id === sourceWorktree?.repoId)
  return {
    prompt,
    agent,
    worktreeId,
    groupId,
    newWorkspaceBlocked: getUsableForkBase(sourceWorktree, sourceRepo, worktreeId) === null,
    pane,
    providerSession: paneStatus?.providerSession ?? null,
    mode: 'recent-context',
    sourcePtyId,
    sourceCodexCommand
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

function hasForkLaunchContext(fork: PreparedAgentSessionFork): boolean {
  return fork.agent !== 'codex' || fork.codexForkContext?.status === 'available'
}

/** The transport that owns the source: its server, else where this app reaches it (local or SSH). */
function forkCreationHostId(
  state: Parameters<typeof resolveOwner>[0],
  worktreeId: string
): ExecutionHostId | undefined {
  const owner = resolveOwner(state, { workspaceId: worktreeId })
  if (owner.kind !== 'resolved') {
    return undefined
  }
  const { endpoint, at } = owner.owner
  return endpoint.kind === 'environment' ? toRuntimeExecutionHostId(endpoint.environmentId) : at
}

export async function startAgentSessionFork(
  fork: PreparedAgentSessionFork,
  destination: AgentSessionForkDestination = 'new-workspace'
): Promise<boolean> {
  const resumeAgentArgs = getForkResumeAgentArgs(fork)
  if (fork.mode === 'full-conversation' && (!resumeAgentArgs || !hasForkLaunchContext(fork))) {
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
  return destination === 'this-workspace'
    ? startForkInSourceWorkspace(fork, resumeAgentArgs)
    : startForkInNewWorkspace(fork, resumeAgentArgs)
}

async function startForkInSourceWorkspace(
  fork: PreparedAgentSessionFork,
  resumeAgentArgs: string | null
): Promise<boolean> {
  const store = useAppStore.getState()
  const sourceWorktree = store.getKnownWorktreeById(fork.worktreeId)
  // The floating workspace has no worktree row; any other missing row was removed since the dialog opened.
  if (!sourceWorktree && fork.worktreeId !== FLOATING_TERMINAL_WORKTREE_ID) {
    toast.error(
      translate(
        'auto.components.terminal.pane.terminal.agent.session.fork.f867385bb5',
        'Could not find the source workspace for this fork.'
      )
    )
    return false
  }
  return launchForkAgent(fork, resumeAgentArgs, {
    worktreeId: fork.worktreeId,
    worktreePath: sourceWorktree?.path,
    repo: store.repos.find((repo) => repo.id === sourceWorktree?.repoId),
    projectRuntime: getLocalProjectExecutionRuntimeContext(store, fork.worktreeId),
    ...(fork.groupId ? { groupId: fork.groupId } : {}),
    openedMessage: translate(
      'auto.components.terminal.pane.terminal.agent.session.fork.openedInNewTab',
      'Session fork opened in a new tab'
    )
  })
}

async function startForkInNewWorkspace(
  fork: PreparedAgentSessionFork,
  resumeAgentArgs: string | null
): Promise<boolean> {
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
      fork.agent ?? undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      // Why: a project two hosts publish refuses a host-less create; the fork belongs on its source's host.
      { executionHostId: forkCreationHostId(store, fork.worktreeId) }
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
  return launchForkAgent(fork, resumeAgentArgs, {
    worktreeId: forkWorktreeId,
    worktreePath: created.worktree.path,
    repo: sourceRepo,
    projectRuntime: sourceProjectRuntime,
    reveal: (providesInitialSurface) =>
      activateAndRevealWorktree(forkWorktreeId, {
        sidebarRevealBehavior: 'auto',
        ...(providesInitialSurface ? { providesInitialSurface: true } : {})
      }) !== false,
    openedMessage: translate(
      'auto.components.terminal.pane.terminal.agent.session.fork.88e34d00eb',
      'Top-level session fork opened in a new workspace'
    )
  })
}

export async function forkAgentSessionFromPane(args: ForkAgentSessionFromPaneArgs): Promise<void> {
  const fork = prepareAgentSessionForkFromPane(args)
  if (fork) {
    await startAgentSessionFork(fork)
  }
}
