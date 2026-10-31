export const BACKLOG_TASKS_CAPABILITY = 'tasks.backlog.v1' as const
// Hosts without it strip the extra edit fields, so a save would drop them while reporting success.
export const BACKLOG_TASK_FIELDS_CAPABILITY = 'tasks.backlog.fields.v1' as const
