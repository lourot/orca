import { DropdownMenuItem, DropdownMenuLabel } from '@/components/ui/dropdown-menu'
import { MessageSquarePlus, Pencil } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import type { WorktreeContextMenuModel } from './use-worktree-context-menu-model'
import { WorktreeStatusMenuItems } from './WorktreeStatusMenuItems'

/** The context menu's "Workspace" section: update details, add a general note, move status. */
export function WorktreeWorkspaceMenuSection({
  model
}: {
  model: WorktreeContextMenuModel
}): React.JSX.Element {
  const { isMultiContext, isDeleting } = model
  return (
    <>
      <DropdownMenuLabel className="px-2 py-1 text-[11px] font-medium text-muted-foreground">
        {translate('auto.components.sidebar.WorktreeContextMenu.workspaceSection', 'Workspace')}
      </DropdownMenuLabel>
      {!isMultiContext && (
        <>
          <DropdownMenuItem onSelect={model.handleRename} disabled={isDeleting}>
            <Pencil className="size-3.5" />
            {translate('auto.components.sidebar.WorktreeContextMenu.439fa94d53', 'Update')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={model.handleAddGeneralNote} disabled={isDeleting}>
            <MessageSquarePlus className="size-3.5" />
            {translate('generalNotes.addEllipsis', 'Add note for the AI…')}
          </DropdownMenuItem>
        </>
      )}
      <WorktreeStatusMenuItems
        contextWorkspaceStatus={model.contextWorkspaceStatus}
        deletingContext={model.deletingContext}
        isMultiContext={isMultiContext}
        onAssignWorkspaceStatus={model.handleAssignWorkspaceStatus}
        workspaceStatuses={model.workspaceStatuses}
      />
    </>
  )
}
