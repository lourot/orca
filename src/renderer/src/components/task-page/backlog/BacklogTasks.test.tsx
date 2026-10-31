// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { BacklogTasks } from './BacklogTasks'
import { TooltipProvider } from '@/components/ui/tooltip'
import { callBacklog } from '@/lib/backlog-task-source'
import { getRepoWorkspaceCreationTargetHint } from '@/lib/project-host-workspace-target'
import type * as BacklogSource from '@/lib/backlog-task-source'
import type { Repo } from '../../../../../shared/repo-types'
import type { RuntimeEnvironmentStatus } from '../../../../../shared/runtime-host-status'
import { BACKLOG_TASKS_CAPABILITY } from '../../../../../shared/backlog-capability'
import { BACKLOG_NOT_SAVED_CODE, BacklogReply } from '../../../../../shared/backlog-types'
import { RuntimeRpcCallError } from '@/runtime/runtime-rpc-result'

const mocks = vi.hoisted(
  (): {
    openModal: ReturnType<typeof vi.fn>
    updateSettings: ReturnType<typeof vi.fn>
    settings: { defaultBacklogProject: string | null } & Partial<
      Record<'backlogNewTaskPriority' | 'backlogNewTaskAssignees' | 'backlogNewTaskLabels', string>
    >
    repos: Repo[]
    projectHostSetups: []
    runtimeStatusByEnvironmentId: Map<string, RuntimeEnvironmentStatus>
  } => ({
    openModal: vi.fn(),
    updateSettings: vi.fn(),
    settings: { defaultBacklogProject: null },
    runtimeStatusByEnvironmentId: new Map<string, RuntimeEnvironmentStatus>(),
    projectHostSetups: [],
    repos: [
      {
        id: 'folder',
        path: '/folder',
        kind: 'folder',
        displayName: 'Folder project',
        addedAt: 0,
        badgeColor: ''
      }
    ] satisfies Repo[]
  })
)
vi.mock('@/store', () => ({
  useAppStore: Object.assign((select: (state: unknown) => unknown) => select(mocks), {
    getState: () => mocks
  })
}))
vi.mock('@/lib/backlog-task-source', async (original) => ({
  ...(await original<typeof BacklogSource>()),
  callBacklog: vi.fn()
}))
vi.mock('../../task-page-source-context', () => ({
  getTaskPageRepoSourceContext: () => ({
    kind: 'task-source',
    provider: 'backlog',
    projectId: 'folder',
    repoId: 'folder',
    hostId: 'local'
  })
}))

// Parsing fills the field defaults a real reply carries.
const list = BacklogReply.parse({
  projectPath: '/folder',
  projectName: 'Folder project',
  statuses: ['Inbox', 'Review'],
  tasks: [{ id: 'OPS-007', title: 'Task title', status: 'Review' }],
  total: 1,
  mutationUnavailable: null
})
/** A read reply with every optional field defaulted. */
function detail(fields: Record<string, unknown>): BacklogReply {
  return BacklogReply.parse({ id: 'OPS-007', title: 'Task title', description: '', ...fields })
}
// The loaded field values the editor echoes as `base`; unchanged fields themselves are not sent.
const noFields = {
  priority: '',
  type: '',
  dueDate: '',
  assignees: [],
  labels: [],
  dependencies: [],
  references: []
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.repos = [
    {
      id: 'folder',
      path: '/folder',
      kind: 'folder',
      displayName: 'Folder project',
      addedAt: 0,
      badgeColor: ''
    }
  ]
  mocks.runtimeStatusByEnvironmentId = new Map()
  mocks.settings = { defaultBacklogProject: null }
  mocks.updateSettings.mockResolvedValue(undefined)
  vi.mocked(callBacklog).mockResolvedValue(list)
})
afterEach(cleanup)

