import { describe, expect, it } from 'vitest'
import {
  getSharedWorkspaceColorTag,
  isMixedWorkspaceColorTagSelection,
  normalizeWorkspaceColorTag,
  resolveWorkspaceColorTagSelection
} from './workspace-color-tag'

describe('workspace color tag', () => {
  it('normalizes hex input and rejects anything else', () => {
    expect(normalizeWorkspaceColorTag('#ABC')).toBe('#aabbcc')
    expect(normalizeWorkspaceColorTag(' ef4444 ')).toBe('#ef4444')
    expect(normalizeWorkspaceColorTag('red')).toBeNull()
    expect(normalizeWorkspaceColorTag(null)).toBeNull()
  })

  it('clears the tag when the chosen swatch is the one already carried', () => {
    expect(resolveWorkspaceColorTagSelection('#ef4444', '#ef4444')).toBeNull()
    // Same color, different spelling: still a toggle-off.
    expect(resolveWorkspaceColorTagSelection('#ef4444', '#EF4444')).toBeNull()
  })

  it('assigns the tag when the chosen swatch differs, and when there was none', () => {
    expect(resolveWorkspaceColorTagSelection('#ef4444', '#22c55e')).toBe('#22c55e')
    expect(resolveWorkspaceColorTagSelection(null, '#22c55e')).toBe('#22c55e')
  })

  it('clears the tag on the empty slot', () => {
    expect(resolveWorkspaceColorTagSelection('#ef4444', null)).toBeNull()
    expect(resolveWorkspaceColorTagSelection(null, null)).toBeNull()
  })

  it('reports the tag a uniform selection carries', () => {
    expect(getSharedWorkspaceColorTag(['#ef4444', '#ef4444'])).toBe('#ef4444')
    expect(getSharedWorkspaceColorTag([undefined, null])).toBeNull()
    expect(getSharedWorkspaceColorTag([])).toBeNull()
  })

  it('reports no shared tag for a mixed selection, so picking a color unifies it', () => {
    const mixed = ['#ef4444', '#22c55e']
    expect(getSharedWorkspaceColorTag(mixed)).toBeNull()
    expect(isMixedWorkspaceColorTagSelection(mixed)).toBe(true)
    // The consequence that matters: a mixed selection assigns rather than toggling off.
    expect(resolveWorkspaceColorTagSelection(getSharedWorkspaceColorTag(mixed), '#ef4444')).toBe(
      '#ef4444'
    )
  })

  it('does not call a uniform selection mixed', () => {
    expect(isMixedWorkspaceColorTagSelection(['#ef4444', '#EF4444'])).toBe(false)
    expect(isMixedWorkspaceColorTagSelection([null, undefined])).toBe(false)
  })
})
