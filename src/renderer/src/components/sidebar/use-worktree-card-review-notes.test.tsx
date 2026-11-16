// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import type { DiffComment } from '../../../../shared/diff-comment-types'
import { useWorktreeCardReviewNotes } from './use-worktree-card-review-notes'

const WORKTREE_ID = 'repo-1::/repo/worktrees/card'

function readCounts(
  diffComments: DiffComment[] | undefined,
  showComment: boolean,
  settings: Partial<GlobalSettings> = {}
): { hover: number; meta: number } {
  let counts = { hover: -1, meta: -1 }
  function Probe(): null {
    const notes = useWorktreeCardReviewNotes(
      { id: WORKTREE_ID, diffComments },
      settings as GlobalSettings,
      showComment
    )
    counts = { hover: notes.hoverUnsentReviewNoteCount, meta: notes.metaUnsentReviewNoteCount }
    return null
  }
  const root = createRoot(document.createElement('div'))
  act(() => root.render(<Probe />))
  act(() => root.unmount())
  return counts
}

describe('useWorktreeCardReviewNotes', () => {
  it('counts only unsent review notes and gates the card badge on the Notes property', () => {
    const note = (id: string, sentAt?: number): DiffComment => ({
      id,
      worktreeId: WORKTREE_ID,
      filePath: 'src/a.ts',
      lineNumber: 1,
      body: 'fix',
      createdAt: 1,
      side: 'modified',
      ...(sentAt === undefined ? {} : { sentAt })
    })
    const twoUnsentOneSent = [note('a'), note('b'), note('c', 5)]
    expect({
      twoUnsentOneSentShown: readCounts(twoUnsentOneSent, true),
      twoUnsentOneSentHidden: readCounts(twoUnsentOneSent, false),
      allSent: readCounts([note('a', 5)], true),
      markdownNoteWhileMarkdownNotesOff: readCounts(
        [{ ...note('a'), source: 'markdown' as const }],
        true,
        { markdownReviewToolsEnabled: false }
      ),
      noNotes: readCounts(undefined, true)
    }).toEqual({
      twoUnsentOneSentShown: { hover: 2, meta: 2 },
      twoUnsentOneSentHidden: { hover: 2, meta: 0 },
      allSent: { hover: 0, meta: 0 },
      markdownNoteWhileMarkdownNotesOff: { hover: 0, meta: 0 },
      noNotes: { hover: 0, meta: 0 }
    })
  })
})
