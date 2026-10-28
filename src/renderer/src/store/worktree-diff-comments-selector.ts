import type { DiffComment, GeneralNote } from '../../../shared/diff-comment-types'
import { toRuntimeExecutionHostId, type ExecutionHostId } from '../../../shared/execution-host'
import type { Worktree } from '../../../shared/worktree/types'
import type { AppState } from './types'
import { getIndexedWorktreeById } from './worktree-repo-index'
import { findFolderWorkspaceOwner } from '@/lib/folder-workspace-runtime-owner'
import { namedHostForOwnerRef } from '@/lib/resolve-owner'
import { findIndexedWorktreeOwnerForHost } from '@/lib/worktree-runtime-owner-index'
import { getRepoIdFromWorktreeId } from '../../../shared/worktree/id'
import { parseWorkspaceKey } from '../../../shared/workspace-scope'
import { selectWorktreesByRepo } from './workspace-record-selectors'

const EMPTY_DIFF_COMMENTS = Object.freeze([]) as unknown as DiffComment[]
const EMPTY_GENERAL_NOTES: readonly GeneralNote[] = Object.freeze([])

/** The workspace record fields holding a note list; worktree rows and folder workspaces both have them. */
export type ReviewNoteField = 'diffComments' | 'generalNotes'
type ReviewNoteHolder = Partial<Pick<Worktree, ReviewNoteField>> | null | undefined

/** One per-workspace note list. Both kinds share this module's twin and queue rules. */
export type ReviewNoteKind<T> = {
  field: ReviewNoteField
  read: (holder: ReviewNoteHolder) => T[] | undefined
}

export const DIFF_COMMENT_KIND: ReviewNoteKind<DiffComment> = {
  field: 'diffComments',
  read: (holder) => holder?.diffComments
}

export const GENERAL_NOTE_KIND: ReviewNoteKind<GeneralNote> = {
  field: 'generalNotes',
  read: (holder) => holder?.generalNotes
}

function rowHoldsNotes(row: Worktree, ids: ReadonlySet<string> | undefined): boolean {
  return Boolean(
    ids?.size &&
    (row.diffComments?.some((c) => ids.has(c.id)) || row.generalNotes?.some((n) => ids.has(n.id)))
  )
}

type DiffCommentSelectorState = Pick<AppState, 'worktreesByRepo'> &
  Partial<
    Pick<
      AppState,
      | 'activeWorkspaceExecutionHostId'
      | 'activeWorktreeId'
      | 'folderWorkspaces'
      | 'projectGroups'
      | 'restoredRuntimeHostIdByWorkspaceSessionKey'
      | 'runtimeEnvironments'
      | 'settings'
    >
  >

/** One twin of a worktree id, as the owner index tells rows apart: its host and its paired server. */
export type DiffCommentTwin = { hostId?: ExecutionHostId; runtimeOwnerEnvironmentId?: string }

function twinOf(row: Pick<Worktree, 'hostId' | 'runtimeOwnerEnvironmentId'>): DiffCommentTwin {
  const runtimeOwnerEnvironmentId = row.runtimeOwnerEnvironmentId?.trim()
  return {
    ...(row.hostId ? { hostId: row.hostId } : {}),
    ...(runtimeOwnerEnvironmentId ? { runtimeOwnerEnvironmentId } : {})
  }
}

function isTwin(row: Worktree, twin: DiffCommentTwin): boolean {
  const own = twinOf(row)
  return (
    own.hostId === twin.hostId && own.runtimeOwnerEnvironmentId === twin.runtimeOwnerEnvironmentId
  )
}

/** The rows' identity (`twin`) and, whenever they name one, the host the write names. */
export type DiffCommentRows = {
  twin?: DiffCommentTwin
  hostId?: ExecutionHostId
  worktrees: readonly Worktree[]
}

/**
 * The host a twin's write names: a paired server's row goes through that server (rival servers
 * may proxy the same SSH target), else the row's own stamp.
 */
