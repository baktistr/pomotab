import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { Check, ChevronDown, KanbanSquare, Plus } from 'lucide-react'
import { BoardColumn } from '@/components/board/BoardColumn'
import { TaskCardBody } from '@/components/board/TaskCard'
import { TaskDetailModal } from '@/components/board/TaskDetailModal'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/misc'
import { toast } from '@/components/ui/toast'
import { db } from '@/lib/db'
import {
  byOrder,
  createBoard,
  createColumn,
  createTask,
  deleteBoard,
  deleteColumn,
  moveColumn,
  moveTask,
  updateBoard,
  updateColumn,
} from '@/lib/repo'
import { pomoCountByTask } from '@/lib/stats'
import type { Column, Task } from '@/lib/types'
import { useUiStore } from '@/store/uiStore'

interface BoardSnapshot {
  columns: Column[]
  tasksByColumn: Record<string, Task[]>
}

function columnOf(snapshot: BoardSnapshot, taskId: string): string | undefined {
  return Object.keys(snapshot.tasksByColumn).find((columnId) =>
    snapshot.tasksByColumn[columnId].some((t) => t.id === taskId),
  )
}

export function BoardPage() {
  const navigate = useNavigate()
  const { activeBoardId, setActiveBoard, newCardSignal } = useUiStore()
  const [showArchived, setShowArchived] = useState(false)
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const [addingColumn, setAddingColumn] = useState(false)
  const [columnDraft, setColumnDraft] = useState('')
  const [renamingBoard, setRenamingBoard] = useState(false)
  const [boardDraft, setBoardDraft] = useState('')
  const [confirmDeleteBoard, setConfirmDeleteBoard] = useState(false)

  const boards = useLiveQuery(async () => byOrder(await db.boards.toArray()), [])
  const boardId = activeBoardId && boards?.some((b) => b.id === activeBoardId)
    ? activeBoardId
    : (boards?.[0]?.id ?? null)
  const board = boards?.find((b) => b.id === boardId)

  useEffect(() => {
    if (boardId && boardId !== activeBoardId) setActiveBoard(boardId)
  }, [boardId, activeBoardId, setActiveBoard])

  const columns = useLiveQuery(
    async () => (boardId ? byOrder(await db.columns.where('boardId').equals(boardId).toArray()) : []),
    [boardId],
  )
  const tasks = useLiveQuery(
    async () => (boardId ? byOrder(await db.tasks.where('boardId').equals(boardId).toArray()) : []),
    [boardId],
  )
  const pomoCounts = useLiveQuery(
    async () => pomoCountByTask(await db.sessions.where('type').equals('work').toArray()),
    [],
    new Map<string, number>(),
  )

  const live: BoardSnapshot = useMemo(() => {
    const cols = columns ?? []
    const visible = (tasks ?? []).filter((t) => showArchived || !t.archived)
    const tasksByColumn: Record<string, Task[]> = {}
    for (const column of cols) tasksByColumn[column.id] = []
    for (const task of visible) tasksByColumn[task.columnId]?.push(task)
    return { columns: cols, tasksByColumn }
  }, [columns, tasks, showArchived])

  /** Non-null only while a drag is in flight; lets the board preview the move. */
  const [dragSnapshot, setDragSnapshot] = useState<BoardSnapshot | null>(null)
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const [activeColumn, setActiveColumn] = useState<Column | null>(null)
  const view = dragSnapshot ?? live

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  /**
   * Cards and columns are overlapping sortable targets. Give each drag type a
   * collision strategy matching the axis and target it can actually use.
   */
  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const isColumn = args.active.data.current?.type === 'column'

    if (!isColumn) {
      // A column and each card inside it are overlapping droppables. Following
      // the pointer makes crossing into another column work immediately, even
      // over its header or the empty space above/below its cards. Prefer the
      // more specific card when the pointer is directly over one.
      const pointerHits = pointerWithin(args)
      const cardHits = pointerHits.filter(
        (collision) => collision.data?.droppableContainer.data.current?.type === 'task',
      )
      if (cardHits.length > 0) return cardHits

      const columnHits = pointerHits.filter(
        (collision) => collision.data?.droppableContainer.data.current?.type === 'column',
      )
      if (columnHits.length > 0) return columnHits

      // Keyboard dragging has no pointer coordinates, and a fast pointer can
      // briefly fall between measured rectangles.
      return closestCorners(args)
    }

    // Columns only move on the horizontal axis. `closestCenter` also scores
    // their Y centers, so columns with different card counts are difficult to
    // reorder from the top handle. Compare X only and use the pointer position
    // when available so the header remains as responsive as the bottom rows.
    const pointerX = args.pointerCoordinates?.x
    const activeX =
      pointerX ?? args.collisionRect.left + args.collisionRect.width / 2

    return args.droppableContainers
      .filter(
        (container) =>
          container.data.current?.type === 'column' && container.rect.current,
      )
      .map((container) => {
        const rect = container.rect.current!
        return {
          id: container.id,
          data: {
            droppableContainer: container,
            value: Math.abs(activeX - (rect.left + rect.width / 2)),
          },
        }
      })
      .sort((a, b) => a.data.value - b.data.value)
  }, [])

  function handleDragStart(event: DragStartEvent) {
    const type = event.active.data.current?.type
    setDragSnapshot({
      columns: [...live.columns],
      tasksByColumn: Object.fromEntries(
        Object.entries(live.tasksByColumn).map(([k, v]) => [k, [...v]]),
      ),
    })
    if (type === 'column') {
      setActiveColumn(live.columns.find((c) => c.id === event.active.id) ?? null)
    } else {
      const found = Object.values(live.tasksByColumn)
        .flat()
        .find((t) => t.id === event.active.id)
      setActiveTask(found ?? null)
    }
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over || active.data.current?.type !== 'task') return
    const activeId = String(active.id)
    const overId = String(over.id)
    if (activeId === overId) return

    setDragSnapshot((prev) => {
      if (!prev) return prev
      const from = columnOf(prev, activeId)
      const to = over.data.current?.type === 'column' ? overId : columnOf(prev, overId)
      if (!from || !to || from === to) return prev

      const fromList = [...prev.tasksByColumn[from]]
      const toList = [...prev.tasksByColumn[to]]
      const index = fromList.findIndex((t) => t.id === activeId)
      if (index === -1) return prev
      const [moved] = fromList.splice(index, 1)
      const overIndex =
        over.data.current?.type === 'column' ? toList.length : toList.findIndex((t) => t.id === overId)
      toList.splice(overIndex < 0 ? toList.length : overIndex, 0, { ...moved, columnId: to })
      return {
        columns: prev.columns,
        tasksByColumn: { ...prev.tasksByColumn, [from]: fromList, [to]: toList },
      }
    })
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    const snapshot = dragSnapshot
    const wasColumn = active.data.current?.type === 'column'
    setActiveTask(null)
    setActiveColumn(null)

    if (!snapshot || !over || !boardId) {
      setDragSnapshot(null)
      return
    }

    if (wasColumn) {
      const oldIndex = snapshot.columns.findIndex((c) => c.id === active.id)
      const newIndex = snapshot.columns.findIndex((c) => c.id === over.id)
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        void moveColumn(boardId, String(active.id), newIndex)
      }
      setDragSnapshot(null)
      return
    }

    const activeId = String(active.id)
    const targetColumn = columnOf(snapshot, activeId)
    if (!targetColumn) {
      setDragSnapshot(null)
      return
    }

    const list = snapshot.tasksByColumn[targetColumn]
    let index = list.findIndex((t) => t.id === activeId)
    if (over.data.current?.type === 'task' && over.id !== active.id) {
      // dnd-kit's array-move semantics put the card exactly where the card it
      // is hovering currently sits. This has to run for a cross-column drop
      // too: the snapshot only records the slot the card entered the column on,
      // so without it a card dragged on and then up to the top would preview at
      // the top and save itself back into the row it crossed the border at.
      const overIndex = list.findIndex((t) => t.id === over.id)
      if (overIndex !== -1) index = overIndex
    }

    void moveTask(activeId, targetColumn, Math.max(0, index))
    setDragSnapshot(null)
  }

  if (boards && boards.length === 0) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-16">
        <EmptyState
          icon={<KanbanSquare />}
          title="No boards yet"
          description="A board holds your columns and cards. Everything stays on this device."
          action={
            <Button
              onClick={async () => {
                const id = await createBoard('Personal')
                setActiveBoard(id)
              }}
            >
              <Plus />
              Create a board
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-full items-center gap-2 px-3 py-3 sm:px-6">
        {renamingBoard ? (
          <Input
            autoFocus
            value={boardDraft}
            onChange={(e) => setBoardDraft(e.target.value)}
            onBlur={() => {
              if (board && boardDraft.trim()) void updateBoard(board.id, { name: boardDraft.trim() })
              setRenamingBoard(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') setRenamingBoard(false)
            }}
            className="h-8 w-48"
          />
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-semibold transition-colors hover:bg-accent">
              {board?.name ?? 'Board'}
              <ChevronDown className="size-4 opacity-50" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-56">
              <DropdownMenuLabel>Boards</DropdownMenuLabel>
              {(boards ?? []).map((b) => (
                <DropdownMenuItem key={b.id} onSelect={() => setActiveBoard(b.id)}>
                  <span className="flex-1 truncate">{b.name}</span>
                  {b.id === boardId && <Check className="size-3.5 opacity-60" />}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={async () => {
                  const id = await createBoard('New board')
                  setActiveBoard(id)
                  toast('Board created')
                }}
              >
                <Plus />
                New board
              </DropdownMenuItem>
              {board && (
                <>
                  <DropdownMenuItem
                    onSelect={() => {
                      setBoardDraft(board.name)
                      setTimeout(() => setRenamingBoard(true), 0)
                    }}
                  >
                    Rename board
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    destructive
                    onSelect={() => setTimeout(() => setConfirmDeleteBoard(true), 0)}
                  >
                    Delete board
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowArchived((v) => !v)}
            className={showArchived ? 'text-foreground' : 'text-muted-foreground'}
          >
            {showArchived ? 'Hide archived' : 'Show archived'}
          </Button>
          {addingColumn ? (
            <Input
              autoFocus
              value={columnDraft}
              onChange={(e) => setColumnDraft(e.target.value)}
              onBlur={() => {
                if (boardId && columnDraft.trim()) void createColumn(boardId, columnDraft.trim())
                setColumnDraft('')
                setAddingColumn(false)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') {
                  setColumnDraft('')
                  setAddingColumn(false)
                }
              }}
              placeholder="Column name"
              className="h-8 w-40"
            />
          ) : (
            <Button variant="outline" size="sm" onClick={() => setAddingColumn(true)}>
              <Plus />
              Add column
            </Button>
          )}
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => {
          setDragSnapshot(null)
          setActiveTask(null)
          setActiveColumn(null)
        }}
      >
        <div className="scrollbar-thin flex flex-1 gap-3 overflow-x-auto px-3 pb-4 sm:px-6">
          <SortableContext
            items={view.columns.map((c) => c.id)}
            strategy={horizontalListSortingStrategy}
          >
            {view.columns.map((column, columnIndex) => (
              <BoardColumn
                key={column.id}
                column={column}
                composeSignal={columnIndex === 0 ? newCardSignal : undefined}
                tasks={view.tasksByColumn[column.id] ?? []}
                pomoCounts={pomoCounts ?? new Map()}
                onAddTask={(title) => {
                  if (boardId) void createTask(boardId, column.id, title)
                }}
                onOpenTask={(task) => setOpenTaskId(task.id)}
                onStartTask={(task) => navigate(`/?task=${task.id}&start=1`)}
                onRename={(name) => void updateColumn(column.id, { name })}
                onSetWipLimit={(limit) => void updateColumn(column.id, { wipLimit: limit })}
                onDelete={() => void deleteColumn(column.id)}
              />
            ))}
          </SortableContext>

          {view.columns.length === 0 && (
            <div className="flex-1">
              <EmptyState
                title="This board has no columns"
                description="Add one to start dropping cards into it."
                action={
                  <Button size="sm" variant="outline" onClick={() => setAddingColumn(true)}>
                    <Plus />
                    Add column
                  </Button>
                }
              />
            </div>
          )}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeTask && (
            <div className="w-72">
              <TaskCardBody task={activeTask} pomos={pomoCounts?.get(activeTask.id) ?? 0} dragging />
            </div>
          )}
          {activeColumn && (
            <div className="w-72 rounded-xl border border-border bg-muted/80 p-2 shadow-2xl">
              <p className="text-sm font-semibold">{activeColumn.name}</p>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <TaskDetailModal taskId={openTaskId} onClose={() => setOpenTaskId(null)} />

      {board && (
        <ConfirmDialog
          open={confirmDeleteBoard}
          onOpenChange={setConfirmDeleteBoard}
          title={`Delete "${board.name}"?`}
          description="Its columns and cards are removed. Logged pomodoros stay in Activity."
          confirmLabel="Delete board"
          destructive
          onConfirm={() => {
            void deleteBoard(board.id)
            setActiveBoard(null)
          }}
        />
      )}
    </div>
  )
}
