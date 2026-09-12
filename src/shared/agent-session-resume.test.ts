import { describe, expect, it } from 'vitest'
import {
  agentProviderSessionsEqual,
  canForkAgentConversation,
  extractAgentProviderSession,
  getAgentForkResumeArgv,
  getAgentResumeArgv,
  isResumableTuiAgent,
  normalizeAgentProviderSession,
  RESUMABLE_TUI_AGENTS
} from './agent-session-resume'

describe('agent session resume metadata', () => {
  it('treats devin as a resumable TUI agent', () => {
    expect(isResumableTuiAgent('devin')).toBe(true)
  })

  it('treats omp as a resumable TUI agent', () => {
    expect(isResumableTuiAgent('omp')).toBe(true)
  })

  it('treats Prime Agent as a resumable TUI agent', () => {
    expect(isResumableTuiAgent('prime-agent')).toBe(true)
  })

  it('treats copilot as a resumable TUI agent', () => {
    expect(isResumableTuiAgent('copilot')).toBe(true)
  })

  it('treats Kimi Code as a resumable TUI agent', () => {
    expect(isResumableTuiAgent('kimi')).toBe(true)
  })

  it.each([
    ['claude', { session_id: 'claude-session' }, { key: 'session_id', id: 'claude-session' }],
    ['codex', { session_id: 'codex-session' }, { key: 'session_id', id: 'codex-session' }],
    ['gemini', { session_id: 'gemini-session' }, { key: 'session_id', id: 'gemini-session' }],
    [
      'antigravity',
      { conversationId: 'agy-conversation' },
      { key: 'conversation_id', id: 'agy-conversation' }
    ],
    ['opencode', { sessionID: 'opencode-session' }, { key: 'session_id', id: 'opencode-session' }],
    [
      'pi',
      { session_id: 'pi-session', session_file: '/tmp/pi-session.jsonl' },
      { key: 'session_id', id: 'pi-session', transcriptPath: '/tmp/pi-session.jsonl' }
    ],
    ['mimo-code', { sessionID: 'mimo-session' }, { key: 'session_id', id: 'mimo-session' }],
    ['droid', { session_id: 'droid-session' }, { key: 'session_id', id: 'droid-session' }],
    ['grok', { sessionId: 'grok-session' }, { key: 'session_id', id: 'grok-session' }],
    ['devin', { session_id: 'devin-session' }, { key: 'session_id', id: 'devin-session' }],
    ['omp', { session_id: 'omp-session' }, { key: 'session_id', id: 'omp-session' }],
    [
      'prime-agent',
      { session_id: 'prime-session', session_file: '/tmp/prime-session.jsonl' },
      { key: 'session_id', id: 'prime-session', transcriptPath: '/tmp/prime-session.jsonl' }
    ],
    [
      'copilot',
      { session_id: '940237d9-c712-48e8-bca1-fd75fc4a8d4b' },
      { key: 'session_id', id: '940237d9-c712-48e8-bca1-fd75fc4a8d4b' }
    ],
    ['copilot', { sessionId: 'copilot-camel' }, { key: 'session_id', id: 'copilot-camel' }],
    [
      'kimi',
      { session_id: 'session_431324d7-2165-42f0-9ecd-9f93437b3201' },
      { key: 'session_id', id: 'session_431324d7-2165-42f0-9ecd-9f93437b3201' }
    ]
  ] as const)('extracts %s provider session ids', (source, payload, expected) => {
    expect(extractAgentProviderSession(source, payload)).toEqual(expected)
  })

  it.each([
    ['claude', { key: 'session_id', id: 's1' }, ['claude', '--resume', 's1']],
    ['codex', { key: 'session_id', id: 's1' }, ['codex', 'resume', 's1']],
    ['gemini', { key: 'session_id', id: 's1' }, ['gemini', '--resume', 's1']],
    ['antigravity', { key: 'conversation_id', id: 's1' }, ['agy', '--conversation', 's1']],
    ['opencode', { key: 'session_id', id: 's1' }, ['opencode', '--session', 's1']],
    [
      'pi',
      { key: 'session_id', id: 's1', transcriptPath: '/tmp/pi-session.jsonl' },
      ['pi', '--session', '/tmp/pi-session.jsonl']
    ],
    ['mimo-code', { key: 'session_id', id: 's1' }, ['mimo', '--session', 's1']],
    ['droid', { key: 'session_id', id: 's1' }, ['droid', '--resume', 's1']],
    ['grok', { key: 'session_id', id: 's1' }, ['grok', '--resume', 's1']],
    ['devin', { key: 'session_id', id: 'abc12345' }, ['devin', '--resume', 'abc12345']],
    ['omp', { key: 'session_id', id: 's1' }, ['omp', '--resume', 's1']],
    [
      'prime-agent',
      { key: 'session_id', id: 's1', transcriptPath: '/tmp/prime-session.jsonl' },
      ['prime-agent', '--resume', '/tmp/prime-session.jsonl']
    ],
    ['copilot', { key: 'session_id', id: 's1' }, ['copilot', '--resume=s1']],
    [
      'kimi',
      { key: 'session_id', id: 'session_431324d7' },
      ['kimi', '--session', 'session_431324d7']
    ]
  ] as const)('builds %s resume argv', (agent, providerSession, expected) => {
    expect(getAgentResumeArgv(agent, providerSession)).toEqual(expected)
  })

  it('rejects unsupported sources and unsafe ids', () => {
    expect(extractAgentProviderSession('cursor', { session_id: 'cursor-session' })).toBeNull()
    expect(normalizeAgentProviderSession({ key: 'session_id', id: 'bad\nid' })).toBeNull()
    expect(normalizeAgentProviderSession({ key: 'session_id', id: '--last' })).toBeNull()
    expect(extractAgentProviderSession('codex', { session_id: '--last' })).toBeNull()
    expect(normalizeAgentProviderSession({ key: 'session_id', id: 'ok' })).toEqual({
      key: 'session_id',
      id: 'ok'
    })
  })

  it('does not capture ephemeral Pi sessions without a session file', () => {
    expect(extractAgentProviderSession('pi', { session_id: 'pi-session' })).toBeNull()
    expect(
      extractAgentProviderSession('pi', { session_id: 'pi-session', session_file: '' })
    ).toBeNull()
    expect(extractAgentProviderSession('pi', { session_file: '/tmp/pi-session.jsonl' })).toBeNull()
    expect(getAgentResumeArgv('pi', { key: 'session_id', id: 'pi-session' })).toBeNull()
  })

  it('compares the actual provider resume locator for each agent', () => {
    const first = { key: 'session_id' as const, id: 'session-1', transcriptPath: '/tmp/first' }
    const second = { key: 'session_id' as const, id: 'session-1', transcriptPath: '/tmp/second' }

    expect(agentProviderSessionsEqual('pi', first, second)).toBe(false)
    expect(agentProviderSessionsEqual('prime-agent', first, second)).toBe(false)
    expect(agentProviderSessionsEqual('claude', first, second)).toBe(true)
  })

  it('rejects devin resume when provider session key is not session_id', () => {
    expect(getAgentResumeArgv('devin', { key: 'conversation_id', id: 'x' })).toBeNull()
  })

  it('captures the hook transcript_path for native-chat agents (claude/codex)', () => {
    expect(
      extractAgentProviderSession('claude', {
        session_id: 'cs',
        transcript_path: '/home/u/.claude/projects/slug/real.jsonl'
      })
    ).toEqual({
      key: 'session_id',
      id: 'cs',
      transcriptPath: '/home/u/.claude/projects/slug/real.jsonl'
    })
    expect(
      extractAgentProviderSession('codex', { session_id: 'xs', transcriptPath: '/x/r.jsonl' })
    ).toEqual({ key: 'session_id', id: 'xs', transcriptPath: '/x/r.jsonl' })
  })

  it('does not attach transcript_path for non-native-chat agents', () => {
    expect(
      extractAgentProviderSession('gemini', { session_id: 'gs', transcript_path: '/x/r.jsonl' })
    ).toEqual({ key: 'session_id', id: 'gs' })
  })

  it('round-trips transcriptPath through normalizeAgentProviderSession', () => {
    expect(
      normalizeAgentProviderSession({ key: 'session_id', id: 'ok', transcriptPath: '/x/r.jsonl' })
    ).toEqual({ key: 'session_id', id: 'ok', transcriptPath: '/x/r.jsonl' })
    expect(
      normalizeAgentProviderSession({
        key: 'session_id',
        id: 'ok',
        transcriptPath: '/tmp/bad\npath.jsonl'
      })
    ).toEqual({ key: 'session_id', id: 'ok' })
  })
})

