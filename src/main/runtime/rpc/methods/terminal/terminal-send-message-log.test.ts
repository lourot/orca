import { describe, expect, it, vi } from 'vitest'
import { TerminalSend } from '../../../../../shared/rpc-contract/terminal-unary-params'
import type { RuntimeTerminalListResult } from '../../../../../shared/runtime-terminal-contracts'
import type { RpcCallerIdentity } from '../../rpc-caller-identity'
import { beginTerminalSendMessageLog } from './terminal-send-message-log'

const CLI = { kind: 'local-cli' } as const
const CLI_CLIENT = { id: 'orca-cli', type: 'desktop' }

type ListTerminals = () => Promise<RuntimeTerminalListResult>

function setup(
  listTerminals: ListTerminals = async () => ({ terminals: [], totalCount: 0, truncated: false })
) {
  const insert = vi.fn()
  const begin = (
    raw: Record<string, unknown>,
    ctx: { caller?: RpcCallerIdentity; replayedMutationReceipt?: unknown } = { caller: CLI }
  ) =>
    beginTerminalSendMessageLog(
      TerminalSend.parse({ terminal: 'term_1', ...raw }),
      { ...ctx, runtime: { listTerminals } },
      () => ({ insert })
    )
  return { insert, begin, listTerminals }
}

describe('beginTerminalSendMessageLog', () => {
  it('logs only CLI sends that carry typed text, and not replays', () => {
    const { begin } = setup()
    const cases: [
      string,
      Record<string, unknown>,
      RpcCallerIdentity | undefined,
      unknown,
      boolean
    ][] = [
      ['CLI prompt', { text: 'hi', enter: true, client: CLI_CLIENT }, CLI, undefined, true],
      ['CLI text without enter', { text: 'hi', client: CLI_CLIENT }, CLI, undefined, true],
      ['desktop typing', { text: 'hi', client: CLI_CLIENT }, { kind: 'desktop' }, undefined, false],
      ['mobile', { text: 'hi', client: { id: 'p', type: 'mobile' } }, CLI, undefined, false],
      ['legacy clientless', { text: 'hi' }, CLI, undefined, false],
      ['no text', { enter: true, client: CLI_CLIENT }, CLI, undefined, false],
      ['focus report', { text: '\u001b[I', client: CLI_CLIENT }, CLI, undefined, false],
      ['replayed retry', { text: 'hi', client: CLI_CLIENT }, CLI, { send: {} }, false]
    ]
    const logged = Object.fromEntries(
      cases.map(([name, raw, caller, replayedMutationReceipt]) => [
        name,
        begin(raw, { caller, replayedMutationReceipt }) !== null
      ])
    )
    expect(logged).toEqual(Object.fromEntries(cases.map(([name, , , , want]) => [name, want])))
  })

  it('records the outcome and the target resolved at send time', async () => {
    const { insert, begin } = setup(async () => ({
      terminals: [
        {
          handle: 'term_1',
          ptyId: 'pty_1',
          worktreeId: 'repo::/w',
          worktreePath: '/w',
          branch: 'feat',
          tabId: 'tab_1',
          leafId: 'leaf_1',
          title: 'claude',
          connected: true,
          writable: true,
          lastOutputAt: null,
          preview: '',
          agentIdentity: 'claude'
        }
      ],
      totalCount: 1,
      truncated: false
    }))
    begin({ text: 'one', client: CLI_CLIENT })?.({ send: { accepted: true } })
    begin({ text: 'two', client: CLI_CLIENT })?.({
      send: { accepted: false, refusedReason: 'no-agent' }
    })
    begin({ text: 'three', client: CLI_CLIENT })?.(undefined)
    await vi.waitFor(() => expect(insert).toHaveBeenCalledTimes(3))
    expect(
      insert.mock.calls.map(([entry]) => [entry.text, entry.outcome, entry.refusedReason])
    ).toEqual([
      ['one', 'accepted', null],
      ['two', 'refused', 'no-agent'],
      ['three', 'error', null]
    ])
    expect(insert.mock.calls[0]?.[0]).toMatchObject({
      targetHandle: 'term_1',
      worktreeId: 'repo::/w',
      branch: 'feat',
      agent: 'claude'
    })
  })

  it('keeps sending when the target lookup or the store fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const failingLookup: ListTerminals = async () => {
      throw new Error('gone')
    }
    const { insert, begin } = setup(failingLookup)
    begin({ text: 'hi', client: CLI_CLIENT })?.({ send: { accepted: true } })
    await vi.waitFor(() => expect(insert).toHaveBeenCalledTimes(1))
    expect(insert.mock.calls[0]?.[0]).toMatchObject({ targetHandle: 'term_1', worktreeId: null })

    const finish = beginTerminalSendMessageLog(
      TerminalSend.parse({ terminal: 'term_1', text: 'hi', client: CLI_CLIENT }),
      { caller: CLI, runtime: { listTerminals: failingLookup } },
      () => ({
        insert: () => {
          throw new Error('disk full')
        }
      })
    )
    expect(() => finish?.({ send: { accepted: true } })).not.toThrow()
    await vi.waitFor(() => expect(warn).toHaveBeenCalled())
    warn.mockRestore()
  })
})
