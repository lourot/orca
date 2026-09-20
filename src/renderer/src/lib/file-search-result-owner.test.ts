import { describe, expect, it } from 'vitest'
import { createFileSearchResultOwner } from './file-search-result-owner'

describe('createFileSearchResultOwner', () => {
  it('captures the exact runtime used by the completed search', () => {
    const owner = createFileSearchResultOwner('worktree-a', ' runtime-owner-a ')

    expect(owner).toEqual({
      worktreeId: 'worktree-a',
      runtimeEnvironmentId: 'runtime-owner-a'
    })
  })

  it('preserves the execution host used by the completed search', () => {
    expect(
      createFileSearchResultOwner(
        'worktree-a',
        { activeRuntimeEnvironmentId: null },
        'ssh:build-box'
      )
    ).toEqual({
      worktreeId: 'worktree-a',
      runtimeEnvironmentId: null,
      executionHostId: 'ssh:build-box'
    })
  })

  it.each([null, '', '   '])('records %j as an explicit non-runtime owner', (environmentId) => {
    expect(createFileSearchResultOwner('local-or-ssh-worktree', environmentId)).toEqual({
      worktreeId: 'local-or-ssh-worktree',
      runtimeEnvironmentId: null
    })
  })
})
