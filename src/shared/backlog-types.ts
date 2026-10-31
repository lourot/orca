import { z } from 'zod'

export const BACKLOG_CLI_VERSION = '1.55.3'
// Execution includes scanning and the 30-second CLI; transports leave room for cleanup.
export const BACKLOG_OPERATION_TIMEOUT_MS = 45000
export const BACKLOG_RPC_TIMEOUT_MS = 65000
// A save refused before the CLI ran: the task is certainly unchanged, so the editor may retry.
export const BACKLOG_NOT_SAVED_CODE = 'backlog_not_saved'

export const BACKLOG_TASK_ID_PATTERN = /^[a-zA-Z]+-[a-zA-Z0-9]+(?:[._-][a-zA-Z0-9]+)*$/
const TaskId = z.string().regex(BACKLOG_TASK_ID_PATTERN).max(128)

/** Compares task IDs the way the CLI resolves them: case-insensitive, ignoring zero padding. */
export function backlogTaskKey(id: string): string {
  return /^[a-z]+-\d+(?:\.\d+)*$/i.test(id)
    ? id.toLowerCase().replace(/([-.])0+(?=\d)/g, '$1')
    : id.toLowerCase()
}

/** One notion of "unchanged" for the stale check and the CLI args: text ignores case, as the CLI stores priority and type lowercase; lists keep order. */
export function sameBacklogFieldValue(a: string | string[], b: string | string[]): boolean {
  if (typeof a === 'string' || typeof b === 'string') {
    return String(a).toLowerCase() === String(b).toLowerCase()
  }
  return a.length === b.length && a.every((value, index) => value === b[index])
}
const Text = z
  .string()
  .max(65536)
  .refine((value) => !value.includes('\0'))
// The CLI splits these on commas and stores one line each.
const ListEntry = z
  .string()
  .min(1)
  .max(1024)
  .refine((value) => !/[,\0\r\n]/.test(value))
/** Fields beyond title/description/status; optional so clients without them leave the task's values alone. */
const FieldEdits = {
  priority: z.string().max(200).optional(),
  type: z.string().max(200).optional(),
  dueDate: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
  assignees: z.array(ListEntry).max(100).optional(),
  labels: z.array(ListEntry).max(100).optional(),
  dependencies: z.array(TaskId).max(100).optional(),
  references: z.array(ListEntry).max(100).optional()
}
// Loose: these echo what the task file held, which edits may not reproduce.
const BaseText = z.string().max(4096).optional()
const BaseList = z.array(z.string().max(4096)).max(1000).optional()
const BaseFields = {
  priority: BaseText,
  type: BaseText,
  dueDate: BaseText,
  assignees: BaseList,
  labels: BaseList,
  dependencies: BaseList,
  references: BaseList
}
export const BacklogOperation = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('list'),
    search: z.string().max(200).default(''),
    status: z.string().max(200).default(''),
    offset: z.number().int().min(0).max(10000).default(0)
  }),
  z.object({ kind: z.literal('read'), id: TaskId }),
  z.object({
    kind: z.literal('create'),
    title: Text.min(1).max(1024),
    description: Text,
    status: z.string().min(1).max(200),
    ...FieldEdits
  }),
  z.object({
    kind: z.literal('edit'),
    id: TaskId,
    title: Text.min(1).max(1024),
    description: Text,
    status: z.string().min(1).max(200),
    ...FieldEdits,
    // The fields as the editor loaded them; optional so older clients keep their behaviour.
    base: z
      .object({
        title: Text,
        description: Text,
        status: z.string().max(200),
        ...BaseFields
      })
      .optional()
  })
])
export type BacklogOperation = z.infer<typeof BacklogOperation>
/** Frontmatter fields Orca shows; strings are '' and lists [] when the task file has none. */
export type BacklogTaskFields = {
  priority: string
  type: string
  dueDate: string
  parent: string
  assignees: string[]
  labels: string[]
  dependencies: string[]
  references: string[]
  documentation: string[]
}
export type BacklogTask = {
  id: string
  title: string
  status: string
  description: string
  body: string
} & BacklogTaskFields
export type BacklogTaskLink = { id: string; title: string; status: string }
/** A read reply: the task plus relations derived from the whole board. */
export type BacklogTaskDetail = BacklogTask & {
  blocks: string[]
  subtasks: string[]
  related: string[]
  links: BacklogTaskLink[]
}
export type BacklogTaskSummary = Pick<
  BacklogTask,
  'id' | 'title' | 'status' | 'priority' | 'labels'
>
export type BacklogList = {
  projectPath: string
  projectName: string
  statuses: string[]
  priorities: string[]
  types: string[]
  tasks: BacklogTaskSummary[]
  total: number
  mutationUnavailable: string | null
}
// Defaults keep replies from servers that predate these fields valid.
const Strings = z.array(z.string()).default([])
export const BacklogReply = z.union([
  z.object({
    projectPath: z.string(),
    projectName: z.string(),
    statuses: z.array(z.string()),
    priorities: Strings,
    types: Strings,
    tasks: z.array(
      z.object({
        id: TaskId,
        title: z.string(),
        status: z.string(),
        priority: z.string().default(''),
        labels: Strings
      })
    ),
    total: z.number(),
    mutationUnavailable: z.string().nullable()
  }),
  z.object({
    id: TaskId,
    title: z.string(),
    status: z.string(),
    description: z.string(),
    body: z.string(),
    priority: z.string().default(''),
    type: z.string().default(''),
    dueDate: z.string().default(''),
    parent: z.string().default(''),
    assignees: Strings,
    labels: Strings,
    dependencies: Strings,
    references: Strings,
    documentation: Strings,
    blocks: Strings,
    subtasks: Strings,
    related: Strings,
    links: z.array(z.object({ id: z.string(), title: z.string(), status: z.string() })).default([])
  }),
  z.object({ saved: z.literal(true) })
])
export type BacklogReply = z.infer<typeof BacklogReply>
