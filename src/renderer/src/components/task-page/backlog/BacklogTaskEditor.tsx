import { useState } from 'react'
import { translate } from '@/i18n/i18n'
import type { Repo } from '../../../../../shared/repo-types'
import { BACKLOG_NOT_SAVED_CODE, type BacklogTask } from '../../../../../shared/backlog-types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { callBacklog } from '@/lib/backlog-task-source'
import { useAppStore } from '@/store'
import { RuntimeRpcCallError } from '@/runtime/runtime-rpc-result'
import {
  BacklogTaskFieldInputs,
  backlogFieldDraft,
  backlogFieldEdits
} from './BacklogTaskFieldInputs'

/**
 * Edits task fields through the owning host; null task creates, and legacy status may be retained.
 * `editFields` is false for hosts without the fields capability, which would silently drop them.
 */
export function BacklogTaskEditor({
  repo,
  task,
  statuses,
  priorities,
  types,
  editFields,
  onClose,
  onUnconfirmed,
  onSaved
}: {
  repo: Repo
  task: BacklogTask | null
  statuses: string[]
  priorities: string[]
  types: string[]
  editFields: boolean
  onClose: () => void
  onUnconfirmed: () => void
  onSaved: () => void
}): React.JSX.Element {
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [status, setStatus] = useState(task?.status ?? statuses[0])
  const settings = useAppStore((state) => state.settings)
  const [loadedDraft] = useState(() => backlogFieldDraft(task))
  // Defaults go into the draft, not the baseline, so a create sends them as edits.
  const [draft, setDraft] = useState(() =>
    task
      ? loadedDraft
      : {
          ...loadedDraft,
          priority: settings?.backlogNewTaskPriority?.trim() ?? '',
          assignees: settings?.backlogNewTaskAssignees ?? '',
          labels: settings?.backlogNewTaskLabels ?? ''
        }
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A save the host refused before writing: shown, but the user may retry right away.
  const [refusal, setRefusal] = useState<string | null>(null)
  /**
   * Reports only confirmed saves. A refusal before the CLI ran leaves the editor usable; any other
   * failure may have written, so it locks this editor and notifies the parent to require inspection.
   */
  async function save(): Promise<void> {
    if (saving || error) {
      return
    }
    setSaving(true)
    setError(null)
    setRefusal(null)
    try {
      const fields = {
        title,
        description,
        status,
        ...(editFields ? backlogFieldEdits(draft, loadedDraft) : {})
      }
      const loaded = task && {
        title: task.title,
        description: task.description,
        status: task.status,
        ...(editFields
          ? {
              priority: task.priority,
              type: task.type,
              dueDate: task.dueDate,
              assignees: task.assignees,
              labels: task.labels,
              dependencies: task.dependencies,
              references: task.references
            }
          : {})
      }
      const reply = await callBacklog(
        repo,
        task && loaded
          ? { kind: 'edit', id: task.id, ...fields, base: loaded }
          : { kind: 'create', ...fields }
      )
      if (!('saved' in reply)) {
        throw new Error('Backlog CLI did not confirm the save. Refresh before retrying.')
      }
      onSaved()
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : String(failure)
      if (failure instanceof RuntimeRpcCallError && failure.code === BACKLOG_NOT_SAVED_CODE) {
        setRefusal(message)
        return
      }
      setError(
        `${message} Completion is unconfirmed. Close this editor, refresh, and inspect tasks before trying again.`
      )
      onUnconfirmed()
    } finally {
      setSaving(false)
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) {
          onClose()
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {task
              ? translate('backlog.editTitle', 'Edit {{id}}', { id: task.id })
              : translate('backlog.createTitle', 'New Backlog task')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'backlog.saveDescription',
              'Saved through the project Backlog CLI on its execution host.'
            )}
          </DialogDescription>
        </DialogHeader>
        <form
          className="scrollbar-sleek max-h-[calc(100vh-12rem)] space-y-3 overflow-y-auto"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="backlog-title">{translate('backlog.title', 'Title')}</Label>
            <Input
              id="backlog-title"
              value={title}
              maxLength={1024}
              disabled={saving}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="backlog-description">
              {translate('backlog.description', 'Description')}
            </Label>
            <Textarea
              id="backlog-description"
              value={description}
              maxLength={65536}
              disabled={saving}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>{translate('backlog.status', 'Status')}</Label>
            <Select value={status} onValueChange={setStatus} disabled={saving}>
              <SelectTrigger aria-label={translate('backlog.taskStatus', 'Task status')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {task && !statuses.includes(task.status) ? (
                  <SelectItem value={task.status}>
                    {translate('backlog.legacyStatus', '{{status}} (not configured)', {
                      status: task.status
                    })}
                  </SelectItem>
                ) : null}
                {statuses.map((entry) => (
                  <SelectItem key={entry} value={entry}>
                    {entry}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {editFields ? (
            <BacklogTaskFieldInputs
              draft={draft}
              priorityClearable={!loadedDraft.priority}
              priorities={priorities}
              types={types}
              disabled={saving}
              onChange={setDraft}
            />
          ) : null}
          {error || refusal ? (
            <p role="alert" className="text-sm text-destructive">
              {error ?? refusal}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" disabled={saving} onClick={onClose}>
              {translate('backlog.cancel', 'Cancel')}
            </Button>
            <Button
              type="submit"
              disabled={
                saving ||
                Boolean(error) ||
                !title.trim() ||
                (!statuses.includes(status) && status !== task?.status)
              }
            >
              {saving
                ? translate('backlog.saving', 'Saving…')
                : translate('backlog.saveTask', 'Save task')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
