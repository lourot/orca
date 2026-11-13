import { describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../../shared/repo-types'
import { makeWorktree, TEST_REPO } from '@/store/slices/worktrees-slice-test-fixtures'
import type { NotesSendAgentTarget } from './notes-send-agent-targets'
import {
  deriveNotesSendOtherWorkspaces,
  withSourceWorkspaceHeader,
  type NotesSendOtherWorkspacesState
} from './notes-send-other-workspaces'

const targetsByWorktreeId = vi.hoisted(() => new Map<string, NotesSendAgentTarget[]>())

vi.mock('./notes-send-agent-targets', () => ({
  deriveNotesSendAgentTargets: (_state: unknown, worktreeId: string) =>
    targetsByWorktreeId.get(worktreeId) ?? []
}))

const SSH_REPO: Repo = {
  ...TEST_REPO,
  id: 'repo-ssh',
  displayName: 'Remote',
  connectionId: 'ssh-1'
}
const SOURCE = 'repo1::/repo1/source'

function target(paneKey: string): NotesSendAgentTarget {
  return {
    paneKey,
    tabId: `tab-${paneKey}`,
    messageTarget: { kind: 'terminal', tabId: `tab-${paneKey}`, leafId: paneKey },
    agentType: 'claude',
    tabTitle: '',
    status: 'eligible'
  }
}

function state(): NotesSendOtherWorkspacesState {
  const worktree = (repoId: string, name: string, extra: { isArchived?: boolean } = {}) =>
    makeWorktree({
      id: `${repoId}::/${repoId}/${name}`,
      repoId,
      displayName: name,
      path: `/${repoId}/${name}`,
      ...extra
    })
  return {
    repos: [TEST_REPO, SSH_REPO],
    worktreesByRepo: {
      repo1: [
        worktree('repo1', 'source'),
        worktree('repo1', 'zeta'),
        worktree('repo1', 'alpha'),
        worktree('repo1', 'no-agents'),
        worktree('repo1', 'archived', { isArchived: true })
      ],
      'repo-ssh': [worktree('repo-ssh', 'remote')]
    },
    agentStatusByPaneKey: {},
    tabsByWorktree: {},
    unifiedTabsByWorktree: {},
    terminalLayoutsByTabId: {},
    ptyIdsByTabId: {},
    runtimePaneTitlesByTabId: {}
  }
}

describe('deriveNotesSendOtherWorkspaces', () => {
  it('offers same-host workspaces with agents, sorted, and never the source, an archived or another-host one', () => {
    targetsByWorktreeId.clear()
    for (const id of [
      SOURCE,
      'repo1::/repo1/zeta',
      'repo1::/repo1/alpha',
      'repo1::/repo1/archived',
      'repo-ssh::/repo-ssh/remote'
    ]) {
      targetsByWorktreeId.set(id, [target(id)])
    }

    const result = deriveNotesSendOtherWorkspaces(state(), SOURCE)

    expect({
      source: result.source,
      workspaces: result.workspaces.map((w) => [w.worktreeId, w.projectName, w.targets.length])
    }).toEqual({
      source: { displayName: 'source', path: '/repo1/source' },
      workspaces: [
        ['repo1::/repo1/alpha', 'Repo 1', 1],
        ['repo1::/repo1/zeta', 'Repo 1', 1]
      ]
    })
  })

  it('offers only the remote host workspaces when the source is remote', () => {
    targetsByWorktreeId.clear()
    targetsByWorktreeId.set('repo1::/repo1/alpha', [target('local')])
    const s = state()
    s.worktreesByRepo['repo-ssh'] = [
      ...s.worktreesByRepo['repo-ssh'],
      makeWorktree({ id: 'repo-ssh::/repo-ssh/peer', repoId: 'repo-ssh', displayName: 'peer' })
    ]
    targetsByWorktreeId.set('repo-ssh::/repo-ssh/peer', [target('peer')])

    const ids = deriveNotesSendOtherWorkspaces(s, 'repo-ssh::/repo-ssh/remote').workspaces.map(
      (w) => w.worktreeId
    )

    expect(ids).toEqual(['repo-ssh::/repo-ssh/peer'])
  })

  it('offers nothing when the source workspace is unknown', () => {
    targetsByWorktreeId.clear()
    targetsByWorktreeId.set('repo1::/repo1/alpha', [target('a')])

    expect(deriveNotesSendOtherWorkspaces(state(), 'repo1::/repo1/gone')).toEqual({
      source: null,
      workspaces: []
    })
  })
})

describe('withSourceWorkspaceHeader', () => {
  it('names the source workspace and path, then keeps the prompt unchanged', () => {
    const prompt = 'File: src/a.ts\nLine: 3\nUser comment: "fix"'

    const headed = withSourceWorkspaceHeader(prompt, {
      displayName: 'source',
      path: '/repo1/source'
    })

    expect(headed.split('\n\n')[0]).toContain('"source" at /repo1/source')
    expect(headed.endsWith(`\n\n${prompt}`)).toBe(true)
  })
})
