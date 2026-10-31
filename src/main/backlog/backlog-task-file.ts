import { isScalar, isSeq, parseDocument, visit } from 'yaml'
import { z } from 'zod'
import { BACKLOG_TASK_ID_PATTERN, type BacklogTask } from '../../shared/backlog-types'

/** YAML 1.1 reads an unquoted date as a Date; Backlog dates are days. */
function scalarText(value: unknown): string {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10)
  }
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}
// Display-only fields: a malformed one shows as empty instead of hiding the whole board.
const OptionalText = z.unknown().transform(scalarText).pipe(z.string().max(4096)).catch('')
const OptionalList = z
  .unknown()
  .transform((value) =>
    (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value])
      .map(scalarText)
      .filter(Boolean)
  )
  .pipe(z.array(z.string().max(4096)).max(1000))
  .catch([])
const Metadata = z.object({
  id: z.string().regex(BACKLOG_TASK_ID_PATTERN).max(128),
  title: z
    .union([z.string(), z.number().finite(), z.boolean(), z.date(), z.null(), z.undefined()])
    .transform((value) => String(value || ''))
    .pipe(z.string().max(1024)),
  status: z.string().max(200),
  onStatusChange: z.unknown().optional(),
  priority: OptionalText,
  type: OptionalText,
  due_date: OptionalText,
  parent_task_id: OptionalText,
  assignee: OptionalList,
  labels: OptionalList,
  dependencies: OptionalList,
  references: OptionalList,
  documentation: OptionalList
})

/** Validates task frontmatter, extracts display content, and flags status hooks before CLI edits. */
export function parseBacklogTask(content: string): BacklogTask & { hasStatusHook: boolean } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(content)
  if (!match) {
    throw new Error('Backlog task is missing YAML frontmatter.')
  }
  // Full YAML (including merges and quoted keys) is required to see every executable hook.
  const document = parseDocument(match[1], {
    version: '1.1',
    merge: true,
    // gray-matter treats yes/no/on/off as strings, while retaining YAML dates and octal numbers.
    customTags: (tags) => [
      ...tags.filter((tag) => typeof tag === 'string' || tag.tag !== 'tag:yaml.org,2002:bool'),
      'bool'
    ]
  })
  const allowedAtSigns = new Set<number>()
  visit(document, {
    /** Allows bare @ handles only in assignee/reporter scalars or flow-sequence entries. */
    Pair(_key, pair) {
      if (!isScalar(pair.key) || !['assignee', 'reporter'].includes(String(pair.key.value))) {
        return
      }
      const values = isSeq(pair.value) && pair.value.flow ? pair.value.items : [pair.value]
      for (const value of values) {
        if (
          isScalar(value) &&
          value.type === 'PLAIN' &&
          value.source?.startsWith('@') &&
          value.range
        ) {
          allowedAtSigns.add(value.range[0])
        }
      }
    }
  })
  // Backlog accepts unquoted @ handles; all other YAML failures must remain blocking.
  document.errors = document.errors.filter(
    (error) => error.code !== 'BAD_SCALAR_START' || !allowedAtSigns.has(error.pos[0])
  )
  if (document.errors.length) {
    throw document.errors[0]
  }
  const metadata = Metadata.parse(document.toJS())
  const body = match[2].trim()
  const description =
    /<!-- SECTION:DESCRIPTION:BEGIN -->\s*([\s\S]*?)\s*<!-- SECTION:DESCRIPTION:END -->/.exec(
      body
    )?.[1] ??
    /(?:^|\r?\n)## Description[^\S\r\n]*\r?\n([\s\S]*?)(?=\r?\n## |$)/.exec(body)?.[1]?.trim() ??
    ''
  return {
    id: metadata.id,
    title: metadata.title,
    status: metadata.status,
    description,
    body,
    priority: metadata.priority,
    type: metadata.type,
    dueDate: metadata.due_date,
    parent: metadata.parent_task_id,
    assignees: metadata.assignee,
    labels: metadata.labels,
    dependencies: metadata.dependencies,
    references: metadata.references,
    documentation: metadata.documentation,
    hasStatusHook: Boolean(metadata.onStatusChange)
  }
}
