import { describe, expect, it } from 'vitest'

import { getWorkspaceChromeTint } from './workspace-chrome-tint'

describe('getWorkspaceChromeTint', () => {
  it('returns undefined for untagged or invalid tags so chrome stays at its default', () => {
    expect([null, undefined, '', 'red', '#ef44'].map(getWorkspaceChromeTint)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined
    ])
  })

  it('mixes the normalized tag against --background, never --card which the tab strip overrides with it', () => {
    const tint = getWorkspaceChromeTint('#EF4444')
    expect(tint).toMatch(/^color-mix\(in srgb, #ef4444 \d+%, var\(--background\)\)$/)
    expect(tint).not.toContain('--card')
  })
})
