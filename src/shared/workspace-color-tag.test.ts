import { describe, expect, it } from 'vitest'
import {
  countWorkspaceColorTagUsage,
  getSharedWorkspaceColorTag,
  isMixedWorkspaceColorTagSelection,
  normalizeWorkspaceColorTag,
  resolveWorkspaceColorTagSelection,
  WORKSPACE_COLOR_TAG_SWATCHES
} from './workspace-color-tag'

describe('workspace color tag', () => {
  it('includes white, dark blue, and brown swatches', () => {
    expect(WORKSPACE_COLOR_TAG_SWATCHES).toEqual(
      expect.arrayContaining(['#ffffff', '#1e3a8a', '#92400e'])
    )
  })

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

  it('counts each tag across projects, skipping archived and untagged workspaces', () => {
    const worktrees = [
      { id: 'repo-a::/a1', colorTag: '#ef4444', isArchived: false },
      { id: 'repo-b::/b1', colorTag: '#EF4444', isArchived: false },
      { id: 'repo-b::/b2', colorTag: '#22c55e', isArchived: false },
      { id: 'repo-b::/b3', colorTag: '#22c55e', isArchived: true },
      { id: 'repo-a::/a2', colorTag: null, isArchived: false },
      { id: 'repo-a::/a3', isArchived: false },
      { id: 'repo-a::/a4', colorTag: '#8b5cf6', isArchived: false }
    ]
    expect(countWorkspaceColorTagUsage(worktrees)).toEqual(
      new Map([
        ['#ef4444', 2],
        ['#22c55e', 1],
        ['#8b5cf6', 1]
      ])
    )
  })
})
