import { getRepoExecutionHostId, type ExecutionHostId } from './execution-host'

type RepoDisplayLabelItem = {
  path: string
  displayName: string
  connectionId?: string | null
  executionHostId?: ExecutionHostId | null
}

// Scope labels by execution host: same-path local/SSH/runtime repos must not overwrite one another’s labels.
export function getRepoDisplayLabelKey(
  item: Pick<RepoDisplayLabelItem, 'path' | 'connectionId' | 'executionHostId'>
): string {
  return `${getRepoExecutionHostId(item)}::${item.path}`
}

function normalizePathSegments(path: string): string[] {
  return path.replace(/\\/g, '/').replace(/\/+$/g, '').split('/').filter(Boolean)
}

function labelForDepth(item: RepoDisplayLabelItem, depth: number): string {
  const segments = normalizePathSegments(item.path)
  const suffix = segments.slice(Math.max(0, segments.length - depth))
  if (suffix.length === 0) {
    return item.displayName
  }
  suffix[suffix.length - 1] = item.displayName
  return suffix.join('/')
}

function hasDuplicateLabels(labels: readonly string[]): boolean {
  return new Set(labels).size !== labels.length
}

/**
 * Maps each repo to the label its header should render, expanding path segments until
 * same-named repos are distinguishable.
 *
 * `minDepth` raises the floor: at 2 every label is parent-qualified (`acme/orca`) whether or
 * not anything collides. The sidebar passes 2 so `'name'` ordering can sort the string the
 * header actually renders; the default of 1 keeps bare names for the Cmd-J repository filter
 * chips and the nested-repo import checklist.
 */
export function getRepoDisplayLabelsByPath(
  items: readonly RepoDisplayLabelItem[],
  options?: { minDepth?: number }
): Map<string, string> {
  const minDepth = Math.max(1, options?.minDepth ?? 1)
  const labels = new Map<string, string>()
  const itemsByHostAndName = new Map<string, RepoDisplayLabelItem[]>()

  for (const item of items) {
    const named = { ...item, displayName: item.displayName || item.path }
    labels.set(getRepoDisplayLabelKey(item), labelForDepth(named, minDepth))
    // Host labels already distinguish projects on different machines.
    const collisionKey = JSON.stringify([getRepoExecutionHostId(item), named.displayName])
    const colliding = itemsByHostAndName.get(collisionKey) ?? []
    colliding.push(named)
    itemsByHostAndName.set(collisionKey, colliding)
  }

  for (const collidingItems of itemsByHostAndName.values()) {
    if (collidingItems.length < 2) {
      continue
    }
    const maxDepth = Math.max(
      ...collidingItems.map((item) => normalizePathSegments(item.path).length)
    )
    // Start at minDepth so genuinely duplicate parent/name pairs still expand further.
    let depth = minDepth
    let nextLabels = collidingItems.map((item) => labelForDepth(item, depth))
    while (depth < maxDepth && hasDuplicateLabels(nextLabels)) {
      depth += 1
      nextLabels = collidingItems.map((item) => labelForDepth(item, depth))
    }
    collidingItems.forEach((item, index) => {
      labels.set(getRepoDisplayLabelKey(item), nextLabels[index] ?? item.displayName)
    })
  }

  return labels
}
