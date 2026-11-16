import type { GlobalSettings } from '../../shared/global-settings-types'
import type { CodexForkContext } from '../../shared/codex-fork-context'
import { getCodexPaneAccount, type CodexPaneAccountRecord } from './codex-pane-account-registry'
import { getSystemCodexHomePath, resolveOrcaManagedCodexHomePath } from './codex-home-paths'
import { resolveCodexCommand } from '../codex-cli/command'
import { execLocalPreflightCommandOrThrow } from '../ipc/preflight-command-exec'
import { buildLocalPreflightEnv } from '../ipc/preflight-local-env'
import { resolveStartupShell, tokenizeStartupCommand } from '../../shared/tui-agent-startup-shell'

type SourceCodexHome = {
  codexHome: string
}

const capabilityCache = new Map<string, Promise<boolean>>()

function sourceCodexHome(
  record: CodexPaneAccountRecord,
  settings: GlobalSettings
): SourceCodexHome | null {
  if (record.selectionKey !== 'host') {
    return null
  }

  switch (record.homeRoute) {
    case 'real-home':
      return { codexHome: getSystemCodexHomePath() }
    case 'shared-home':
      return { codexHome: resolveOrcaManagedCodexHomePath() }
    case 'account-home': {
      const account = settings.codexManagedAccounts?.find(
        (candidate) => candidate.id === record.accountId
      )
      if (!account || account.managedHomeRuntime === 'wsl') {
        return null
      }
      return { codexHome: account.managedHomePath }
    }
    case 'wsl-home':
    case undefined:
      return null
  }
}

async function supportsCodexFork(command: string, sourceHome: SourceCodexHome): Promise<boolean> {
  const key = JSON.stringify([command, sourceHome.codexHome])
  const existing = capabilityCache.get(key)
  if (existing) {
    return existing
  }
  // The preflight runner replaces its base env when given one, so carry it explicitly.
  const probe = execLocalPreflightCommandOrThrow(command, ['fork', '--help'], {
    env: {
      ...(buildLocalPreflightEnv() ?? process.env),
      CODEX_HOME: sourceHome.codexHome,
      ORCA_CODEX_HOME: sourceHome.codexHome
    }
  })
    .then(() => true)
    .catch(() => false)
  capabilityCache.set(key, probe)
  return probe
}

function resolveProbeCommand(command: string | null | undefined): string {
  const trimmed = command?.trim()
  if (!trimmed) {
    return resolveCodexCommand()
  }
  const tokenized = tokenizeStartupCommand(trimmed, resolveStartupShell(process.platform))
  if (tokenized.ok) {
    const commandToken = tokenized.tokens.find((token) => token !== '&')
    if (commandToken) {
      return commandToken
    }
  }
  return resolveCodexCommand()
}

export async function getLocalCodexForkContext(
  ptyId: string | null | undefined,
  settings: GlobalSettings,
  command?: string | null
): Promise<CodexForkContext> {
  if (!ptyId) {
    return { status: 'unavailable', reason: 'source-account-unavailable' }
  }
  const record = getCodexPaneAccount(ptyId)
  if (!record || record.selectionKey !== 'host') {
    return { status: 'unavailable', reason: 'not-local' }
  }
  const sourceHome = sourceCodexHome(record, settings)
  if (!sourceHome) {
    return { status: 'unavailable', reason: 'source-account-unavailable' }
  }
  const codexCommand = resolveProbeCommand(command)
  if (!(await supportsCodexFork(codexCommand, sourceHome))) {
    return { status: 'unavailable', reason: 'unsupported-cli' }
  }
  return {
    status: 'available',
    env: {
      CODEX_HOME: sourceHome.codexHome,
      ORCA_CODEX_HOME: sourceHome.codexHome
    }
  }
}

/** @internal - isolate capability state between tests and after CLI changes. */
export function resetCodexForkCapabilityCache(): void {
  capabilityCache.clear()
}
