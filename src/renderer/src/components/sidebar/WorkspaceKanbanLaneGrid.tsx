import React, {
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { useVirtualizer, type Range } from '@tanstack/react-virtual'
import type { Repo } from '../../../../shared/repo-types'
import type {
  WorkspaceStatus,
  WorkspaceStatusDefinition,
  Worktree
} from '../../../../shared/worktree/types'
import type { WorkspaceKanbanLaneView } from './workspace-kanban-search'
import { extractWorkspaceKanbanLaneRange } from './workspace-kanban-lane-range'
import WorkspaceKanbanStatusLane from './WorkspaceKanbanStatusLane'
import { WORKSPACE_BOARD_LANE_GAP } from './workspace-chrome-metrics'

// Reuse empty lane arrays so unrelated renders preserve memoization.
const EMPTY_LANE_ITEMS: readonly Worktree[] = []
const EMPTY_RENDERED_LANE_IDS: ReadonlySet<WorkspaceStatus> = new Set()
const WORKSPACE_BOARD_LANE_OVERSCAN = 1
const EMPTY_SLEEPING_VIEW: WorkspaceKanbanLaneView = { items: EMPTY_LANE_ITEMS, totalCount: 0 }

type BoardLane =
  | { kind: 'sleeping'; key: 'sleeping' }
  | { kind: 'status'; key: string; status: WorkspaceStatusDefinition }

type WorkspaceKanbanLaneGridProps = {
  laneScrollerRef: React.RefObject<HTMLDivElement | null>
  statuses: readonly WorkspaceStatusDefinition[]
  sleepingLaneView?: WorkspaceKanbanLaneView
  laneViews: ReadonlyMap<WorkspaceStatus, WorkspaceKanbanLaneView>
  laneFullWorktreeIds: ReadonlyMap<WorkspaceStatus, readonly string[]>
  hasQuery: boolean
  repoMap: Map<string, Repo>
  activeWorktreeIdentity: string | null
  columnWidth: number
  isResizingColumn: boolean
  dragOverStatus: WorkspaceStatus | null
  renderCards: boolean
  selectedWorktreeIds: ReadonlySet<string>
  selectedWorktrees: readonly Worktree[]
  onDragOver: (event: React.DragEvent, statusId: string) => void
  onDragLeave: (event: React.DragEvent) => void
  onDrop: (event: React.DragEvent, statusId: string) => void
  onActivate: () => void
  onSelectionGesture: (event: React.MouseEvent<HTMLElement>, worktreeId: string) => boolean
  onContextMenuSelect: (
    event: React.MouseEvent<HTMLElement>,
    worktree: Worktree
  ) => readonly Worktree[]
  onAssignWorkspaceStatus?: (worktreeIds: readonly string[], status: WorkspaceStatus) => void
  onCreateWorktree: (statusId: string) => void
  onColumnResizeStart: (event: React.PointerEvent<HTMLElement>) => void
  onColumnResizeKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void
}

export default function WorkspaceKanbanLaneGrid({
  laneScrollerRef,
  statuses,
  sleepingLaneView = EMPTY_SLEEPING_VIEW,
  laneViews,
  laneFullWorktreeIds,
  hasQuery,
  repoMap,
  activeWorktreeIdentity,
  columnWidth,
  isResizingColumn,
  dragOverStatus,
  renderCards,
  selectedWorktreeIds,
  selectedWorktrees,
  onDragOver,
  onDragLeave,
  onDrop,
  onActivate,
  onSelectionGesture,
  onContextMenuSelect,
  onAssignWorkspaceStatus,
  onCreateWorktree,
  onColumnResizeStart,
  onColumnResizeKeyDown
}: WorkspaceKanbanLaneGridProps): React.JSX.Element {
  const lanes = useMemo<BoardLane[]>(
    () => [
      { kind: 'sleeping', key: 'sleeping' },
      ...statuses.map((status): BoardLane => ({
        kind: 'status',
        key: `status:${status.id}`,
        status
      }))
    ],
    [statuses]
  )
  const [focusedStatusId, setFocusedStatusId] = useState<WorkspaceStatus | null>(null)
  const [renderedLaneIds, setRenderedLaneIds] =
    useState<ReadonlySet<WorkspaceStatus>>(EMPTY_RENDERED_LANE_IDS)
  const renderedLaneIdsRef = useRef(renderedLaneIds)
  const renderCardsRef = useRef(renderCards)
  useLayoutEffect(() => {
    renderedLaneIdsRef.current = renderedLaneIds
    renderCardsRef.current = renderCards
  }, [renderCards, renderedLaneIds])
  const focusedIndex = useMemo(
    () =>
      focusedStatusId === null ? null : lanes.findIndex((lane) => lane.key === focusedStatusId),
    [focusedStatusId, lanes]
  )
  const estimateLaneSize = useCallback(() => columnWidth, [columnWidth])
  const getLaneKey = useCallback((index: number) => lanes[index]?.key ?? index, [lanes])
  const rangeExtractor = useCallback(
    (range: Range) => extractWorkspaceKanbanLaneRange(range, focusedIndex),
    [focusedIndex]
  )
  const laneVirtualizer = useVirtualizer({
    count: lanes.length,
    getScrollElement: () => laneScrollerRef.current,
    estimateSize: estimateLaneSize,
    getItemKey: getLaneKey,
    horizontal: true,
    overscan: WORKSPACE_BOARD_LANE_OVERSCAN,
    gap: WORKSPACE_BOARD_LANE_GAP,
    rangeExtractor,
    useFlushSync: false
  })
  useLayoutEffect(() => {
    laneVirtualizer.measure()
  }, [columnWidth, laneVirtualizer])
  const virtualLanes = laneVirtualizer.getVirtualItems()
  const virtualStatusIds = useMemo(
    () =>
      virtualLanes.flatMap((virtualLane) => {
        const lane = lanes[virtualLane.index]
        return lane ? [lane.key] : []
      }),
    [lanes, virtualLanes]
  )
  const mountedLaneIds = useMemo(() => new Set(virtualStatusIds), [virtualStatusIds])
  const mountedLaneIdsRef = useRef<ReadonlySet<WorkspaceStatus>>(mountedLaneIds)
  useLayoutEffect(() => {
    mountedLaneIdsRef.current = mountedLaneIds
  }, [mountedLaneIds])
  useEffect(() => {
    if (!renderCards) {
      setRenderedLaneIds(EMPTY_RENDERED_LANE_IDS)
      return
    }
    const missingIds = virtualStatusIds.filter((id) => !renderedLaneIdsRef.current.has(id))
    setRenderedLaneIds((current) => {
      const retained = new Set(Array.from(current).filter((id) => mountedLaneIds.has(id)))
      return retained.size === current.size ? current : retained
    })
    let nextIndex = 0
    let frameId = 0
    const renderNextLane = (): void => {
      const statusId = missingIds[nextIndex]
      nextIndex += 1
      if (!statusId) {
        return
      }
      startTransition(() => {
        setRenderedLaneIds((current) => {
          if (!renderCardsRef.current || !mountedLaneIdsRef.current.has(statusId)) {
            return current
          }
          return new Set(current).add(statusId)
        })
      })
      if (nextIndex < missingIds.length) {
        frameId = window.requestAnimationFrame(renderNextLane)
      }
    }
    if (missingIds.length > 0) {
      frameId = window.requestAnimationFrame(renderNextLane)
    }
    return () => window.cancelAnimationFrame(frameId)
  }, [mountedLaneIds, renderCards, virtualStatusIds])

  return (
    <div
      className="relative h-full min-h-0 min-w-full"
      data-contextual-tour-target="workspace-board-lanes"
      data-workspace-board-lane-grid=""
      style={{ width: `${laneVirtualizer.getTotalSize()}px` }}
      onFocusCapture={(event) => {
        const lane =
          event.target instanceof Element
            ? event.target.closest<HTMLElement>('[data-workspace-board-lane-key]')
            : null
        setFocusedStatusId(lane?.dataset.workspaceBoardLaneKey ?? null)
      }}
      onBlurCapture={(event) => {
        const nextTarget = event.relatedTarget
        if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
          setFocusedStatusId(null)
        }
      }}
    >
      {virtualLanes.map((virtualLane) => {
        const lane = lanes[virtualLane.index]
        if (!lane) {
          return null
        }
        const status = lane.kind === 'status' ? lane.status : null
        const view = status ? laneViews.get(status.id) : sleepingLaneView
        return (
          <div
            key={virtualLane.key}
            ref={laneVirtualizer.measureElement}
            data-index={virtualLane.index}
            data-workspace-board-lane-key={lane.key}
            className="absolute left-0 top-0 h-full"
            style={{
              width: `${columnWidth}px`,
              transform: `translateX(${virtualLane.start}px)`
            }}
          >
            <WorkspaceKanbanStatusLane
              status={status}
              items={view?.items ?? EMPTY_LANE_ITEMS}
              totalCount={view?.totalCount ?? 0}
              hasQuery={hasQuery}
              fullWorktreeIds={status ? (laneFullWorktreeIds.get(status.id) ?? []) : []}
              repoMap={repoMap}
              activeWorktreeIdentity={activeWorktreeIdentity}
              columnWidth={columnWidth}
              isResizingColumn={isResizingColumn}
              isDragTarget={status !== null && dragOverStatus === status.id}
              renderCards={renderCards && renderedLaneIds.has(lane.key)}
              selectedWorktreeIds={selectedWorktreeIds}
              selectedWorktrees={selectedWorktrees}
              nativeDragEnabled={false}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onActivate={onActivate}
              onSelectionGesture={onSelectionGesture}
              onContextMenuSelect={onContextMenuSelect}
              onAssignWorkspaceStatus={onAssignWorkspaceStatus}
              onCreateWorktree={onCreateWorktree}
              onColumnResizeStart={onColumnResizeStart}
              onColumnResizeKeyDown={onColumnResizeKeyDown}
            />
          </div>
        )
      })}
    </div>
  )
}
