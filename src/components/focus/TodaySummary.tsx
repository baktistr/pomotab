import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { endOfDay, formatDuration, startOfDay } from '@/lib/format'
import { inRange, summarize } from '@/lib/stats'

const MAX_TOMATOES = 12

export function TodaySummary() {
  const today = useLiveQuery(async () => {
    const from = startOfDay(Date.now())
    const to = endOfDay(Date.now())
    const sessions = await db.sessions.where('startedAt').between(from, to, true, false).toArray()
    return summarize(inRange(sessions, from, to))
  }, [])

  if (!today) return <div className="h-6" />

  if (today.pomodoros === 0 && today.focusedSec === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing logged today yet. Press start when you&rsquo;re ready.
      </p>
    )
  }

  const shown = Math.min(today.pomodoros, MAX_TOMATOES)
  const overflow = today.pomodoros - shown

  return (
    <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
      <span aria-hidden className="tracking-[-0.15em]">
        {'🍅'.repeat(shown)}
      </span>
      {overflow > 0 && <span aria-hidden>+{overflow}</span>}
      <span>
        Today: {today.pomodoros} pomodoro{today.pomodoros === 1 ? '' : 's'} ·{' '}
        {formatDuration(today.focusedSec)} focused
      </span>
    </p>
  )
}
