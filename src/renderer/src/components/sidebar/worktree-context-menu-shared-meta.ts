import { useMemo } from 'react'
import type { Worktree } from '../../../../shared/worktree/types'
import {
  countWorkspaceColorTagUsage,
  getSharedWorkspaceColorTag,
  isMixedWorkspaceColorTagSelection
} from '../../../../shared/workspace-color-tag'

/** The swatch row's state: the tag the selection shares, and whether its members disagree. */
export function getSharedContextColorTag(worktrees: readonly Worktree[]): {
  colorTag: string | null
  mixed: boolean
} {
  const colorTags = worktrees.map((worktree) => worktree.colorTag)
  return {
    colorTag: getSharedWorkspaceColorTag(colorTags),
    mixed: isMixedWorkspaceColorTagSelection(colorTags)
  }
}

const EMPTY_COLOR_TAG_USAGE: ReadonlyMap<string, number> = new Map()

/** The swatch row's state plus how often each tag is used across all workspaces. */
export function useContextColorTag(
  contextWorktrees: readonly Worktree[],
  allWorktrees: readonly Worktree[],
  menuOpen: boolean
): ReturnType<typeof getSharedContextColorTag> & { colorTagUsage: ReadonlyMap<string, number> } {
  // Why: every sidebar card mounts this model, so only the open menu pays for the scan.
  const colorTagUsage = useMemo(
    () => (menuOpen ? countWorkspaceColorTagUsage(allWorktrees) : EMPTY_COLOR_TAG_USAGE),
    [allWorktrees, menuOpen]
  )
  return { ...getSharedContextColorTag(contextWorktrees), colorTagUsage }
}
