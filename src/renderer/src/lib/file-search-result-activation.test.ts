import { describe, expect, it, vi } from 'vitest'
import { activateFileSearchResultOwner } from './file-search-result-activation'

const mocks = vi.hoisted(() => ({
  activateAndRevealWorkspace: vi.fn()
}))

vi.mock('./worktree-activation', () => ({
  activateAndRevealWorkspace: mocks.activateAndRevealWorkspace
}))

describe('activateFileSearchResultOwner', () => {
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
      sidebarRevealBehavior: 'auto',
      highlightInSidebar: true,
      executionHostId: 'ssh:build-box'
    })
  })

  it('keeps opening possible when the workspace disappeared after search', () => {
    mocks.activateAndRevealWorkspace.mockReturnValue(false)

    expect(
      activateFileSearchResultOwner({ worktreeId: 'deleted::/feature', runtimeEnvironmentId: null })
    ).toBe(false)
  })
})
