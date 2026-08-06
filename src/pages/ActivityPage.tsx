import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { FocusChart, type ChartPoint } from '@/components/activity/FocusChart'
import { StatTile, StatTiles } from '@/components/activity/StatTiles'
import { Timeline } from '@/components/activity/Timeline'
import { Button } from '@/components/ui/button'
import { db } from '@/lib/db'
import {
  addDays,
  addMonths,
  formatDate,
  formatDateShort,
  formatDuration,
  isSameDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from '@/lib/format'
import { currentStreak, focusByDay, focusByHour, inRange, summarize } from '@/lib/stats'
import { cn } from '@/lib/utils'

type RangeKind = 'day' | 'week' | 'month'

const RANGES: Array<{ value: RangeKind; label: string }> = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
]

export function ActivityPage() {
  const [kind, setKind] = useState<RangeKind>('day')
  const [anchor, setAnchor] = useState(() => Date.now())

  const { from, to, label } = useMemo(() => {
    if (kind === 'day') {
      const start = startOfDay(anchor)
      return { from: start, to: addDays(start, 1), label: formatDate(start) }
    }
    if (kind === 'week') {
      const start = startOfWeek(anchor)
      const end = addDays(start, 7)
      return {
        from: start,
        to: end,
        label: `${formatDateShort(start)} – ${formatDateShort(addDays(end, -1))}`,
      }
    }
    const start = startOfMonth(anchor)
    return {
      from: start,
      to: startOfMonth(addMonths(start, 1)),
      label: new Date(start).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
    }
  }, [kind, anchor])

  const sessions = useLiveQuery(
    async () => inRange(await db.sessions.where('startedAt').between(from, to, true, false).toArray(), from, to),
    [from, to],
    [],
  )
  const tasksDone = useLiveQuery(
    async () => (await db.tasks.where('completedAt').between(from, to, true, false).toArray()).length,
    [from, to],
    0,
  )
  const streak = useLiveQuery(
    async () => currentStreak(await db.sessions.where('type').equals('work').toArray()),
    [],
    0,
  )

  const summary = useMemo(() => summarize(sessions ?? []), [sessions])

  const chart = useMemo<{ data: ChartPoint[]; interval: number; title: string }>(() => {
    if (kind === 'day') {
      const buckets = focusByHour(sessions ?? [], from)
      return {
        data: buckets.map((value, hour) => ({
          label: String(hour).padStart(2, '0'),
          value: Math.round(value),
        })),
        interval: 2,
        title: 'Focus by hour',
      }
    }
    const days = kind === 'week' ? 7 : Math.round((to - from) / 86_400_000)
    const buckets = focusByDay(sessions ?? [], from, days)
    return {
      data: buckets.map((bucket) => ({
        label:
          kind === 'week'
            ? new Date(bucket.start).toLocaleDateString(undefined, { weekday: 'short' })
            : String(new Date(bucket.start).getDate()),
        value: Math.round(bucket.focusedSec),
        highlight: isSameDay(bucket.start, Date.now()),
      })),
      interval: kind === 'week' ? 0 : 2,
      title: 'Focus by day',
    }
  }, [kind, sessions, from, to])

  function shift(direction: -1 | 1) {
    setAnchor((current) => {
      if (kind === 'day') return addDays(current, direction)
      if (kind === 'week') return addDays(current, 7 * direction)
      return addMonths(current, direction)
    })
  }

  const atPresent = to > Date.now()

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-border p-1">
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setKind(r.value)}
              className={cn(
                'rounded-md px-3 py-1 text-sm font-medium transition-colors',
                kind === r.value
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <Button size="icon-sm" variant="ghost" onClick={() => shift(-1)} aria-label="Previous">
            <ChevronLeft />
          </Button>
          <span className="min-w-40 text-center text-sm font-medium">{label}</span>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => shift(1)}
            disabled={atPresent}
            aria-label="Next"
          >
            <ChevronRight />
          </Button>
          {!atPresent && (
            <Button size="sm" variant="ghost" onClick={() => setAnchor(Date.now())}>
              Today
            </Button>
          )}
        </div>
      </div>

      <StatTiles>
        <StatTile
          label="Focused"
          value={summary.focusedSec > 0 ? formatDuration(summary.focusedSec) : '—'}
          hint={summary.breakSec > 0 ? `${formatDuration(summary.breakSec)} on breaks` : undefined}
        />
        <StatTile
          label="Pomodoros"
          value={summary.pomodoros}
          hint={summary.abandoned > 0 ? `${summary.abandoned} ended early` : undefined}
        />
        <StatTile label="Tasks done" value={tasksDone ?? 0} />
        <StatTile
          label="Streak"
          value={`${streak ?? 0} day${streak === 1 ? '' : 's'}`}
          hint="days in a row with a pomodoro"
        />
      </StatTiles>

      <FocusChart data={chart.data} labelInterval={chart.interval} title={chart.title} />

      <div className="space-y-2">
        <h2 className="text-sm font-medium">Timeline</h2>
        <Timeline sessions={sessions ?? []} groupByDay={kind !== 'day'} />
      </div>
    </div>
  )
}
