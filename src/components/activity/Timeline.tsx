import { useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { EmptyState } from '@/components/ui/misc'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { dayKey, formatDate, formatDuration, formatTimeOfDay } from '@/lib/format'
import { deleteSession } from '@/lib/repo'
import type { Session } from '@/lib/types'
import { cn } from '@/lib/utils'

const ICON: Record<Session['type'], string> = {
  work: '🍅',
  short: '☕',
  long: '🌿',
}

const PHASE_TEXT: Record<Session['type'], string> = {
  work: 'focus',
  short: 'short break',
  long: 'long break',
}

export function Timeline({
  sessions,
  groupByDay,
}: {
  sessions: Session[]
  groupByDay: boolean
}) {
  const [pendingDelete, setPendingDelete] = useState<Session | null>(null)

  const groups = useMemo(() => {
    const map = new Map<string, { start: number; items: Session[] }>()
    for (const s of sessions) {
      const key = dayKey(s.startedAt)
      const group = map.get(key) ?? { start: s.startedAt, items: [] }
      group.items.push(s)
      map.set(key, group)
    }
    return [...map.values()].sort((a, b) => b.start - a.start)
  }, [sessions])

  if (sessions.length === 0) {
    return (
      <EmptyState
        title="Nothing logged in this range"
        description="Completed and skipped phases both show up here, so the history stays honest."
      />
    )
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={dayKey(group.start)} className="space-y-1">
          {groupByDay && (
            <p className="sticky top-14 bg-background/90 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground backdrop-blur">
              {formatDate(group.start)}
            </p>
          )}
          <ul className="divide-y divide-border">
            {group.items
              .slice()
              .sort((a, b) => a.startedAt - b.startedAt)
              .map((s) => (
                <li key={s.id} className="group flex items-center gap-3 py-1.5 text-sm">
                  <span className="tabular w-12 shrink-0 text-muted-foreground">
                    {formatTimeOfDay(s.startedAt)}
                  </span>
                  <span aria-hidden className="w-5 shrink-0 text-center">
                    {ICON[s.type]}
                  </span>
                  <span
                    className={cn(
                      'tabular w-14 shrink-0',
                      !s.completed && 'text-muted-foreground',
                    )}
                  >
                    {formatDuration(s.durationSec)}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {s.type === 'work' ? (
                      s.taskTitle ? (
                        s.taskTitle
                      ) : (
                        <span className="text-muted-foreground">(no task)</span>
                      )
                    ) : (
                      <span className="text-muted-foreground">{PHASE_TEXT[s.type]}</span>
                    )}
                    {!s.completed && (
                      <span className="text-muted-foreground"> — ended early</span>
                    )}
                  </span>
                  <button
                    onClick={() => setPendingDelete(s)}
                    className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                    aria-label="Delete this entry"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
          </ul>
        </div>
      ))}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete this entry?"
        description="It disappears from your history and from every stat derived from it."
        confirmLabel="Delete entry"
        destructive
        onConfirm={() => {
          if (pendingDelete) void deleteSession(pendingDelete.id)
          setPendingDelete(null)
        }}
      />
    </div>
  )
}