describe('agent conversation forking', () => {
  const claudeSession = { key: 'session_id', id: 'c0ffee00-1111-4222-8333-444455556666' } as const

  it('appends --fork-session after the session id so claude mints a new one', () => {
    expect(getAgentForkResumeArgv('claude', claudeSession)).toEqual([
      'claude',
      '--resume',
      'c0ffee00-1111-4222-8333-444455556666',
      '--fork-session'
    ])
  })

  // Why: waking a hibernated pane resumes the SAME conversation. A --fork-session
  // leaking into the default argv would silently branch it on every wake.
  it('leaves the plain resume argv free of any fork flag', () => {
    expect(getAgentResumeArgv('claude', claudeSession)).toEqual([
      'claude',
      '--resume',
      'c0ffee00-1111-4222-8333-444455556666'
    ])
  })

  it.each(RESUMABLE_TUI_AGENTS.filter((agent) => agent !== 'claude'))(
    'refuses to fork %s, which has no flag that mints a new session id',
    (agent) => {
      expect(
        getAgentForkResumeArgv(agent, { key: 'session_id', id: 's1', transcriptPath: '/tmp/s' })
      ).toBeNull()
    }
  )

  it('refuses to fork claude when the provider reports a conversation id', () => {
    expect(getAgentForkResumeArgv('claude', { key: 'conversation_id', id: 's1' })).toBeNull()
  })

  // Why: the fork argv travels as one string and the launcher re-splits it, so an
  // id that is not a single bare word would resume the wrong id or fail to launch.
  it.each(['two words', "quo'te", 'semi;colon', '$(echo hi)', ''])(
    'refuses to fork a session id that is not one bare word: %j',
    (id) => {
      expect(getAgentForkResumeArgv('claude', { key: 'session_id', id })).toBeNull()
      expect(canForkAgentConversation('claude', { key: 'session_id', id })).toBe(false)
    }
  )

  it.each([
    ['claude with a session id', 'claude', claudeSession, true],
    ['claude without a session', 'claude', null, false],
    ['claude with a conversation id', 'claude', { key: 'conversation_id', id: 's1' }, false],
    ['claude with a non-bare session id', 'claude', { key: 'session_id', id: 'a b' }, false],
    ['codex with a session id', 'codex', claudeSession, false],
    ['an unknown agent', undefined, claudeSession, false]
  ] as const)('reports %s as forkable=%s', (_label, agent, providerSession, expected) => {
    expect(canForkAgentConversation(agent, providerSession)).toBe(expected)
  })
})
