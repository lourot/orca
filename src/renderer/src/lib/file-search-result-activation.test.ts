import { beforeEach, describe, expect, it, vi } from 'vitest'
import { activateFileSearchResultOwner } from './file-search-result-activation'

const mocks = vi.hoisted(() => ({
  activateAndRevealWorkspace: vi.fn(),
  revealWorktreeInSidebar: vi.fn()
}))

vi.mock('@/store', () => ({
  useAppStore: { getState: () => ({ revealWorktreeInSidebar: mocks.revealWorktreeInSidebar }) }
}))

vi.mock('./worktree-activation', () => ({
  activateAndRevealWorkspace: mocks.activateAndRevealWorkspace
}))

describe('activateFileSearchResultOwner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reveals the owning worktree as the editor destination', () => {
    mocks.activateAndRevealWorkspace.mockReturnValue({ primaryTabId: null })

    expect(
      activateFileSearchResultOwner({
        worktreeId: 'repo::/feature',
        runtimeEnvironmentId: null,
        executionHostId: 'ssh:build-box'
      })
    ).toBe(true)
    expect(mocks.activateAndRevealWorkspace).toHaveBeenCalledWith('repo::/feature', {
      providesInitialSurface: true,
      revealInSidebar: false,
      executionHostId: 'ssh:build-box'
    })
    expect(mocks.revealWorktreeInSidebar).toHaveBeenCalledWith('repo::/feature', {
      behavior: 'auto',
      highlight: true,
      executionHostId: 'ssh:build-box'
    })
  })

  it('keeps opening possible when the workspace disappeared after search', () => {
    mocks.activateAndRevealWorkspace.mockReturnValue(false)

    expect(
      activateFileSearchResultOwner({ worktreeId: 'deleted::/feature', runtimeEnvironmentId: null })
    ).toBe(false)
    expect(mocks.revealWorktreeInSidebar).not.toHaveBeenCalled()
  })
})
