import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  RollingAgentTitleArgs,
  RollingAgentTitleResult
} from '../../../shared/rolling-agent-title'

type RollingTitleHandler = (
  event: unknown,
  args: RollingAgentTitleArgs
) => Promise<RollingAgentTitleResult>

const {
  handlers,
  resolveTextGenerationParams,
  generateBranchNameFromContext,
  resolveGenerationTarget,
  resolveModelDiscoveryLocalPath
} = vi.hoisted(() => ({
  handlers: new Map<string, RollingTitleHandler>(),
  resolveTextGenerationParams: vi.fn(),
  generateBranchNameFromContext: vi.fn(),
  resolveGenerationTarget: vi.fn(),
  resolveModelDiscoveryLocalPath: vi.fn()
}))
vi.mock('electron', () => ({
  ipcMain: {
    handle: (name: string, handler: RollingTitleHandler) => handlers.set(name, handler)
  }
}))
vi.mock('../../text-generation/commit-message-text-generation', () => ({
  resolveTextGenerationParams,
  generateBranchNameFromContext
}))
vi.mock('../../agent-hooks/first-work-generation-target', () => ({ resolveGenerationTarget }))
vi.mock('./filesystem-source-control-ai-targets', () => ({
  getRepoForSourceControlAi: () => Promise.resolve(null),
  resolveModelDiscoveryLocalPath
}))

import { registerFilesystemAgentRollingTitleHandlers } from './filesystem-agent-rolling-title-handlers'
import type { FilesystemHandlerContext } from './filesystem-handler-context'

const LOCAL_TARGET = { kind: 'local' as const, cwd: '/resolved/wt' }

function invoke(args: {
  worktreePath?: string
  prompt?: string
  assistantMessage?: string
  connectionId?: string
}): Promise<RollingAgentTitleResult> {
  return handlers.get('agentStatus:generateRollingTitle')!(null, {
    worktreePath: '/repo/wt',
    prompt: 'Make the sidebar label follow the conversation',
    ...args
  })
}

beforeEach(() => {
  handlers.clear()
  for (const mock of [
    resolveTextGenerationParams,
    generateBranchNameFromContext,
    resolveGenerationTarget,
    resolveModelDiscoveryLocalPath
  ]) {
    mock.mockReset()
  }
  resolveTextGenerationParams.mockReturnValue({ ok: true, params: { agentId: 'claude' } })
  resolveModelDiscoveryLocalPath.mockResolvedValue('/resolved/wt')
  resolveGenerationTarget.mockResolvedValue(LOCAL_TARGET)
  generateBranchNameFromContext.mockResolvedValue({ success: true, slug: 'wire-resolver-tier' })
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: getRepoForSourceControlAi is mocked out, so the handler only ever calls store.getSettings().
  const context = { store: { getSettings: () => ({}) } } as unknown as FilesystemHandlerContext
  registerFilesystemAgentRollingTitleHandlers(context)
})

describe('agentStatus:generateRollingTitle', () => {
  it('humanizes the generated slug and summarizes the turn from the resolved local path', async () => {
    const result = await invoke({ assistantMessage: 'Added the resolver tier.' })
    expect(result).toEqual({ success: true, title: 'Wire resolver tier' })
    expect(generateBranchNameFromContext).toHaveBeenCalledWith(
      {
        firstPrompt: 'Make the sidebar label follow the conversation',
        assistantMessage: 'Added the resolver tier.'
      },
      { agentId: 'claude' },
      LOCAL_TARGET
    )
    expect(resolveGenerationTarget).toHaveBeenCalledWith('/resolved/wt', 'claude', {
      getAgentEnvResolvers: expect.any(Function)
    })
  })

  it("surfaces the resolver's own error and never spawns an agent", async () => {
    resolveTextGenerationParams.mockReturnValue({ ok: false, error: 'No branch-name agent set.' })
    expect(await invoke({})).toEqual({ success: false, error: 'No branch-name agent set.' })
    expect(generateBranchNameFromContext).not.toHaveBeenCalled()
  })

  it('refuses an SSH workspace without reading a local path or spawning an agent', async () => {
    const result = await invoke({ connectionId: 'ssh-1' })
    expect({
      result,
      localPathReads: resolveModelDiscoveryLocalPath.mock.calls.length,
      spawned: generateBranchNameFromContext.mock.calls.length
    }).toEqual({
      result: { success: false, error: 'Rolling titles are not available for SSH workspaces.' },
      localPathReads: 0,
      spawned: 0
    })
  })

  it('reports failures without inventing a title', async () => {
    generateBranchNameFromContext.mockResolvedValue({ success: false, error: 'claude exited 1' })
    const generationFailed = await invoke({})
    generateBranchNameFromContext.mockResolvedValue({ success: true, slug: '' })
    const emptySlug = await invoke({})
    resolveGenerationTarget.mockResolvedValue(null)
    const noTarget = await invoke({})
    const blankPrompt = await invoke({ prompt: '   ' })

    expect({ generationFailed, emptySlug, noTarget, blankPrompt }).toEqual({
      generationFailed: { success: false, error: 'claude exited 1' },
      emptySlug: { success: false, error: 'Generated an empty title.' },
      noTarget: { success: false, error: 'Could not prepare the title generation environment.' },
      blankPrompt: { success: false, error: 'No prompt to summarize.' }
    })
  })
})
