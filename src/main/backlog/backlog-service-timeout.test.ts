import { afterEach, expect, it, vi } from 'vitest'
import { executeBacklogOperation } from './backlog-service'
import { loadBacklogProject, readBacklogTasks } from './backlog-project'
import { runBacklogMutation } from './backlog-cli'
import { BACKLOG_NOT_SAVED_CODE, BACKLOG_OPERATION_TIMEOUT_MS } from '../../shared/backlog-types'
import { BacklogSaveUnconfirmedError } from './backlog-save-outcome'

vi.mock('./backlog-project', () => ({
  loadBacklogProject: vi.fn(),
  readBacklogTasks: vi.fn().mockResolvedValue([]),
  assertBacklogMutationPaths: vi.fn().mockResolvedValue(undefined)
}))
vi.mock('./backlog-cli', () => ({
  backlogMutationUnavailable: vi.fn().mockReturnValue(null),
  resolveBacklogCli: vi.fn(),
  runBacklogMutation: vi.fn()
}))
const project = {
  root: '/project',
  backlogPath: '/project/backlog',
  projectName: 'Test',
  statuses: ['Inbox'],
  priorities: ['High'],
  types: ['task'],
  config: { statuses: ['Inbox'], priorities: ['High'], types: ['task'] },
  unsafeCliConfig: false,
  configMatchesCli: true
}
const create = { kind: 'create', title: 'Task', description: '', status: 'Inbox' } as const

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

it('bounds scanning and never starts a late mutation after the overall deadline', async () => {
  vi.useFakeTimers()
  let release: (value: typeof project) => void = () => {}
  vi.mocked(loadBacklogProject).mockReturnValueOnce(
    new Promise((resolve) => {
      release = resolve
    })
  )
  const result = expect(executeBacklogOperation('/project', create)).rejects.toThrow(
    'Completion is unconfirmed'
  )
  await vi.advanceTimersByTimeAsync(BACKLOG_OPERATION_TIMEOUT_MS)
  await result
  release(project)
  await vi.advanceTimersByTimeAsync(0)
  expect(readBacklogTasks).toHaveBeenCalledOnce()
  expect(runBacklogMutation).not.toHaveBeenCalled()
})

it('aborts an in-flight command at the overall deadline without retrying', async () => {
  vi.useFakeTimers()
  vi.mocked(loadBacklogProject).mockResolvedValueOnce(project)
  vi.mocked(runBacklogMutation).mockImplementationOnce(
    async (_project, _operation, _previous, signal) => {
      await new Promise<void>((resolve) =>
        signal.addEventListener('abort', () => resolve(), { once: true })
      )
    }
  )
  const result = expect(executeBacklogOperation('/project', create)).rejects.toThrow(
    'Completion is unconfirmed'
  )
  await vi.advanceTimersByTimeAsync(BACKLOG_OPERATION_TIMEOUT_MS)
  await result
  expect(runBacklogMutation).toHaveBeenCalledOnce()
  expect(vi.mocked(runBacklogMutation).mock.calls[0][3].aborted).toBe(true)
})

it.each([
  [
    'a refusal before the CLI ran',
    new Error('A title and a configured status are required.'),
    true
  ],
  ['a CLI run that did not confirm', new BacklogSaveUnconfirmedError('Backlog CLI exited 1'), false]
])('marks only certain no-writes as not saved: %s', async (_case, failure, notSaved) => {
  vi.mocked(loadBacklogProject).mockResolvedValueOnce(project)
  vi.mocked(runBacklogMutation).mockRejectedValueOnce(failure)
  const error = await executeBacklogOperation('/project', create).catch((caught: unknown) => caught)
  expect(error).toHaveProperty('message', failure.message)
  expect(error instanceof Error && 'code' in error && error.code === BACKLOG_NOT_SAVED_CODE).toBe(
    notSaved
  )
})
