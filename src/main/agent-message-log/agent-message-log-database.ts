import { isSqliteCorruption } from '../sqlite/sqlite-read-failure'
import { hardenSqliteDatabaseFiles } from '../sqlite/harden-database-files'
import type SyncDatabase from '../sqlite/sync-database'
import {
  openVersionedCacheDatabase,
  removeVersionedCacheDatabase
} from '../sqlite/versioned-cache-database'
import {
  AGENT_MESSAGE_LOG_RETENTION_MS,
  type AgentMessageLogCursor,
  type AgentMessageLogEntry,
  type AgentMessageLogOutcome
} from '../../shared/agent-message-log-contract'

const SCHEMA_VERSION = 1

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS messages(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sent_at INTEGER NOT NULL,
  text TEXT NOT NULL,
  outcome TEXT NOT NULL,
  refused_reason TEXT,
  target_handle TEXT NOT NULL,
  worktree_id TEXT,
  worktree_path TEXT,
  branch TEXT,
  terminal_title TEXT,
  agent TEXT
);
CREATE INDEX IF NOT EXISTS messages_sent_at ON messages(sent_at);
`
// Rows hold prompt text sent to agents; keep the directory user-only.
const PRIVATE_DIRECTORY_MODE = 0o700
const OUTCOMES: readonly AgentMessageLogOutcome[] = ['accepted', 'refused', 'error']

export type AgentMessageLogInsert = Omit<AgentMessageLogEntry, 'id'>

/** Messages sent with `orca terminal send`, pruned to the retention window on open and on insert. */
export class AgentMessageLogDatabase {
  private db: SyncDatabase | null
  private recovered = false

  constructor(
    private readonly path: string,
    private readonly now: () => number = Date.now
  ) {
    this.db = openDatabase(path)
    this.prune()
  }

  insert(entry: AgentMessageLogInsert): void {
    this.run((db) => {
      db.prepare(
        `INSERT INTO messages(sent_at, text, outcome, refused_reason, target_handle, worktree_id,
           worktree_path, branch, terminal_title, agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        entry.sentAt,
        entry.text,
        entry.outcome,
        entry.refusedReason,
        entry.targetHandle,
        entry.worktreeId,
        entry.worktreePath,
        entry.branch,
        entry.terminalTitle,
        entry.agent
      )
    }, undefined)
    this.prune()
  }

  /** Newest first. */
  list(limit: number): AgentMessageLogEntry[] {
    return this.run(
      (db) =>
        db
          .prepare(
            `SELECT * FROM messages WHERE sent_at >= ? ORDER BY sent_at DESC, id DESC LIMIT ?`
          )
          .all(this.cutoff(), limit)
          .flatMap((row) => {
            const entry = parseRow(row)
            return entry ? [entry] : []
          }),
      []
    )
  }

  /** Failed reads reject so the sidebar can retain its last known recency. */
  latest(): AgentMessageLogCursor | null {
    const latest = this.run<AgentMessageLogCursor | null | undefined>((db) => {
      const row = db
        .prepare(
          'SELECT id, sent_at FROM messages WHERE sent_at >= ? ORDER BY sent_at DESC, id DESC LIMIT 1'
        )
        .get(this.cutoff())
      return row && typeof row.id === 'number' && typeof row.sent_at === 'number'
        ? { id: row.id, sentAt: row.sent_at }
        : null
    }, undefined)
    if (latest === undefined) {
      throw new Error('Message log is unavailable')
    }
    return latest
  }

  close(): void {
    const db = this.db
    this.db = null
    try {
      db?.close()
    } catch {}
  }

  private cutoff(): number {
    return this.now() - AGENT_MESSAGE_LOG_RETENTION_MS
  }

  private prune(): void {
    this.run((db) => {
      db.prepare('DELETE FROM messages WHERE sent_at < ?').run(this.cutoff())
    }, undefined)
  }

  // Failures return the fallback; rebuild corruption once, then disable the log if it recurs.
  private run<T>(operation: (db: SyncDatabase) => T, fallback: T): T {
    const db = this.db
    if (db === null) {
      return fallback
    }
    try {
      return operation(db)
    } catch (error) {
      console.warn('[agent-message-log] database operation failed', error)
      if (isSqliteCorruption(error)) {
        this.close()
        if (!this.recovered) {
          this.recovered = true
          try {
            removeVersionedCacheDatabase(this.path)
            this.db = openDatabase(this.path)
          } catch (reopenError) {
            console.warn('[agent-message-log] database stays off', reopenError)
          }
        }
      }
      return fallback
    }
  }
}

function openDatabase(path: string): SyncDatabase {
  const db = openVersionedCacheDatabase(path, {
    version: SCHEMA_VERSION,
    sql: SCHEMA_SQL,
    directoryMode: PRIVATE_DIRECTORY_MODE
  })
  hardenSqliteDatabaseFiles(path)
  return db
}

function parseRow(row: Record<string, unknown>): AgentMessageLogEntry | null {
  const { id, sent_at, text, outcome, target_handle } = row
  if (
    typeof id !== 'number' ||
    typeof sent_at !== 'number' ||
    typeof text !== 'string' ||
    typeof target_handle !== 'string'
  ) {
    return null
  }
  const parsedOutcome = OUTCOMES.find((value) => value === outcome)
  if (!parsedOutcome) {
    return null
  }
  return {
    id,
    sentAt: sent_at,
    text,
    outcome: parsedOutcome,
    refusedReason: stringOrNull(row.refused_reason),
    targetHandle: target_handle,
    worktreeId: stringOrNull(row.worktree_id),
    worktreePath: stringOrNull(row.worktree_path),
    branch: stringOrNull(row.branch),
    terminalTitle: stringOrNull(row.terminal_title),
    agent: stringOrNull(row.agent)
  }
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}
