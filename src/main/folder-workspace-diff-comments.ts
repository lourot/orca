import type { FolderWorkspace } from '../shared/folder-workspace-types'

/** The FolderWorkspace note lists persisted outside `folderWorkspaces[]`, in their own top-level map. */
export const FOLDER_WORKSPACE_NOTE_FIELDS = ['diffComments', 'generalNotes'] as const
export type FolderWorkspaceNoteField = (typeof FOLDER_WORKSPACE_NOTE_FIELDS)[number]

type FolderWorkspaceNoteList<F extends FolderWorkspaceNoteField> = NonNullable<FolderWorkspace[F]>

// Preserve members without filtering so normalization cannot delete user-authored comments.
export function normalizeFolderWorkspaceNoteMap<F extends FolderWorkspaceNoteField>(
  value: unknown
): Record<string, FolderWorkspaceNoteList<F>> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined
  }
  const normalized: Record<string, FolderWorkspaceNoteList<F>> = {}
  let kept = false
  for (const [id, notes] of Object.entries(value)) {
    if (!Array.isArray(notes)) {
      continue
    }
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: shape-only by design (see above); members are user prose kept verbatim.
    normalized[id] = notes as FolderWorkspaceNoteList<F>
    kept = true
  }
  return kept ? normalized : undefined
}

// Rebuilding on write drops stale entries without separate pruning on deletion.
export function collectFolderWorkspaceNotes<F extends FolderWorkspaceNoteField>(
  workspaces: readonly FolderWorkspace[] | undefined,
  field: F
): Record<string, FolderWorkspaceNoteList<F>> | undefined {
  const collected: Record<string, FolderWorkspaceNoteList<F>> = {}
  let kept = false
  for (const workspace of workspaces ?? []) {
    const notes = workspace[field]
    if (Array.isArray(notes) && notes.length > 0) {
      collected[workspace.id] = notes
      kept = true
    }
  }
  return kept ? collected : undefined
}
