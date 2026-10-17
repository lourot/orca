// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CLIPBOARD_TEXT_WRITE_TOO_LARGE_ERROR } from '../../../../../../shared/clipboard-text'
import type { DiffComment } from '../../../../../../shared/diff-comment-types'

const mocks = vi.hoisted(() => {
  const storeState: Record<string, unknown> = {}
  return {
    toastError: vi.fn<(title: string, options: { description?: string }) => void>(),
    writeClipboardText: vi.fn(),
    storeState
  }
})

vi.mock('sonner', () => ({ toast: { error: mocks.toastError, message: vi.fn() } }))
vi.mock('@/store', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) => selector(mocks.storeState)
}))
vi.mock('@/store/worktree-diff-comments-selector', () => ({
  selectWorktreeDiffCommentsOrEmpty: () => [
    {
      id: 'c1',
      worktreeId: 'wt-1',
      filePath: 'src/app.ts',
      lineNumber: 1,
      body: 'rename this',
      createdAt: 1,
      side: 'modified'
    } satisfies DiffComment
  ]
}))

import { useSourceControlDiffCommentNotes } from './use-diff-comment-notes'

function renderNotes() {
  return renderHook(() =>
    useSourceControlDiffCommentNotes({
      activeWorktreeId: 'wt-1',
      clearDiffComments: async () => true,
      clearDiffCommentsForFile: async () => true
    })
  )
}

describe('diff-comment notes copy failures', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(window, { api: { ui: { writeClipboardText: mocks.writeClipboardText } } })
  })

  function readErrorToast(): [string, { description?: string }] {
    expect(mocks.toastError).toHaveBeenCalledTimes(1)
    const firstCall = mocks.toastError.mock.calls[0]
    if (!firstCall) {
      throw new Error('Expected an error toast')
    }
    return firstCall
  }

  it('never shows "Copied" for a clipboard write that rejected', async () => {
    mocks.writeClipboardText.mockRejectedValue(
      new Error(
        "Error invoking remote method 'ui:writeClipboardText': Error: NSPasteboard failed at /Users/someone/Library/Caches/orca"
      )
    )
    const { result } = renderNotes()

    await act(async () => {
      await result.current.handleCopyDiffComments()
    })

    expect(result.current.diffCommentsCopied).toBe(false)
    const [title, options] = readErrorToast()
    expect(title).toBe('Failed to copy notes')
    // An unrecognized native failure must not reach the toast (CWE-209).
    expect(options.description).toBeUndefined()
  })

  it('describes only the recognized size failure', async () => {
    mocks.writeClipboardText.mockRejectedValue(
      new Error(
        `Error invoking remote method 'ui:writeClipboardText': Error: ${CLIPBOARD_TEXT_WRITE_TOO_LARGE_ERROR}`
      )
    )
    const { result } = renderNotes()

    await act(async () => {
      await result.current.handleCopyDiffComments()
    })

    expect(result.current.diffCommentsCopied).toBe(false)
    expect(readErrorToast()[1].description).toBe('The text is too large to copy.')
  })

  it('stays silent when the write resolves', async () => {
    mocks.writeClipboardText.mockResolvedValue(undefined)
    const { result } = renderNotes()

    await act(async () => {
      await result.current.handleCopyDiffComments()
    })

    expect(result.current.diffCommentsCopied).toBe(true)
    expect(mocks.toastError).not.toHaveBeenCalled()
  })
})

describe('diff-comment notes shelf reveal request', () => {
  it('expands the shelf only for a fresh request on the active worktree', () => {
    const cases = {
      freshActive: { worktreeId: 'wt-1', ageMs: 0 },
      staleActive: { worktreeId: 'wt-1', ageMs: 10_000 },
      otherWorktree: { worktreeId: 'wt-2', ageMs: 0 }
    }
    const results: Record<string, unknown> = {}
    for (const [name, { worktreeId, ageMs }] of Object.entries(cases)) {
      const consume = vi.fn()
      mocks.storeState = {
        diffNotesShelfRevealRequest: { worktreeId, issuedAt: Date.now() - ageMs },
        consumeDiffNotesShelfRevealRequest: consume
      }
      const { result, unmount } = renderNotes()
      results[name] = {
        expanded: result.current.diffCommentsExpanded,
        consumedFor: consume.mock.calls.map(([id]) => id)
      }
      unmount()
    }
    mocks.storeState = {}

    expect(results).toEqual({
      freshActive: { expanded: true, consumedFor: ['wt-1'] },
      staleActive: { expanded: false, consumedFor: ['wt-1'] },
      otherWorktree: { expanded: false, consumedFor: [] }
    })
  })
})
