import { describe, expect, it } from 'vitest'
import { buildGroupedSearchRows } from './search-rows'

describe('buildGroupedSearchRows', () => {
  it('keeps worktree headers and owner metadata in result rows', () => {
    const rows = buildGroupedSearchRows(
      [
        {
          id: 'worktree:feature',
          label: 'feature',
          detail: 'Local',
          owner: { worktreeId: 'repo::/feature', runtimeEnvironmentId: null },
          result: {
            totalMatches: 1,
            truncated: false,
            files: [
              {
                filePath: '/feature/src/a.ts',
                relativePath: 'src/a.ts',
                matches: [{ line: 3, column: 1, matchLength: 3, lineContent: 'foo' }]
              }
            ]
          }
        }
      ],
      new Set()
    )

    expect(rows.map((row) => row.type)).toEqual(['scope', 'file', 'match'])
    expect(rows[1]).toMatchObject({
      type: 'file',
      collapseKey: 'worktree:feature:/feature/src/a.ts',
      owner: { worktreeId: 'repo::/feature' }
    })
    expect(rows[2]).toMatchObject({
      type: 'match',
      owner: { worktreeId: 'repo::/feature' }
    })
  })
})
