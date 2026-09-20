import { normalizeHexColor } from './hex-color'

export const REPO_COLORS = [
  '#737373', // neutral
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  // purple, pink, white, dark blue, brown
  ...(['#8b5cf6', '#ec4899', '#ffffff', '#1e3a8a', '#92400e'] as const)
] as const

export const DEFAULT_REPO_BADGE_COLOR = REPO_COLORS[0]

export function normalizeRepoBadgeColor(value: unknown): string | null {
  return normalizeHexColor(value)
}

export function resolveRepoBadgeColor(value: unknown): string {
  return normalizeRepoBadgeColor(value) ?? DEFAULT_REPO_BADGE_COLOR
}
