import { EventEmitter } from 'node:events'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const spawnMock = vi.hoisted(() => vi.fn())
vi.mock('@orca/process-host', () => ({ spawnProcess: spawnMock }))
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))

import { openGitGuiBlame } from './git-gui-blame'

type FakeChild = EventEmitter & { unref: () => void }

function fakeChild(): FakeChild {
  return Object.assign(new EventEmitter(), { unref: vi.fn() })
}

describe('openGitGuiBlame', () => {
  let root: string
  let worktree: string
  let file: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'git-gui-blame-'))
    worktree = join(root, 'repo')
    mkdirSync(join(worktree, 'src'), { recursive: true })
    file = join(worktree, 'src', 'a.ts')
    writeFileSync(file, 'x\n')
    writeFileSync(join(root, 'outside.ts'), 'y\n')
    spawnMock.mockReset()
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('refuses remote owners and files outside the worktree without spawning', async () => {
    expect({
      remote: await openGitGuiBlame({
        filePath: file,
        worktreePath: worktree,
        ownerHostId: 'ssh:box'
      }),
      outside: await openGitGuiBlame({
        filePath: join(root, 'outside.ts'),
        worktreePath: worktree,
        ownerHostId: 'local'
      })
    }).toEqual({
      remote: { ok: false, reason: 'remote-runtime-unsupported' },
      outside: { ok: false, reason: 'outside-worktree' }
    })
    expect(spawnMock).not.toHaveBeenCalled()
  })

  it('runs git gui blame from the worktree on the relative path', async () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    expect(
      await openGitGuiBlame({ filePath: file, worktreePath: worktree, ownerHostId: 'local' }, 0)
    ).toEqual({ ok: true })
    expect(spawnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        program: 'git',
        args: ['gui', 'blame', join('src', 'a.ts')],
        cwd: worktree,
        detached: true
      })
    )
  })

  it('reports a launch failure when git exits at once, as it does without git gui', async () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    const opened = openGitGuiBlame({ filePath: file, worktreePath: worktree, ownerHostId: 'local' })
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalled())
    child.emit('exit', 1)
    expect(await opened).toEqual({ ok: false, reason: 'launch-failed' })
  })
})
