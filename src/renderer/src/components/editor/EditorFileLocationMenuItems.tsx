import { Copy, ExternalLink, History } from 'lucide-react'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { LocalOnlyMenuHint } from '@/components/local-only-menu-hint'
import { useAppStore } from '@/store'
import type { OpenFile } from '@/store/slices/editor'
import { isLocalPathOpenBlocked, isRevealOrEditorOpenBlocked } from '@/lib/local-path-open-guard'
import {
  getRevealInFileManagerLabel,
  getOpenFileRevealOwner,
  revealInFileManager
} from '@/lib/reveal-in-file-manager'
import { translate } from '@/i18n/i18n'
import { findWorktreeById } from '@/store/slices/worktree-helpers'
import { selectWorktreesByRepo } from '@/store/workspace-record-selectors'
import { openFileInGitGuiBlame } from './git-gui-blame-open'

export function EditorFileLocationMenuItems({
  file,
  onCopyPath
}: {
  file: OpenFile
  onCopyPath: () => void
}): React.JSX.Element {
  const revealOwner = useAppStore((state) => getOpenFileRevealOwner(state, file))
  const revealBlocked = isRevealOrEditorOpenBlocked(revealOwner)
  // Folder workspaces have no git worktree, so they get no blame item.
  const worktreePath = useAppStore(
    (state) => findWorktreeById(selectWorktreesByRepo(state), file.worktreeId)?.path ?? null
  )
  const blameBlocked = isLocalPathOpenBlocked(revealOwner)

  return (
    <>
      <DropdownMenuItem
        disabled={revealBlocked}
        onSelect={() => void revealInFileManager(file.filePath, revealOwner)}
      >
        <ExternalLink />
        {getRevealInFileManagerLabel()}
        {revealBlocked ? <LocalOnlyMenuHint /> : null}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={onCopyPath}>
        <Copy />
        {translate('auto.components.editor.EditorPanelHeader.7c08a1f990', 'Copy Path')}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => void window.api.ui.writeClipboardText(file.relativePath)}>
        <Copy />
        {translate('auto.components.editor.EditorPanelHeader.269ce4842b', 'Copy Relative Path')}
      </DropdownMenuItem>
      {worktreePath && window.api.shell.openGitGuiBlame ? (
        <DropdownMenuItem
          disabled={blameBlocked}
          onSelect={() => void openFileInGitGuiBlame(file.filePath, worktreePath, revealOwner)}
        >
          <History />
          {translate('editor.gitGuiBlame.open', 'Open in git gui blame')}
          {blameBlocked ? <LocalOnlyMenuHint /> : null}
        </DropdownMenuItem>
      ) : null}
    </>
  )
}
