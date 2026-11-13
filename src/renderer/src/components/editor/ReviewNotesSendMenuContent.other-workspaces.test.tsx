import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NotesSendAgentTarget } from '@/lib/notes-send-agent-targets'
import type {
  NotesSendOtherWorkspace,
  NotesSendSourceWorkspace
} from '@/lib/notes-send-other-workspaces'
import { ReviewNotesSendMenuContent } from './ReviewNotesSendMenuContent'

type ElementLike = { type: unknown; props: Record<string, unknown> }

const harness = vi.hoisted(() => ({
  sendMessageToAgent: vi.fn(),
  noteTargets: new Array<NotesSendAgentTarget>(),
  otherWorkspaces: new Array<NotesSendOtherWorkspace>()
}))

vi.mock('react', async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal()
  return {
    ...actual,
    useCallback: (callback: unknown) => callback,
    useMemo: (factory: () => unknown) => factory()
  }
})

vi.mock('@/store', () => {
  const state = { tabsByWorktree: {}, agentStatusEpoch: 0 }
  return {
    useAppStore: Object.assign((selector: (s: typeof state) => unknown) => selector(state), {
      getState: () => state
    })
  }
})
vi.mock('zustand/react/shallow', () => ({ useShallow: (selector: unknown) => selector }))
vi.mock('@/components/sidebar/worktree-card-status-inputs', () => ({
  selectLivePtyIdsForWorktree: () => ({})
}))
vi.mock('@/lib/agent-message-send', () => ({ sendMessageToAgent: harness.sendMessageToAgent }))
vi.mock('@/lib/active-agent-note-send', () => ({
  activeAgentNotesSendFailureMessage: (status: string) => status
}))
vi.mock('@/lib/notes-send-agent-targets', () => ({
  deriveNotesSendAgentTargets: () => harness.noteTargets
}))
vi.mock('@/lib/notes-send-other-workspaces', () => ({
  deriveNotesSendOtherWorkspaces: () => ({
    source: { displayName: 'Source', path: '/repo/source' },
    workspaces: harness.otherWorkspaces
  }),
  withSourceWorkspaceHeader: (prompt: string, source: NotesSendSourceWorkspace) =>
    `HEADER ${source.path}\n${prompt}`
}))
vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }))
vi.mock('@/hooks/use-now', () => ({ useNow: () => 0 }))
vi.mock('@/components/sidebar/useWorktreeAgentRows', () => ({ useWorktreeAgentRows: () => [] }))
vi.mock('@/components/AgentStateDot', () => ({
  AgentStateDot: () => null,
  agentStateLabel: (state: string) => state
}))
vi.mock('@/lib/agent-catalog', () => ({ AgentIcon: () => null }))
vi.mock('@/components/tab-bar/QuickLaunchButton', () => ({ QuickLaunchAgentMenuItems: () => null }))
vi.mock('@/lib/focus-terminal-tab-surface', () => ({ focusTerminalTabSurface: vi.fn() }))
vi.mock('@/components/ui/dropdown-menu', () => {
  const tag = (type: string) =>
    function Tag(props: Record<string, unknown>): ElementLike {
      return { type, props }
    }
  return {
    DropdownMenuItem: tag('DropdownMenuItem'),
    DropdownMenuLabel: tag('DropdownMenuLabel'),
    DropdownMenuSeparator: tag('DropdownMenuSeparator'),
    DropdownMenuSub: tag('DropdownMenuSub'),
    DropdownMenuSubTrigger: tag('DropdownMenuSubTrigger'),
    DropdownMenuSubContent: tag('DropdownMenuSubContent')
  }
})

function isElementLike(node: unknown): node is ElementLike {
  return typeof node === 'object' && node !== null && 'type' in node && 'props' in node
}

/** Renders function components inline so the tree holds only the mocked menu primitives. */
function expand(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(expand)
  }
  if (!isElementLike(node)) {
    return node
  }
  if (typeof node.type === 'function') {
    return expand(node.type(node.props))
  }
  return { type: node.type, props: { ...node.props, children: expand(node.props.children) } }
}

function findAll(node: unknown, type: string): ElementLike[] {
  if (Array.isArray(node)) {
    return node.flatMap((child) => findAll(child, type))
  }
  if (!isElementLike(node)) {
    return []
  }
  return [...(node.type === type ? [node] : []), ...findAll(node.props.children, type)]
}

function select(item: ElementLike | undefined): void {
  const onSelect = item?.props.onSelect
  if (typeof onSelect !== 'function') {
    throw new Error('menu item has no onSelect')
  }
  onSelect()
}

const OTHER_TARGET: NotesSendAgentTarget = {
  paneKey: 'tab-b:leaf-b',
  tabId: 'tab-b',
  messageTarget: { kind: 'terminal', tabId: 'tab-b', leafId: 'leaf-b' },
  agentType: 'codex',
  tabTitle: 'Codex',
  status: 'eligible'
}

function render(onPromptDelivered = vi.fn()): unknown {
  return expand(
    <ReviewNotesSendMenuContent
      worktreeId="wt-1"
      groupId="group-1"
      prompt="my notes"
      onPromptDelivered={onPromptDelivered}
    />
  )
}

describe('ReviewNotesSendMenuContent other workspaces', () => {
  beforeEach(() => {
    harness.sendMessageToAgent.mockReset()
    harness.sendMessageToAgent.mockResolvedValue({ status: 'sent' })
    // The target derivation answers every worktree, so the re-check on send finds the target live.
    harness.noteTargets = [OTHER_TARGET]
    harness.otherWorkspaces = []
  })

  it('sends to another workspace agent with its worktree id and a headed prompt, settling these notes', async () => {
    harness.otherWorkspaces = [
      { worktreeId: 'wt-2', displayName: 'Other', projectName: 'Repo', targets: [OTHER_TARGET] }
    ]
    const onPromptDelivered = vi.fn()

    const [submenu] = findAll(render(onPromptDelivered), 'DropdownMenuSubContent')
    select(findAll(submenu, 'DropdownMenuItem')[0])
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(harness.sendMessageToAgent).toHaveBeenCalledWith({
      worktreeId: 'wt-2',
      prompt: 'HEADER /repo/source\nmy notes',
      target: OTHER_TARGET.messageTarget
    })
    expect(onPromptDelivered).toHaveBeenCalledTimes(1)
  })

  it('sends to a same-workspace agent with the prompt unchanged', async () => {
    select(findAll(render(), 'DropdownMenuItem')[0])
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(harness.sendMessageToAgent).toHaveBeenCalledWith({
      worktreeId: 'wt-1',
      prompt: 'my notes',
      target: OTHER_TARGET.messageTarget
    })
  })

  it('hides the submenu when no other workspace has agents', () => {
    expect(findAll(render(), 'DropdownMenuSub')).toHaveLength(0)
  })
})
