import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { submitReviewNote } from './review-note-submit'

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

describe('submitReviewNote', () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockClear()
  })

  it('surfaces persistence failures while keeping the draft open', async () => {
    const addDiffComment = vi.fn().mockResolvedValue(null)

    const result = await submitReviewNote({
      addDiffComment,
      body: 'Needs revision',
      filePath: 'src/example.ts',
      modifiedContent: 'after',
      target: { lineNumber: 4 },
      worktreeId: 'worktree-1'
    })

    expect(result).toBe(false)
    expect(toast.error).toHaveBeenCalledWith('Failed to save comment')
  })
})