export function diffCommentTwinHostId(twin: DiffCommentTwin): ExecutionHostId | undefined {
  return twin.runtimeOwnerEnvironmentId
    ? toRuntimeExecutionHostId(twin.runtimeOwnerEnvironmentId)
    : twin.hostId
}

/** Rollback bookkeeping key: one per twin, so a twin's floor never restores another copy. */
export function diffCommentFloorKey(worktreeId: string, twin: DiffCommentTwin | undefined): string {
  return twin
    ? `${JSON.stringify([twin.hostId ?? null, twin.runtimeOwnerEnvironmentId ?? null])}\0${worktreeId}`
    : worktreeId
}

/** With host twins, pick captured write identity, then uniquely held note UUIDs, then selected host; never guess. Single-host duplicate rows still represent one workspace. */
export function findDiffCommentRows(
  state: Pick<
    DiffCommentSelectorState,
    'worktreesByRepo' | 'activeWorktreeId' | 'activeWorkspaceExecutionHostId'
  >,
  worktreeId: string,
  hint: { twin?: DiffCommentTwin; hostId?: ExecutionHostId; commentIds?: ReadonlySet<string> } = {}
): DiffCommentRows | null {
  const rows = (selectWorktreesByRepo(state)[getRepoIdFromWorktreeId(worktreeId)] ?? []).filter(
    (row) => row.id === worktreeId
  )
  const { twin: captured, commentIds } = hint
  if (captured) {
    const exact = rows.filter((row) => isTwin(row, captured))
    // Listings may add the write’s host stamp; hostless writes can follow a newly stamped row only if all copies agree.
    const sole = rows.length > 0 && rows.every((row) => isTwin(row, twinOf(rows[0])))
    const stamped =
      exact.length > 0 || captured.hostId
        ? []
        : hint.hostId
          ? rows.filter((row) => isTwin(row, { ...captured, hostId: hint.hostId }))
          : sole && twinOf(rows[0]).runtimeOwnerEnvironmentId === captured.runtimeOwnerEnvironmentId
            ? rows
            : []
    const worktrees = exact.length > 0 ? exact : stamped
    return worktrees.length > 0 ? { twin: captured, worktrees } : null
  }
  if (rows.length === 0) {
    return null
  }
  const pickTwin = (row: Worktree | undefined, named?: ExecutionHostId): DiffCommentRows | null => {
    if (!row) {
      return null
    }
    const twin = twinOf(row)
    // Selection attributes unstamped rows; notes alone cannot. Hostless writes would follow the currently open workspace.
    const hostId = diffCommentTwinHostId(twin) ?? named
    return hostId
      ? { twin, hostId, worktrees: rows.filter((candidate) => isTwin(candidate, twin)) }
      : null
  }
  if (rows.every((row) => isTwin(row, twinOf(rows[0])))) {
    // Main refuses hostless writes amid twins; capture identity too so queued saves cannot switch to newly listed copies.
    const twin = twinOf(rows[0])
    const hostId = diffCommentTwinHostId(twin)
    // A differently stamped row is not the selected host’s unlisted copy; named notes still identify it, while unstamped provenance remains unknown.
    const named = namedHostForOwnerRef(state, { workspaceId: worktreeId })
    const holdsNamedNotes = rows.some((row) => rowHoldsNotes(row, commentIds))
    const owner = named
      ? findIndexedWorktreeOwnerForHost(selectWorktreesByRepo(state), worktreeId, named)
      : null
    if (named && twin.hostId && !holdsNamedNotes && !rows.some((row) => row === owner)) {
      return null
    }
    return { twin, ...(hostId ? { hostId } : {}), worktrees: rows }
  }
  const holders = rows.filter((row) => rowHoldsNotes(row, commentIds))
  if (holders.length > 0 && holders.every((row) => isTwin(row, twinOf(holders[0])))) {
    return pickTwin(holders[0])
  }
  const named = namedHostForOwnerRef(state, { workspaceId: worktreeId })
  const owner = named
    ? findIndexedWorktreeOwnerForHost(selectWorktreesByRepo(state), worktreeId, named)
    : null
  return pickTwin(
    rows.find((row) => row === owner),
    named ?? undefined
  )
}

