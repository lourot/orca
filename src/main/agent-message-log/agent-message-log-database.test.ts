import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AGENT_MESSAGE_LOG_RETENTION_MS } from '../../shared/agent-message-log-contract'
import { AgentMessageLogDatabase, type AgentMessageLogInsert } from './agent-message-log-database'

const DAY = 24 * 60 * 60 * 1000
const dirs: string[] = []

function entry(text: string, sentAt: number): AgentMessageLogInsert {
  return {
    sentAt,
    text,
    outcome: 'accepted',
    refusedReason: null,
    targetHandle: 'term_1',
    worktreeId: null,
    worktreePath: null,
    branch: null,
    terminalTitle: null,
    agent: null
  }
}

function tempDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'agent-message-log-'))
  dirs.push(dir)
  return join(dir, 'log.sqlite')
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('AgentMessageLogDatabase', () => {
  it('returns only the newest retained cursor, breaking timestamp ties by id', () => {
    let now = 100 * DAY
    const db = new AgentMessageLogDatabase(':memory:', () => now)
    expect(db.latest()).toBeNull()
    db.insert(entry('first', now))
    db.insert(entry('second', now))
    db.insert(entry('recorded later but sent earlier', now - DAY))
    const newest = db.list(1)[0]
    expect(db.latest()).toEqual({ id: newest?.id, sentAt: now })
    now += AGENT_MESSAGE_LOG_RETENTION_MS + 1
    expect(db.latest()).toBeNull()
    db.close()
    expect(() => db.latest()).toThrow('Message log is unavailable')
  })

  it('lists messages inside the retention window, newest first', () => {
    const now = 100 * DAY
    const db = new AgentMessageLogDatabase(':memory:', () => now)
    db.insert(entry('too old', now - AGENT_MESSAGE_LOG_RETENTION_MS - 1))
    db.insert(entry('older', now - 2 * DAY))
    db.insert(entry('newest', now - DAY))
    expect(db.list(10).map((row) => row.text)).toEqual(['newest', 'older'])
    expect(db.list(1).map((row) => row.text)).toEqual(['newest'])
    db.close()
  })

  it('deletes expired rows on insert and on open, not only hides them', () => {
    const path = tempDbPath()
    let now = 0
    const first = new AgentMessageLogDatabase(path, () => now)
    first.insert(entry('expires on insert', 0))
    now = 15 * DAY
    first.insert(entry('kept', now))
    now = 0
    // A clock moved back would show the first row again had it only been filtered.
    expect(first.list(10).map((row) => row.text)).toEqual(['kept'])
    first.insert(entry('expires on open', 0))
    first.close()

    now = 15 * DAY
    new AgentMessageLogDatabase(path, () => now).close()
    now = 0
    const reopened = new AgentMessageLogDatabase(path, () => now)
    expect(reopened.list(10).map((row) => row.text)).toEqual(['kept'])
    reopened.close()
  })
})
