import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Pause, Play, SkipForward, X } from 'lucide-react'
import { TimerRing } from '@/components/focus/TimerRing'
import { TaskPicker } from '@/components/focus/TaskPicker'
import { TodaySummary } from '@/components/focus/TodaySummary'
import { Button } from '@/components/ui/button'
import { db } from '@/lib/db'
import { formatDuration } from '@/lib/format'
import { PHASE_LABEL, type PhaseType } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useSettingsStore } from '@/store/settingsStore'
import { nextPhaseAfter, progress, remainingSec, useTimerStore } from '@/store/timerStore'

const PHASES: PhaseType[] = ['work', 'short', 'long']

const PHASE_ACTIVE: Record<PhaseType, string> = {
  work: 'bg-work text-work-foreground',
  short: 'bg-short text-short-foreground',
  long: 'bg-long text-long-foreground',
}

export function FocusPage() {
  const timer = useTimerStore()
  const settings = useSettingsStore((s) => s.settings)
  const [params, setParams] = useSearchParams()

  // The ▶ button on a board card lands here with the task pre-linked.
  const requestedTask = params.get('task')
  const autoStart = params.get('start') === '1'
  const requested = useLiveQuery(
    async () => (requestedTask ? db.tasks.get(requestedTask) : undefined),
    [requestedTask],
  )

  useEffect(() => {
    if (!requestedTask) return
    // Wait for the lookup so the session records the right title snapshot.
    if (requested === undefined) return
    const store = useTimerStore.getState()
    if (!requested) {
      setParams({}, { replace: true })
      return
    }
    if (autoStart && store.status === 'idle') {
      store.start({ phase: 'work', taskId: requested.id, taskTitle: requested.title })
    } else {
      store.setTask(requested.id, requested.title)
    }
    setParams({}, { replace: true })
  }, [requestedTask, requested, autoStart, setParams])

  const remaining = remainingSec(timer, timer.now)
  const pct = progress(timer, timer.now)
  const idle = timer.status === 'idle'
  const upcoming = nextPhaseAfter(timer.phase, timer.workCount, settings)

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-8 px-4 py-10">
      <div
        className="flex items-center gap-1 rounded-full border border-border p-1"
        role="tablist"
        aria-label="Phase"
      >
        {PHASES.map((phase) => {
          const active = timer.phase === phase
          return (
            <button
              key={phase}
              role="tab"
              aria-selected={active}
              disabled={!idle && !active}
              onClick={() => useTimerStore.getState().setPhase(phase)}
              className={cn(
                'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                active ? PHASE_ACTIVE[phase] : 'text-muted-foreground hover:text-foreground',
                !idle && !active && 'cursor-not-allowed opacity-40 hover:text-muted-foreground',
              )}
            >
              {PHASE_LABEL[phase]}
            </button>
          )
        })}
      </div>

      <TimerRing
        phase={timer.phase}
        remainingSec={remaining}
        progress={pct}
        paused={timer.status === 'paused'}
        subline={
          timer.status === 'paused'
            ? 'Paused'
            : timer.phase === 'work'
              ? (timer.taskTitle ?? undefined)
              : `${formatDuration(timer.phaseDurationSec)} break`
        }
      />

      <div className="flex items-center gap-3">
        {idle ? (
          <Button size="lg" variant="work" className="px-8" onClick={() => timer.start()}>
            <Play className="fill-current" />
            Start
          </Button>
        ) : (
          <>
            <Button
              size="lg"
              variant={timer.status === 'running' ? 'secondary' : 'work'}
              className="px-8"
              onClick={timer.toggle}
            >
              {timer.status === 'running' ? (
                <>
                  <Pause className="fill-current" />
                  Pause
                </>
              ) : (
                <>
                  <Play className="fill-current" />
                  Resume
                </>
              )}
            </Button>
            <Button size="lg" variant="outline" onClick={timer.skip} title="Skip to the next phase">
              <SkipForward />
              Skip
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={timer.stop}
              aria-label="Stop and reset"
              title="Stop — logs the time spent so far"
            >
              <X />
            </Button>
          </>
        )}
      </div>

      <p className="-mt-4 text-xs text-muted-foreground">
        {idle
          ? `${timer.workCount % settings.longBreakEvery}/${settings.longBreakEvery} toward a long break`
          : `Next: ${PHASE_LABEL[upcoming].toLowerCase()}`}
      </p>

      <div className="w-full max-w-md space-y-2">
        <label className="text-sm font-medium text-muted-foreground">Working on</label>
        <TaskPicker
          taskId={timer.taskId}
          onSelect={(id, title) => useTimerStore.getState().setTask(id, title)}
        />
      </div>

      <TodaySummary />
    </div>
  )
}
