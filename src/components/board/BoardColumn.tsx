import { useEffect, useRef, useState } from 'react'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, MoreHorizontal, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input, Textarea } from '@/components/ui/input'
import type { Column, Task } from '@/lib/types'
import { cn } from '@/lib/utils'
import { SortableTaskCard } from './TaskCard'

export function BoardColumn({
  column,
  tasks,
  pomoCounts,
  onAddTask,
  onOpenTask,
  onStartTask,
  onRename,
  onSetWipLimit,
  onDelete,
  composeSignal,
}: {
  column: Column
  tasks: Task[]
  pomoCounts: Map<string, number>
  onAddTask: (title: string) => void
  onOpenTask: (task: Task) => void
  onStartTask: (task: Task) => void
  onRename: (name: string) => void
  onSetWipLimit: (limit?: number) => void
  onDelete: () => void
  /** Bumped by the `n` shortcut to open this column's composer. */
  composeSignal?: number
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: column.id,
    data: { type: 'column' },
  })

  const [composing, setComposing] = useState(false)
  const [draft, setDraft] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState(column.name)
  const [wipOpen, setWipOpen] = useState(false)
  const [wipDraft, setWipDraft] = useState(String(column.wipLimit ?? ''))
  const [confirmDelete, setConfirmDelete] = useState(false)
  const composerRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (composing) composerRef.current?.focus()
  }, [composing])

  const firstSignal = useRef(composeSignal)
  useEffect(() => {
    if (composeSignal === undefined || composeSignal === firstSignal.current) return
    firstSignal.current = composeSignal
    setComposing(true)
  }, [composeSignal])

  const overLimit = column.wipLimit !== undefined && tasks.length > column.wipLimit

  function submitDraft() {
    const title = draft.trim()
    if (!title) return
    onAddTask(title)
    setDraft('')
    // Stay open so several cards can be typed in a row.
    composerRef.current?.focus()
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        'flex max-h-full w-72 shrink-0 flex-col rounded-xl border border-border bg-muted/40',
        isDragging && 'opacity-50',
      )}
    >
      <div className="flex items-center gap-1 px-2 py-2">
        <span
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none rounded p-0.5 text-muted-foreground/40 transition-colors hover:text-muted-foreground active:cursor-grabbing"
          aria-label={`Reorder ${column.name}`}
        >
          <GripVertical className="size-4" />
        </span>

        {renaming ? (
          <Input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => {
              setRenaming(false)
              if (nameDraft.trim() && nameDraft !== column.name) onRename(nameDraft.trim())
              else setNameDraft(column.name)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') {
                setNameDraft(column.name)
                setRenaming(false)
              }
            }}
            className="h-7 flex-1"
          />
        ) : (
          <button
            onDoubleClick={() => setRenaming(true)}
            className="min-w-0 flex-1 truncate text-left text-sm font-semibold"
            title="Double-click to rename"
          >
            {column.name}
          </button>
        )}

        <span
          className={cn(
            'tabular shrink-0 rounded px-1.5 py-0.5 text-xs',
            overLimit ? 'bg-destructive/15 text-destructive' : 'text-muted-foreground',
          )}
          title={column.wipLimit !== undefined ? `WIP limit ${column.wipLimit}` : undefined}
        >
          {tasks.length}
          {column.wipLimit !== undefined ? `/${column.wipLimit}` : ''}
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger
            className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={`${column.name} options`}
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setTimeout(() => setRenaming(true), 0)}>
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                setWipDraft(String(column.wipLimit ?? ''))
                setTimeout(() => setWipOpen(true), 0)
              }}
            >
              {column.wipLimit !== undefined ? 'Change WIP limit' : 'Set WIP limit'}
            </DropdownMenuItem>
            {column.wipLimit !== undefined && (
              <DropdownMenuItem onSelect={() => onSetWipLimit(undefined)}>
                Remove WIP limit
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={() => setTimeout(() => setConfirmDelete(true), 0)}>
              Delete column
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="scrollbar-thin flex min-h-16 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <SortableTaskCard
              key={task.id}
              task={task}
              pomos={pomoCounts.get(task.id) ?? 0}
              onOpen={() => onOpenTask(task)}
              onStart={() => onStartTask(task)}
            />
          ))}
        </SortableContext>

        {tasks.length === 0 && !composing && (
          <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
            Drop cards here
          </p>
        )}

        {composing ? (
          <div className="space-y-1.5">
            <Textarea
              ref={composerRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  submitDraft()
                }
                if (e.key === 'Escape') {
                  setDraft('')
                  setComposing(false)
                }
              }}
              placeholder="What needs doing?"
              className="min-h-16 resize-none bg-card text-sm"
            />
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={submitDraft} disabled={!draft.trim()}>
                Add card
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDraft('')
                  setComposing(false)
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setComposing(true)}
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Plus className="size-3.5" />
            Add card
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete "${column.name}"?`}
        description={
          tasks.length > 0
            ? `Its ${tasks.length} card${tasks.length === 1 ? '' : 's'} will be deleted too. Logged pomodoros are kept in Activity.`
            : 'This column is empty.'
        }
        confirmLabel="Delete column"
        destructive
        onConfirm={onDelete}
      />

      <WipLimitDialog
        open={wipOpen}
        onOpenChange={setWipOpen}
        value={wipDraft}
        onValueChange={setWipDraft}
        onSave={() => {
          const parsed = Number.parseInt(wipDraft, 10)
          onSetWipLimit(Number.isFinite(parsed) && parsed > 0 ? parsed : undefined)
          setWipOpen(false)
        }}
      />
    </div>
  )
}

function WipLimitDialog({
  open,
  onOpenChange,
  value,
  onValueChange,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: string
  onValueChange: (value: string) => void
  onSave: () => void
}) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-xs space-y-3 rounded-xl border border-border bg-card p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <p className="text-sm font-semibold">WIP limit</p>
          <p className="text-xs text-muted-foreground">
            A soft cap — the count turns red when exceeded, nothing is blocked.
          </p>
        </div>
        <Input
          autoFocus
          type="number"
          min={1}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSave()
            if (e.key === 'Escape') onOpenChange(false)
          }}
          placeholder="e.g. 3 — leave blank for none"
        />
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={onSave}>
            Save
          </Button>
        </div>
      </div>
    </div>
  )
}