/** The notes of those rows; the last duplicate wins, as in the id index the rest of the app reads. */
export function diffCommentRowNotes<T>(
  found: { worktrees: readonly Worktree[] },
  kind: ReviewNoteKind<T>
): T[] | undefined {
  return kind.read(found.worktrees.at(-1))
}

/** Queued saves follow rows holding the chain’s last list despite new host stamps; after external replacement, resolve the captured twin (or bare ID when never twinned) again. */
export function readQueuedDiffComments<T>(
  state: Pick<
    DiffCommentSelectorState,
    'worktreesByRepo' | 'activeWorktreeId' | 'activeWorkspaceExecutionHostId'
  >,
  worktreeId: string,
  kind: ReviewNoteKind<T>,
  chain: { twin?: DiffCommentTwin; hostId?: ExecutionHostId; latest: unknown }
): { list: T[] | undefined } | null {
  const rows = selectWorktreesByRepo(state)[getRepoIdFromWorktreeId(worktreeId)] ?? []
  const holder = chain.latest
    ? rows.find((row) => row.id === worktreeId && kind.read(row) === chain.latest)
    : undefined
  if (holder) {
    return { list: kind.read(holder) }
  }
  const found = findDiffCommentRows(
    state,
    worktreeId,
    chain.twin ? { twin: chain.twin, hostId: chain.hostId } : {}
  )
  return found ? { list: diffCommentRowNotes(found, kind) } : null
}

/** The list a change naming these notes would edit; see {@link findDiffCommentRows}. */
export function readDiffCommentsForChange<T>(
  state: DiffCommentSelectorState,
  worktreeId: string,
  commentIds: Iterable<string>,
  kind: ReviewNoteKind<T>
): T[] {
  const scope = parseWorkspaceKey(worktreeId)
  if (scope?.type === 'folder') {
    return kind.read(findFolderWorkspaceOwner(state, scope.folderWorkspaceId)) ?? []
  }
  const found = findDiffCommentRows(state, worktreeId, { commentIds: new Set(commentIds) })
  return (found && diffCommentRowNotes(found, kind)) ?? []
}

function selectWorktreeReviewNotes<T>(
  state: DiffCommentSelectorState,
  worktreeId: string | null | undefined,
  kind: ReviewNoteKind<T>
): T[] | undefined {
  if (!worktreeId) {
    return undefined
  }
  const scope = parseWorkspaceKey(worktreeId)
  if (scope?.type === 'folder') {
    return kind.read(findFolderWorkspaceOwner(state, scope.folderWorkspaceId))
  }
  // Open twins need their own notes (unnamed writes refuse); scan only the open bucket per store write, using the cached ID index elsewhere.
  const open = namedHostForOwnerRef(state, { workspaceId: worktreeId })
    ? findDiffCommentRows(state, worktreeId)
    : null
  return open
    ? diffCommentRowNotes(open, kind)
    : kind.read(getIndexedWorktreeById(selectWorktreesByRepo(state), worktreeId))
}

export function selectWorktreeDiffComments(
  state: DiffCommentSelectorState,
  worktreeId: string | null | undefined
): DiffComment[] | undefined {
  return selectWorktreeReviewNotes(state, worktreeId, DIFF_COMMENT_KIND)
}

export function selectWorktreeDiffCommentsOrEmpty(
  state: Parameters<typeof selectWorktreeDiffComments>[0],
  worktreeId: string | null | undefined
): DiffComment[] {
  return selectWorktreeDiffComments(state, worktreeId) ?? EMPTY_DIFF_COMMENTS
}

export function selectWorktreeGeneralNotesOrEmpty(
  state: Parameters<typeof selectWorktreeDiffComments>[0],
  worktreeId: string | null | undefined
): readonly GeneralNote[] {
  return selectWorktreeReviewNotes(state, worktreeId, GENERAL_NOTE_KIND) ?? EMPTY_GENERAL_NOTES
}
