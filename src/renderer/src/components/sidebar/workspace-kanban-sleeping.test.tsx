// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { makeRepo, makeTerminalTab, makeWorktree } from '../worktree-jump-palette-test-fixtures'
import { useWorkspaceKanbanBoardProjection } from './use-workspace-kanban-board-projection'
import { useWorkspaceKanbanWorktreeActions } from './use-workspace-kanban-worktree-actions'
import {
  getDropTarget,
  resolveWorkspaceKanbanCardDropCommitTarget
} from './workspace-kanban-card-pointer-drag-dom'

const initialState = useAppStore.getInitialState()
const repo = makeRepo()
const worktree = makeWorktree('sleep-test', 'Sleep test', { workspaceStatus: 'in-review' })
const tab = makeTerminalTab('sleep-tab', worktree.id, 'Shell')
const worktrees = [worktree]
const statuses = [
  { id: 'todo', label: 'Todo' },
  { id: 'in-review', label: 'In review' }
]
const repoMap = new Map([[repo.id, repo]])

beforeEach(() => {
  useAppStore.setState(initialState, true)
  useAppStore.setState({
    repos: [repo],
    worktreesByRepo: { [repo.id]: worktrees },
    showSleepingWorkspaces: true,
    workspaceStatuses: statuses,
    tabsByWorktree: { [worktree.id]: [tab] }
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useAppStore.setState(initialState, true)
})

describe('workspace board sleeping', () => {
  it('moves a card on sleep and wake while preserving its status and search membership', () => {
    const { result } = renderHook(() =>
      useWorkspaceKanbanBoardProjection({
        activeWorktreeId: null,
        activeWorkspaceExecutionHostId: null,
        allWorktrees: worktrees,
        open: true,
        repoMap,
        sortBy: 'recent',
        workspaceStatuses: statuses
      })
    )
    expect(result.current.sleepingLaneView.items).toEqual([worktree])
    expect(result.current.worktreesByStatus.get('in-review')).toEqual([])
    act(() => result.current.search.setQuery('Sleep test'))
    expect(result.current.sleepingLaneView.items).toEqual([worktree])
    act(() => useAppStore.setState({ ptyIdsByTabId: { [tab.id]: ['live'] } }))
    expect(result.current.sleepingLaneView.items).toEqual([])
    expect(result.current.worktreesByStatus.get('in-review')).toEqual([worktree])
    act(() => useAppStore.setState({ ptyIdsByTabId: {} }))
    expect(result.current.sleepingLaneView.items).toEqual([worktree])
    act(() => useAppStore.setState({ showSleepingWorkspaces: false }))
    expect(result.current.boardWorktrees).toEqual([])
    expect(worktree.workspaceStatus).toBe('in-review')
  })

  it('rejects a drop when the workspace sleeps after drag start', () => {
    const updateWorktreesMeta = vi.fn(() => Promise.resolve())
    useAppStore.setState({ ptyIdsByTabId: { [tab.id]: ['live'] } })
    const { result } = renderHook(() =>
      useWorkspaceKanbanWorktreeActions({
        boardDragGroups: [],
        laneFullWorktreeIds: new Map(),
        laneViews: new Map(),
        maybeSyncTaskStatuses: vi.fn(),
        sortBy: 'recent',
        updateWorktreeMeta: vi.fn(),
        updateWorktreesMeta,
        workspaceStatuses: statuses,
        worktreeById: new Map([[worktree.id, worktree]]),
        manualOrderCatalog: { orderedIds: [worktree.id], rankByWorktreeId: new Map() },
        worktreesByStatus: new Map()
      })
    )
    act(() => useAppStore.setState({ ptyIdsByTabId: {} }))
    act(() => result.current.dropWorktreesAtEndOfStatus([worktree.id], 'todo'))
    expect(updateWorktreesMeta).not.toHaveBeenCalled()
    act(() => useAppStore.setState({ ptyIdsByTabId: { [tab.id]: ['live'] } }))
    act(() => result.current.dropWorktreesAtEndOfStatus([worktree.id], 'todo'))
    expect(updateWorktreesMeta).toHaveBeenCalledOnce()
  })

  it('does not resolve Todo through the Sleeping column near its right edge', () => {
    const board = document.createElement('div')
    board.innerHTML =
      '<section data-workspace-board-sleeping-lane><span>Sleeping</span></section><section data-workspace-status-drop-target data-workspace-status="todo"></section>'
    document.body.append(board)
    const target = board.querySelector('span')
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(target)
    const todo = board.querySelector<HTMLElement>('[data-workspace-status]')
    if (!todo) {
      throw new Error('Todo lane missing')
    }
    vi.spyOn(todo, 'getBoundingClientRect').mockReturnValue(new DOMRect(212, 0, 200, 600))
    expect(getDropTarget(board, 199, 100)).toEqual({
      status: null,
      isPinDrop: false,
      blocked: true
    })
    expect(
      resolveWorkspaceKanbanCardDropCommitTarget({
        currentTarget: { ...getDropTarget(board, 199, 100), dropIndex: 0 },
        latestTrackedTarget: {
          target: { status: 'todo', isPinDrop: false, dropIndex: 0 },
          x: 201,
          y: 100
        },
        x: 199,
        y: 100
      }).status
    ).toBeNull()
    board.remove()
  })
})
