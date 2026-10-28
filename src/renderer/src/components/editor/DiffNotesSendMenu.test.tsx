import { describe, expect, it, vi } from 'vitest'
import type { DiffComment, GeneralNote } from '../../../../shared/diff-comment-types'
import { DiffNotesSendMenu } from './DiffNotesSendMenu'
import type { NotesSendMenuScope } from './NotesSendMenu'

vi.mock('react', async () => {
  const actual = await vi.importActual<object>('react')
  return {
    ...actual,
    useCallback: <T,>(callback: T): T => callback,
    useMemo: <T,>(factory: () => T): T => factory()
  }
})

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      clearDeliveredDiffComments: vi.fn(),
      diffNotesSendMenuOpenRequest: null,
      consumeDiffNotesSendMenuOpenRequest: vi.fn()
    })
}))

const fileNote: DiffComment = {
  id: 'c-1',
  worktreeId: 'wt-1',
  filePath: 'src/a.ts',
  lineNumber: 1,
  body: 'rename',
  createdAt: 1,
  side: 'modified'
}
const general: GeneralNote = { id: 'g-1', worktreeId: 'wt-1', body: 'bump sdk', createdAt: 1 }

function hasScopes(props: unknown): props is { scopes: NotesSendMenuScope<{ id: string }>[] } {
  return typeof props === 'object' && props !== null && 'scopes' in props
}

function allScopeNoteIds(props: Partial<Parameters<typeof DiffNotesSendMenu>[0]>): string[] {
  const element = DiffNotesSendMenu({
    worktreeId: 'wt-1',
    groupId: 'wt-1',
    comments: [fileNote],
    ...props
  })
  if (!hasScopes(element.props)) {
    throw new Error('DiffNotesSendMenu no longer renders NotesSendMenu')
  }
  const { scopes } = element.props
  return scopes.find((scope) => scope.id === 'all')?.notes.map((note) => note.id) ?? []
}

describe('DiffNotesSendMenu', () => {
  // Why: delivery deletes what it sends, so a surface that never lists general notes must not send them.
  it('sends general notes only from a surface that passes them in', () => {
    expect([allScopeNoteIds({}), allScopeNoteIds({ generalNotes: [general] })]).toEqual([
      ['c-1'],
      ['g-1', 'c-1']
    ])
  })
})
