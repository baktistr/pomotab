import { Link, useLocation } from 'react-router-dom'
import { Pause, Play } from 'lucide-react'
import { formatClock } from '@/lib/format'
import { PHASE_LABEL } from '@/lib/types'
import { cn } from '@/lib/utils'
import { progress, remainingSec, useTimerStore } from '@/store/timerStore'

const PHASE_DOT: Record<string, string> = {
  work: 'bg-work',
  short: 'bg-short',
  long: 'bg-long',
}

/**
 * Always-visible reminder that a phase is running. Hidden on the Focus page,
 * where the full timer is already on screen.
 */
export function MiniTimer() {
  const location = useLocation()
  const state = useTimerStore()
  const onFocusPage = location.pathname === '/'

  if (onFocusPage || state.status === 'idle') return null

  const remaining = remainingSec(state, state.now)
  const pct = progress(state, state.now)

  return (
    <Link
      to="/"
      className={cn(
        'group flex items-center gap-2 rounded-full border border-border bg-card py-1 pl-2 pr-3 transition-colors hover:bg-accent',
        state.status === 'paused' && 'opacity-70',
      )}
      title={`${PHASE_LABEL[state.phase]} — ${formatClock(remaining)} left`}
    >
      <span className="relative flex size-5 items-center justify-center">
        <svg viewBox="0 0 24 24" className="size-5 -rotate-90">
          <circle cx="12" cy="12" r="9" className="fill-none stroke-border" strokeWidth="4" />
          <circle
            cx="12"
            cy="12"
            r="9"
            className={cn(
              'fill-none',
              state.phase === 'work' && 'stroke-work',
              state.phase === 'short' && 'stroke-short',
              state.phase === 'long' && 'stroke-long',
            )}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 9}
            strokeDashoffset={2 * Math.PI * 9 * (1 - pct)}
          />
        </svg>
        {state.status === 'paused' && (
          <Pause className="absolute size-2.5 fill-current text-muted-foreground" />
        )}
      </span>
      <span className="tabular text-sm font-medium">{formatClock(remaining)}</span>
      <span className={cn('size-1.5 rounded-full', PHASE_DOT[state.phase])} aria-hidden />
    </Link>
  )
}

/** Pause/resume without leaving the page you are on. */
export function MiniTimerButton() {
  const location = useLocation()
  const status = useTimerStore((s) => s.status)
  const toggle = useTimerStore((s) => s.toggle)
  // Redundant on Focus, where the real controls are already on screen.
  if (status === 'idle' || location.pathname === '/') return null
  return (
    <button
      onClick={toggle}
      className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      aria-label={status === 'running' ? 'Pause timer' : 'Resume timer'}
    >
      {status === 'running' ? <Pause className="size-4" /> : <Play className="size-4" />}
    </button>
  )
}
