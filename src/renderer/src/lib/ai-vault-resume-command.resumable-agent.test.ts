import { describe, expect, it, vi } from 'vitest'
import type { AppState } from '@/store/types'
import {
  buildAiVaultResumeCopyCommandForWorktree,
  buildAiVaultResumeStartupForWorktree
} from './ai-vault-resume-command'

vi.mock('@/lib/new-workspace', () => ({
  CLIENT_PLATFORM: 'darwin'
}))

type ResumableAgentState = Parameters<typeof buildAiVaultResumeStartupForWorktree>[0]['state']

function makeState(): ResumableAgentState {
  return {
    activeRepoId: 'repo-1',
    activeWorktreeId: 'repo-1::worktree-1',
    detectedWorktreesByRepo: {},
    folderWorkspaces: [],
    projectGroups: [],
    repos: [{ id: 'repo-1', path: '/Users/ada/repo' }],
    projects: [{ id: 'repo-1', sourceRepoIds: ['repo-1'] }],
    settings: {
      agentDefaultArgs: { claude: '', codex: '' },
      agentDefaultEnv: { claude: {}, codex: {} }
    },
    worktreesByRepo: {
      'repo-1': [{ id: 'repo-1::worktree-1', repoId: 'repo-1', path: '/Users/ada/repo' }]
    }
  } as unknown as ResumableAgentState
}

const KIMI_SESSION = {
  agent: 'kimi' as const,
  sessionId: 'session_431324d7-2165-42f0-9ecd-9f93437b3201',
  cwd: '/Users/ada/repo/packages/api',
  codexHome: null
}

describe('AI Vault resume for Kimi', () => {
  it('keeps the cd prefix on the copied resume line', () => {
    // Why: Kimi sessions are work-dir-scoped — resuming from the worktree root instead of the
    // session's own cwd fails with "created under a different directory".
    expect(
      buildAiVaultResumeCopyCommandForWorktree({
        state: makeState(),
        worktreeId: 'repo-1::worktree-1',
        session: KIMI_SESSION
      })
    ).toBe(
      "cd '/Users/ada/repo/packages/api' && kimi '--yolo' '--session' 'session_431324d7-2165-42f0-9ecd-9f93437b3201'"
    )
  })

  it('takes the resumable-agent startup plan so the pane claims the provider session', () => {
    // Why: the plan branch applies Kimi's default launch args, so a resumed pane starts with the
    // same permission flag Orca gives a fresh one.
    expect(
      buildAiVaultResumeStartupForWorktree({
        state: makeState(),
        worktreeId: 'repo-1::worktree-1',
        session: KIMI_SESSION
      })
    ).toMatchObject({
      command: "kimi '--yolo' '--session' 'session_431324d7-2165-42f0-9ecd-9f93437b3201'",
      cwd: '/Users/ada/repo/packages/api',
      launchConfig: { agentCommand: "kimi '--yolo'" },
      providerSession: {
        key: 'session_id',
        id: 'session_431324d7-2165-42f0-9ecd-9f93437b3201'
      }
    })
  })
})

describe('AI Vault resume for an OpenCode 2 row', () => {
  it('launches stable 2.x chats with opencode and keeps beta chats on opencode2', () => {
    const launch = (dbName: string, detectedAgentIds: AppState['detectedAgentIds']) => {
      const startup = buildAiVaultResumeStartupForWorktree({
        state: { ...makeState(), detectedAgentIds },
        worktreeId: 'repo-1::worktree-1',
        session: {
          agent: 'opencode2',
          sessionId: 'ses_1',
          cwd: '/Users/ada/repo',
          codexHome: null,
          filePath: `/Users/ada/.local/share/opencode/${dbName}`
        }
      })
      return { command: startup.command, agent: startup.agent }
    }
    expect({
      stable: launch('opencode.db', ['claude', 'opencode']),
      betaDetected: launch('opencode.db', ['opencode', 'opencode2']),
      betaStore: launch('opencode-next.db', ['opencode']),
      detectionUnknown: launch('opencode.db', null)
    }).toEqual({
      stable: { command: "opencode '--session' 'ses_1'", agent: 'opencode' },
      betaDetected: BETA_LAUNCH,
      betaStore: BETA_LAUNCH,
      detectionUnknown: BETA_LAUNCH
    })
  })
})

const BETA_LAUNCH = {
  command: "opencode2 --standalone '--session' 'ses_1'",
  agent: undefined
}
