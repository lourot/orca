/** Values prefilled when creating a Backlog.md task; empty leaves a field unset. */
export type BacklogNewTaskSettings = {
  backlogNewTaskPriority: string
  /** The editor's comma-separated text, split when the task is saved. */
  backlogNewTaskAssignees: string
  /** The editor's comma-separated text, split when the task is saved. */
  backlogNewTaskLabels: string
}