describe('Backlog Tasks UI', () => {
  it('colours each row, greys Done ones, and opens a blocker from its chip', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 31, 12))
    try {
      vi.mocked(callBacklog).mockResolvedValue(
        BacklogReply.parse({
          projectPath: '/folder',
          projectName: 'Folder project',
          statuses: ['To Do', 'In Progress', 'Done'],
          tasks: [
            {
              id: 'T-1',
              title: 'Open',
              status: 'To Do',
              priority: 'high',
              type: 'bug',
              dueDate: '2026-10-30',
              blockedBy: ['T-9']
            },
            { id: 'T-2', title: 'Going', status: 'In Progress' },
            { id: 'T-3', title: 'Shipped', status: 'Done', dueDate: '2026-10-30' }
          ],
          total: 3,
          mutationUnavailable: null
        })
      )
      render(
        <TooltipProvider>
          <BacklogTasks />
        </TooltipProvider>
      )
      const open = await screen.findByRole('button', { name: /T-1/ })
      const going = screen.getByRole('button', { name: /T-2/ })
      const shipped = screen.getByRole('button', { name: /T-3/ })
      const pill = (row: HTMLElement, status: string) => within(row).getByText(status).className
      expect(
        new Set([pill(open, 'To Do'), pill(going, 'In Progress'), pill(shipped, 'Done')]).size
      ).toBe(3)
      expect(within(open).getByText('high')).toHaveClass('text-jira-priority-high')
      expect(within(open).getByRole('img', { name: 'bug' })).toBeInTheDocument()
      expect(within(open).getByLabelText(/^Overdue, due/)).toHaveClass('text-destructive')
      expect(within(shipped).getByLabelText(/^Due /)).not.toHaveClass('text-destructive')
      expect(within(shipped).getByText('Shipped')).toHaveClass('text-muted-foreground')
      expect(within(open).getByText('Open')).not.toHaveClass('text-muted-foreground')
      expect(screen.queryAllByRole('button', { name: /^Open T-/ })).toHaveLength(1)
      const blocker = screen.getByRole('button', { name: 'Open T-9' })
      expect(blocker).toHaveClass('text-destructive')
      vi.mocked(callBacklog).mockClear()
      fireEvent.click(blocker)
      await waitFor(() =>
        expect(callBacklog).toHaveBeenCalledWith(expect.anything(), { kind: 'read', id: 'T-9' })
      )
      expect(callBacklog).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
  it('browses details and seeds the existing workspace composer without launching an agent', async () => {
    render(<BacklogTasks />)
    const row = await screen.findByRole('button', { name: /OPS-007/ })
    vi.mocked(callBacklog).mockResolvedValueOnce(
      detail({ status: 'Review', description: 'Description', body: 'Acceptance criteria' })
    )
    fireEvent.click(row)
    expect(await screen.findByText('Acceptance criteria')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Start workspace' }))
    expect(mocks.openModal).toHaveBeenCalledWith(
      'new-workspace-composer',
      expect.objectContaining({
        initialRepoId: 'folder',
        taskSourceContext: expect.objectContaining({ provider: 'backlog', hostId: 'local' }),
        backlogTaskPrompt: expect.stringContaining('OPS-007')
      })
    )
  })
  it('targets the project named by a repo: label instead of the board project', async () => {
    const orca: Repo = { ...mocks.repos[0], id: 'orca', path: '/orca', displayName: 'orca' }
    mocks.repos = [...mocks.repos, orca]
    render(<BacklogTasks />)
    const row = await screen.findByRole('button', { name: /OPS-007/ })
    vi.mocked(callBacklog).mockResolvedValueOnce(
      detail({ status: 'Review', body: 'Details', labels: ['work', 'repo:orca'] })
    )
    fireEvent.click(row)
    await screen.findByText('Details')
    fireEvent.click(screen.getByRole('button', { name: 'Start workspace' }))
    // The composer seeds from the task source (the board) unless given an explicit target.
    expect(mocks.openModal).toHaveBeenCalledWith(
      'new-workspace-composer',
      expect.objectContaining({
        initialRepoId: 'orca',
        initialWorkspaceTarget: getRepoWorkspaceCreationTargetHint(orca, []),
        taskSourceContext: expect.objectContaining({ repoId: 'folder' })
      })
    )
  })
  it.each(['Legacy', 'Review'])(
    'edits a legacy task with an explicit status choice of %s',
    async (status) => {
      render(<BacklogTasks />)
      const row = await screen.findByRole('button', { name: /OPS-007/ })
      vi.mocked(callBacklog).mockResolvedValueOnce(
        detail({ status: 'Legacy', description: 'Description', body: 'Details' })
      )
      fireEvent.click(row)
      await screen.findByText('Details')
      fireEvent.click(screen.getByRole('button', { name: 'Edit task' }))
      expect(screen.getByRole('combobox', { name: 'Task status' })).toHaveTextContent(
        'Legacy (not configured)'
      )
      fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'New title' } })
      if (status === 'Review') {
        fireEvent.click(screen.getByRole('combobox', { name: 'Task status' }))
        fireEvent.click(await screen.findByRole('option', { name: 'Review' }))
      }
      expect(screen.getByRole('button', { name: 'Save task' })).toBeEnabled()
      vi.mocked(callBacklog).mockResolvedValueOnce({ saved: true })
      fireEvent.click(screen.getByRole('button', { name: 'Save task' }))
      await waitFor(() =>
        expect(callBacklog).toHaveBeenCalledWith(expect.anything(), {
          kind: 'edit',
          id: 'OPS-007',
          title: 'New title',
          description: 'Description',
          status,
          base: { title: 'Task title', description: 'Description', status: 'Legacy', ...noFields }
        })
      )
    }
  )
  it('selects the first supported project and excludes unsupported runtime projects', async () => {
    const local = mocks.repos[0]
    mocks.repos = [
      { ...local, id: 'old', displayName: 'Old host', executionHostId: 'runtime:old' },
      local
    ]
    render(<BacklogTasks />)
    await screen.findByRole('button', { name: /OPS-007/ })
    expect(callBacklog).toHaveBeenCalledWith(local, expect.objectContaining({ kind: 'list' }))
    expect(screen.getByRole('combobox', { name: 'Backlog project' })).toHaveTextContent(
      'Folder project'
    )
    fireEvent.click(screen.getByRole('combobox', { name: 'Backlog project' }))
    expect(screen.queryByRole('option', { name: /Old host/ })).toBeNull()
  })
  it('reopens on the remembered project and remembers a new choice', async () => {
    const first = mocks.repos[0]
    const board = { ...first, id: 'board', path: '/board', displayName: 'Board' }
    mocks.repos = [first, board]
    mocks.settings = { defaultBacklogProject: 'board' }
    render(<BacklogTasks />)
    await screen.findByRole('button', { name: /OPS-007/ })
    expect(callBacklog).toHaveBeenCalledWith(board, expect.objectContaining({ kind: 'list' }))
    expect(callBacklog).not.toHaveBeenCalledWith(first, expect.anything())
    fireEvent.click(screen.getByRole('combobox', { name: 'Backlog project' }))
    fireEvent.click(await screen.findByRole('option', { name: /Folder project/ }))
    expect(mocks.updateSettings).toHaveBeenCalledWith({ defaultBacklogProject: 'folder' })
  })
  it('withdraws tasks when runtime capability is lost and guards a stale start handler', async () => {
    mocks.repos = [{ ...mocks.repos[0], executionHostId: 'runtime:remote' }]
    mocks.runtimeStatusByEnvironmentId.set('remote', {
      checkedAt: 0,
      status: {
        runtimeId: 'remote',
        rendererGraphEpoch: 1,
        graphStatus: 'ready',
        authoritativeWindowId: 1,
        liveTabCount: 0,
        liveLeafCount: 0,
        runtimeProtocolVersion: 1,
        minCompatibleRuntimeClientVersion: 1,
        capabilities: [BACKLOG_TASKS_CAPABILITY]
      }
    })
    const view = render(<BacklogTasks />)
    const row = await screen.findByRole('button', { name: /OPS-007/ })
    vi.mocked(callBacklog).mockResolvedValueOnce(detail({ status: 'Review', body: 'Details' }))
    fireEvent.click(row)
    await screen.findByText('Details')
    mocks.runtimeStatusByEnvironmentId = new Map()
    fireEvent.click(screen.getByRole('button', { name: 'Start workspace' }))
    expect(mocks.openModal).not.toHaveBeenCalled()
    view.rerender(<BacklogTasks />)
    expect(screen.queryByRole('button', { name: 'Start workspace' })).toBeNull()
    expect(screen.getByText(/Update the project’s Orca server/)).toBeInTheDocument()
  })
  it('opens a related task from the detail', async () => {
    render(<BacklogTasks />)
    const row = await screen.findByRole('button', { name: /OPS-007/ })
    vi.mocked(callBacklog).mockResolvedValueOnce(
      detail({
        status: 'Review',
        body: 'Details',
        dependencies: ['OPS-001'],
        links: [{ id: 'OPS-001', title: 'Prerequisite', status: 'Inbox' }]
      })
    )
    fireEvent.click(row)
    vi.mocked(callBacklog).mockResolvedValueOnce(
      detail({ id: 'OPS-001', title: 'Prerequisite', status: 'Inbox', body: 'First' })
    )
    fireEvent.click(await screen.findByRole('button', { name: /OPS-001.*Prerequisite/ }))
    await screen.findByText('First')
    expect(callBacklog).toHaveBeenLastCalledWith(expect.anything(), { kind: 'read', id: 'OPS-001' })
  })
  it('edits only title, description and status on a host without the fields capability', async () => {
    mocks.repos = [{ ...mocks.repos[0], executionHostId: 'runtime:remote' }]
    mocks.runtimeStatusByEnvironmentId.set('remote', {
      checkedAt: 0,
      status: {
        runtimeId: 'remote',
        rendererGraphEpoch: 1,
        graphStatus: 'ready',
        authoritativeWindowId: 1,
        liveTabCount: 0,
        liveLeafCount: 0,
        runtimeProtocolVersion: 1,
        minCompatibleRuntimeClientVersion: 1,
        capabilities: [BACKLOG_TASKS_CAPABILITY]
      }
    })
    render(<BacklogTasks />)
    await screen.findByRole('button', { name: /OPS-007/ })
    fireEvent.click(screen.getByRole('button', { name: 'New task' }))
    expect(screen.queryByLabelText('Labels')).toBeNull()
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Remote' } })
    vi.mocked(callBacklog).mockResolvedValueOnce({ saved: true })
    fireEvent.click(screen.getByRole('button', { name: 'Save task' }))
    await waitFor(() =>
      expect(callBacklog).toHaveBeenCalledWith(expect.anything(), {
        kind: 'create',
        title: 'Remote',
        description: '',
        status: 'Inbox'
      })
    )
  })
  it('shows an actionable empty-project state without calling a host', () => {
    mocks.repos = []
    render(<BacklogTasks />)
    expect(
      screen.getByText('Add a project or folder to browse Backlog.md tasks.')
    ).toBeInTheDocument()
    expect(callBacklog).not.toHaveBeenCalled()
  })
  it('creates tasks only through the host call and refreshes after saving', async () => {
    render(<BacklogTasks />)
    await screen.findByRole('button', { name: /OPS-007/ })
    fireEvent.click(screen.getByRole('button', { name: 'New task' }))
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: '--literal title' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Multi\nline' } })
    vi.mocked(callBacklog).mockResolvedValueOnce({ saved: true })
    fireEvent.click(screen.getByRole('button', { name: 'Save task' }))
    await waitFor(() =>
      expect(callBacklog).toHaveBeenCalledWith(expect.objectContaining({ kind: 'folder' }), {
        kind: 'create',
        title: '--literal title',
        description: 'Multi\nline',
        status: 'Inbox'
      })
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
  it('sends the configured new-task defaults with a create', async () => {
    mocks.settings = {
      defaultBacklogProject: null,
      backlogNewTaskPriority: 'low',
      backlogNewTaskAssignees: '@alice',
      backlogNewTaskLabels: 'work, repo:orca'
    }
    render(<BacklogTasks />)
    await screen.findByRole('button', { name: /OPS-007/ })
    fireEvent.click(screen.getByRole('button', { name: 'New task' }))
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Defaults' } })
    vi.mocked(callBacklog).mockResolvedValueOnce({ saved: true })
    fireEvent.click(screen.getByRole('button', { name: 'Save task' }))
    await waitFor(() =>
      expect(callBacklog).toHaveBeenCalledWith(expect.anything(), {
        kind: 'create',
        title: 'Defaults',
        description: '',
        status: 'Inbox',
        priority: 'low',
        assignees: ['@alice'],
        labels: ['work', 'repo:orca']
      })
    )
  })
  it.each(['RPC timeout', 'SSH disconnected'])(
    'prevents resubmission after an ambiguous create: %s',
    async (message) => {
      render(<BacklogTasks />)
      await screen.findByRole('button', { name: /OPS-007/ })
      fireEvent.click(screen.getByRole('button', { name: 'New task' }))
      fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Possibly created' } })
      vi.mocked(callBacklog).mockRejectedValueOnce(new Error(message))
      fireEvent.click(screen.getByRole('button', { name: 'Save task' }))
      expect(await screen.findByRole('alert')).toHaveTextContent(message)
      expect(screen.getByRole('button', { name: 'Save task' })).toBeDisabled()
      fireEvent.submit(screen.getByRole('button', { name: 'Save task' }).closest('form')!)
      expect(
        vi.mocked(callBacklog).mock.calls.filter(([, operation]) => operation.kind === 'create')
      ).toHaveLength(1)
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(screen.getByRole('button', { name: 'New task' })).toBeDisabled()
      fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
      await waitFor(() => expect(screen.getByRole('button', { name: 'New task' })).toBeEnabled())
    }
  )
  it('lets the user retry a save the host refused before writing', async () => {
    render(<BacklogTasks />)
    await screen.findByRole('button', { name: /OPS-007/ })
    fireEvent.click(screen.getByRole('button', { name: 'New task' }))
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Locked' } })
    vi.mocked(callBacklog).mockRejectedValueOnce(
      new RuntimeRpcCallError({
        id: 'rpc-1',
        ok: false,
        error: { code: BACKLOG_NOT_SAVED_CODE, message: 'Nothing was saved; try again.' }
      })
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save task' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Nothing was saved; try again.')
    expect(alert).not.toHaveTextContent('unconfirmed')
    vi.mocked(callBacklog).mockResolvedValueOnce({ saved: true })
    fireEvent.click(screen.getByRole('button', { name: 'Save task' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    // An unconfirmed save would keep New task disabled until an explicit Refresh.
    await waitFor(() => expect(screen.getByRole('button', { name: 'New task' })).toBeEnabled())
  })
  it('shows actionable host errors and no false empty-state success', async () => {
    vi.mocked(callBacklog).mockRejectedValue(new Error('Reconnect SSH host'))
    render(<BacklogTasks />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Reconnect SSH host')
    expect(screen.queryByText('No matching tasks.')).toBeNull()
    expect(screen.getByRole('button', { name: 'New task' })).toBeDisabled()
  })
})
