import React, { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { DiffNotesSendMenu } from '@/components/editor/DiffNotesSendMenu'
import { GeneralNotesSection } from '@/components/right-sidebar/source-control/notes/general-notes-section'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { selectWorktreeGeneralNotesOrEmpty } from '@/store/worktree-diff-comments-selector'

const NO_FILE_NOTES = Object.freeze([])

/**
 * The workspace card's "Add note for the AI…" dialog: a workspace's general notes, a composer and
 * Send notes. The only general-notes surface for folder workspaces, which have no Source Control.
 */
export default function GeneralNotesDialog(): React.JSX.Element {
  const modalData = useAppStore((s) => s.modalData)
  const closeModal = useAppStore((s) => s.closeModal)
  const worktreeId = typeof modalData.worktreeId === 'string' ? modalData.worktreeId : ''
  const [composerOpen, setComposerOpen] = useState(true)
  const generalNotes = useAppStore((s) => selectWorktreeGeneralNotesOrEmpty(s, worktreeId))

  return (
    <Dialog open={Boolean(worktreeId)} onOpenChange={(open) => !open && closeModal()}>
      <DialogContent className="max-h-[calc(100vh-3rem)] sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{translate('generalNotes.dialogTitle', 'Notes for the AI')}</DialogTitle>
          <DialogDescription>
            {translate(
              'generalNotes.dialogDescription',
              'Todos for this workspace, not tied to a file. Send them to an agent when ready.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="-mx-3 min-h-0 overflow-y-auto scrollbar-sleek">
          <GeneralNotesSection
            worktreeId={worktreeId}
            composerOpen={composerOpen}
            onComposerClose={() => setComposerOpen(false)}
            showEmptyHint
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setComposerOpen(true)}
            disabled={composerOpen}
          >
            <Plus className="size-3.5" />
            {translate('generalNotes.addAnother', 'Add note')}
          </Button>
          <DiffNotesSendMenu
            worktreeId={worktreeId}
            groupId={worktreeId}
            comments={NO_FILE_NOTES}
            generalNotes={generalNotes}
            triggerLabel={translate('generalNotes.send', 'Send notes')}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
