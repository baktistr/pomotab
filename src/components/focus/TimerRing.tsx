import { formatClock } from '@/lib/format'
import { PHASE_LABEL, type PhaseType } from '@/lib/types'
import { cn } from '@/lib/utils'

const STROKE: Record<PhaseType, string> = {
  work: 'stroke-work',
  short: 'stroke-short',
  long: 'stroke-long',
}

const SIZE = 280
const STROKE_WIDTH = 14
const RADIUS = (SIZE - STROKE_WIDTH) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export function TimerRing({
  phase,
  remainingSec,
  progress,
  paused,
  subline,
}: {
  phase: PhaseType
  remainingSec: number
  progress: number
  paused: boolean
  subline?: string
}) {
  return (
    <div className="relative mx-auto" style={{ width: SIZE, maxWidth: '100%' }}>
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className={cn('w-full -rotate-90', paused && 'opacity-60')}
        role="img"
        aria-label={`${PHASE_LABEL[phase]}, ${formatClock(remainingSec)} remaining`}
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          className="fill-none stroke-border"
          strokeWidth={STROKE_WIDTH}
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          className={cn('fill-none transition-[stroke-dashoffset] duration-500 ease-linear', STROKE[phase])}
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
        />
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <div className="tabular text-6xl font-semibold tracking-tight sm:text-7xl">
          {formatClock(remainingSec)}
        </div>
        {subline && (
          <div className="mt-1 max-w-[70%] truncate text-sm text-muted-foreground">{subline}</div>
        )}
      </div>
    </div>
  )
}
