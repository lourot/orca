import { REPO_COLORS } from './constants'
import { normalizeHexColor } from './hex-color'

/** Assignable swatches, sharing the repo palette so one color language runs across the app. */
export const WORKSPACE_COLOR_TAG_SWATCHES: readonly string[] = REPO_COLORS

/** Null means "no tag". Any value that is not a hex color clears it. */
export function normalizeWorkspaceColorTag(value: unknown): string | null {
  return normalizeHexColor(value)
}

/** Picking the tag a workspace already carries removes it, so one swatch both sets and clears. */
export function resolveWorkspaceColorTagSelection(
  current: string | null,
  chosen: string | null
): string | null {
  const normalizedChosen = normalizeWorkspaceColorTag(chosen)
  return normalizedChosen !== null && normalizedChosen === normalizeWorkspaceColorTag(current)
    ? null
    : normalizedChosen
}

/** The tag a whole selection carries, or null when it is mixed or untagged. Toggle-off must key
 *  off the selection as a whole: keying off the right-clicked workspace alone would clear a mixed
 *  selection when the user meant to unify it. */
export function getSharedWorkspaceColorTag(
  colorTags: readonly (string | null | undefined)[]
): string | null {
  if (colorTags.length === 0) {
    return null
  }
  const first = normalizeWorkspaceColorTag(colorTags[0])
  return colorTags.every((tag) => normalizeWorkspaceColorTag(tag) === first) ? first : null
}

/** True when the selection carries more than one distinct tag state. A mixed selection is not
 *  "untagged" - no swatch should read as checked - but getSharedWorkspaceColorTag must still
 *  return null for it so picking a color unifies rather than toggles off. */
export function isMixedWorkspaceColorTagSelection(
  colorTags: readonly (string | null | undefined)[]
): boolean {
  return new Set(colorTags.map((tag) => normalizeWorkspaceColorTag(tag))).size > 1
}
