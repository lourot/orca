import type { CSSProperties } from 'react'
import { useAppStore } from '../store'
import { selectKnownWorktreeById } from '../store/selectors'
import { normalizeWorkspaceColorTag } from '../../../shared/workspace-color-tag'

type WorkspaceChromeTintVariable = '--card' | '--bg-titlebar'
type WorkspaceChromeTintStyle = CSSProperties & Partial<Record<WorkspaceChromeTintVariable, string>>

/** Shade of a workspace color tag for app chrome (dark in dark theme, pastel in light), or
 *  undefined when untagged. Mixed against --background, never --card: the tab strip overrides
 *  --card with this value and a self-referencing custom property is invalid. */
export function getWorkspaceChromeTint(colorTag: string | null | undefined): string | undefined {
  const tag = normalizeWorkspaceColorTag(colorTag)
  return tag ? `color-mix(in srgb, ${tag} 20%, var(--background))` : undefined
}

/** Style setting `variable` to the workspace's chrome tint; subscribes to the tag only, not the
 *  whole row. Undefined when untagged, so the chrome keeps its default. */
export function useWorkspaceChromeTintStyle(
  worktreeId: string | null,
  variable: WorkspaceChromeTintVariable
): WorkspaceChromeTintStyle | undefined {
  const colorTag = useAppStore((s) => selectKnownWorktreeById(s, worktreeId)?.colorTag)
  const tint = getWorkspaceChromeTint(colorTag)
  return tint ? { [variable]: tint } : undefined
}
