import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { GlobalSettings } from '../../shared/global-settings-types'
import { createGlobalSettingsFixture } from '../../shared/global-settings-test-fixture'
import {
  forgetCodexPaneAccount,
  recordCodexPaneAccount,
  _internals
} from './codex-pane-account-registry'

const { execLocalPreflightCommandOrThrowMock, resolveCodexCommandMock } = vi.hoisted(() => ({
  execLocalPreflightCommandOrThrowMock: vi.fn(),
  resolveCodexCommandMock: vi.fn(() => '/usr/local/bin/codex')
}))

vi.mock('../ipc/preflight-command-exec', () => ({
  execLocalPreflightCommandOrThrow: execLocalPreflightCommandOrThrowMock
}))

vi.mock('../codex-cli/command', () => ({
  resolveCodexCommand: resolveCodexCommandMock
}))

import { getLocalCodexForkContext, resetCodexForkCapabilityCache } from './codex-fork-context'

function settings(): GlobalSettings {
  return createGlobalSettingsFixture({
    codexManagedAccounts: [
      {
        id: 'account-a',
        email: 'a@example.test',
        managedHomePath: '/accounts/a/home',
        createdAt: 1,
        updatedAt: 1,
        lastAuthenticatedAt: 1
      }
    ]
  })
}

describe('local Codex fork context', () => {
  let userDataPath: string

  beforeEach(() => {
    userDataPath = mkdtempSync(join(tmpdir(), 'orca-codex-fork-context-'))
    process.env.ORCA_USER_DATA_PATH = userDataPath
    _internals.resetCache()
    resetCodexForkCapabilityCache()
    execLocalPreflightCommandOrThrowMock.mockReset()
    execLocalPreflightCommandOrThrowMock.mockResolvedValue({ stdout: 'usage', stderr: '' })
    resolveCodexCommandMock.mockReturnValue('/usr/local/bin/codex')
  })

  afterEach(() => {
    forgetCodexPaneAccount('pty-1')
    _internals.resetCache()
    resetCodexForkCapabilityCache()
    rmSync(userDataPath, { recursive: true, force: true })
    delete process.env.ORCA_USER_DATA_PATH
  })

  it('probes and preserves a source managed account home', async () => {
    recordCodexPaneAccount('pty-1', {
      selectionKey: 'host',
      accountId: 'account-a',
      homeRoute: 'account-home'
    })

    await expect(getLocalCodexForkContext('pty-1', settings())).resolves.toEqual({
      status: 'available',
      env: {
        CODEX_HOME: '/accounts/a/home',
        ORCA_CODEX_HOME: '/accounts/a/home'
      }
    })
    expect(execLocalPreflightCommandOrThrowMock).toHaveBeenCalledWith(
      '/usr/local/bin/codex',
      ['fork', '--help'],
      {
        env: expect.objectContaining({
          CODEX_HOME: '/accounts/a/home',
          ORCA_CODEX_HOME: '/accounts/a/home'
        })
      }
    )
  })

  it('pins the source system Codex home for a real-home pane', async () => {
    recordCodexPaneAccount('pty-1', {
      selectionKey: 'host',
      accountId: null,
      homeRoute: 'real-home'
    })

    await expect(getLocalCodexForkContext('pty-1', settings())).resolves.toEqual({
      status: 'available',
      env: {
        CODEX_HOME: expect.any(String),
        ORCA_CODEX_HOME: expect.any(String)
      }
    })
  })

  it('blocks non-local or unsupported Codex sessions', async () => {
    recordCodexPaneAccount('pty-1', {
      selectionKey: 'wsl:Ubuntu',
      accountId: null,
      homeRoute: 'wsl-home'
    })
    await expect(getLocalCodexForkContext('pty-1', settings())).resolves.toEqual({
      status: 'unavailable',
      reason: 'not-local'
    })

    recordCodexPaneAccount('pty-1', {
      selectionKey: 'host',
      accountId: 'account-a',
      homeRoute: 'account-home'
    })
    execLocalPreflightCommandOrThrowMock.mockRejectedValueOnce(new Error('unknown command'))
    resetCodexForkCapabilityCache()
    await expect(getLocalCodexForkContext('pty-1', settings())).resolves.toEqual({
      status: 'unavailable',
      reason: 'unsupported-cli'
    })
  })
})
