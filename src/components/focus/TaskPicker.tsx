import { useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { db } from '@/lib/db'
import { byOrder } from '@/lib/repo'
import { pomoCountByTask } from '@/lib/stats'
import { cn } from '@/lib/utils'

/**
 * Searchable picker over every open card on every board. Linking is optional —
 * an untasked focus session is a first-class thing.
 */
export function TaskPicker({
  taskId,
  onSelect,
}: {
  taskId?: string
  onSelect: (taskId?: string, taskTitle?: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const data = useLiveQuery(async () => {
    const [tasks, boards, sessions] = await Promise.all([
      db.tasks.toArray(),
      db.boards.toArray(),
      db.sessions.where('type').equals('work').toArray(),
    ])
    const boardNames = new Map(boards.map((b) => [b.id, b.name]))
    const counts = pomoCountByTask(sessions)
    return byOrder(tasks.filter((t) => !t.archived && !t.completedAt)).map((t) => ({
      id: t.id,
      title: t.title,
      boardName: boardNames.get(t.boardId) ?? '',
      estimate: t.estimatePomos,
      done: counts.get(t.id) ?? 0,
    }))
  }, [])

  const selected = useLiveQuery(async () => (taskId ? db.tasks.get(taskId) : undefined), [taskId])

  const results = useMemo(() => {
    const list = data ?? []
    const q = query.trim().toLowerCase()
    if (!q) return list.slice(0, 50)
    return list.filter((t) => t.title.toLowerCase().includes(q)).slice(0, 50)
  }, [data, query])

  const label = selected?.title ?? (taskId ? 'Task no longer exists' : 'No task — just focus')

  return (
    <div className="flex items-center gap-2">
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (next) setQuery('')
        }}
      >
        <PopoverTrigger
          className={cn(
            'flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm transition-colors hover:bg-accent',
            !selected && 'text-muted-foreground',
          )}
        >
          <span className="min-w-0 flex-1 truncate text-left">{label}</span>
          <ChevronDown className="size-4 shrink-0 opacity-50" />
        </PopoverTrigger>
        <PopoverContent
          className="w-[min(24rem,calc(100vw-2rem))] p-0"
          align="start"
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            inputRef.current?.focus()
          }}
        >
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search cards…"
              // Borderless inside the popover; the popover itself is the frame.
              className="h-9 border-0 px-0 shadow-none focus-visible:ring-0"
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            <button
              onClick={() => {
                onSelect(undefined, undefined)
                setOpen(false)
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-accent"
            >
              <span className="flex-1">No task — just focus</span>
              {!taskId && <Check className="size-3.5" />}
            </button>
            {results.length === 0 && (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                {query ? 'No cards match.' : 'No open cards yet — add one on the Board.'}
              </p>
            )}
            {results.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  onSelect(t.id, t.title)
                  setOpen(false)
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{t.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {t.boardName}
                    {' · 🍅 '}
                    {t.done}
                    {t.estimate ? `/${t.estimate}` : ''}
                  </span>
                </span>
                {taskId === t.id && <Check className="size-3.5 shrink-0" />}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {taskId && (
        <button
          onClick={() => onSelect(undefined, undefined)}
          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Unlink task"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}
