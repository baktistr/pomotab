import { create } from 'zustand'
import { db, requestPersistence } from '@/lib/db'
import { notify, requestNotificationPermission } from '@/lib/notifications'
import { playChime, primeAudio } from '@/lib/sound'
import {
  elapsedSec,
  isComplete,
  phaseAfter,
  workCountAfter,
  type TimerSnapshot,
} from '@/lib/timerMath'
import { PHASE_LABEL, phaseMinutes, type PhaseType, type Settings } from '@/lib/types'
import { currentSettings, useSettingsStore } from './settingsStore'
import TimerWorker from '@/timer/timer.worker?worker'

// The pure derivations live in lib/timerMath so they can be reasoned about (and
// tested) without a DOM; re-exported here because that is where callers look.
export { elapsedSec, nextPhaseAfter, progress, remainingSec } from '@/lib/timerMath'
export type { TimerSnapshot, TimerStatus } from '@/lib/timerMath'

interface TimerStore extends TimerSnapshot {
  /** Ticked by the worker; only exists to drive re-renders. */
  now: number
  /** True in exactly one tab — the one that plays sound and posts notifications. */
  isOwner: boolean
  hydrated: boolean

  start: (opts?: { phase?: PhaseType; taskId?: string; taskTitle?: string }) => void
  pause: () => void
  resume: () => void
  toggle: () => void
  skip: () => void
  stop: () => void
  setPhase: (phase: PhaseType) => void
  setTask: (taskId?: string, taskTitle?: string) => void
}

const STORAGE_KEY = 'pomotab.timer'
const CHANNEL_NAME = 'pomotab.timer'
const TICK_MS = 500
/** Skips/aborts shorter than this are click noise, not history. */
const MIN_LOGGED_SEC = 5

function idleSnapshot(settings: Settings): TimerSnapshot {
  return {
    phase: 'work',
    status: 'idle',
    phaseStartedAt: null,
    phaseDurationSec: settings.workMin * 60,
    pausedElapsedSec: 0,
    workCount: 0,
    sessionStartedAt: null,
    updatedAt: 0,
  }
}

export const useTimerStore = create<TimerStore>((_set, get) => ({
  ...idleSnapshot(currentSettings()),
  now: Date.now(),
  isOwner: false,
  hydrated: false,

  start: ({ phase, taskId, taskTitle } = {}) => {
    const state = get()
    const settings = currentSettings()
    const nextPhase = phase ?? state.phase
    const now = Date.now()
    primeAudio()
    if (settings.notificationsEnabled) void requestNotificationPermission()
    void requestPersistence()
    commit({
      phase: nextPhase,
      status: 'running',
      phaseStartedAt: now,
      sessionStartedAt: now,
      phaseDurationSec: phaseMinutes(settings, nextPhase) * 60,
      pausedElapsedSec: 0,
      taskId: taskId !== undefined || taskTitle !== undefined ? taskId : state.taskId,
      taskTitle: taskId !== undefined || taskTitle !== undefined ? taskTitle : state.taskTitle,
    })
  },

  pause: () => {
    const state = get()
    if (state.status !== 'running') return
    commit({ status: 'paused', pausedElapsedSec: elapsedSec(state, Date.now()) })
  },

  resume: () => {
    const state = get()
    if (state.status !== 'paused') return
    primeAudio()
    commit({
      status: 'running',
      phaseStartedAt: Date.now() - state.pausedElapsedSec * 1000,
    })
  },

  toggle: () => {
    const { status, start, pause, resume } = get()
    if (status === 'running') pause()
    else if (status === 'paused') resume()
    else start()
  },

  skip: () => {
    if (get().status === 'idle') return
    void endPhase('skip')
  },

  stop: () => {
    if (get().status === 'idle') return
    void endPhase('abort')
  },

  setPhase: (phase) => {
    const state = get()
    if (state.status !== 'idle') return
    commit({ phase, phaseDurationSec: phaseMinutes(currentSettings(), phase) * 60 })
  },

  setTask: (taskId, taskTitle) => commit({ taskId, taskTitle }),
}))

/* ------------------------------------------------------------ persistence */

let channel: BroadcastChannel | null = null

function snapshotOf(s: TimerSnapshot): TimerSnapshot {
  return {
    phase: s.phase,
    status: s.status,
    phaseStartedAt: s.phaseStartedAt,
    phaseDurationSec: s.phaseDurationSec,
    pausedElapsedSec: s.pausedElapsedSec,
    workCount: s.workCount,
    taskId: s.taskId,
    taskTitle: s.taskTitle,
    sessionStartedAt: s.sessionStartedAt,
    updatedAt: s.updatedAt,
  }
}

/** Applies a transition locally, then mirrors it to storage and the other tabs. */
function commit(patch: Partial<TimerSnapshot>): void {
  const next = { ...snapshotOf(useTimerStore.getState()), ...patch, updatedAt: Date.now() }
  useTimerStore.setState({ ...next, now: Date.now() })
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage can be disabled; the timer still works for this tab's lifetime.
  }
  channel?.postMessage(next)
  syncTicker()
}

function adopt(incoming: TimerSnapshot): void {
  if (incoming.updatedAt <= useTimerStore.getState().updatedAt) return
  useTimerStore.setState({ ...incoming, now: Date.now() })
  syncTicker()
}

function readPersisted(): TimerSnapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<TimerSnapshot>
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !['idle', 'running', 'paused'].includes(String(parsed.status)) ||
      !['work', 'short', 'long'].includes(String(parsed.phase))
    ) {
      return null
    }
    return { ...idleSnapshot(currentSettings()), ...parsed } as TimerSnapshot
  } catch {
    return null
  }
}

/* ---------------------------------------------------- phase-end transitions */

type EndMode = 'complete' | 'skip' | 'abort'

/** Guards against two ticks racing into the same transition within one tab. */
let ending = false

async function endPhase(mode: EndMode): Promise<void> {
  if (ending) return
  ending = true
  try {
    const state = useTimerStore.getState()
    if (state.status === 'idle' || state.sessionStartedAt === null) return
    const settings = currentSettings()
    const now = Date.now()
    const plannedEnd = (state.phaseStartedAt ?? now) + state.phaseDurationSec * 1000
    const completed = mode === 'complete'
    const endedAt = completed ? plannedEnd : now
    const durationSec = completed
      ? state.phaseDurationSec
      : Math.max(0, Math.round(elapsedSec(state, now)))

    if (completed || durationSec >= MIN_LOGGED_SEC) {
      await writeSession(state, { endedAt, durationSec, completed })
    }

    if (mode === 'abort') {
      commit({
        phase: 'work',
        status: 'idle',
        phaseStartedAt: null,
        sessionStartedAt: null,
        pausedElapsedSec: 0,
        phaseDurationSec: settings.workMin * 60,
      })
      return
    }

    const workCount = workCountAfter(state.phase, state.workCount, completed)
    const next = phaseAfter(state.phase, workCount, settings)
    const nextDurationSec = phaseMinutes(settings, next) * 60

    if (completed && useTimerStore.getState().isOwner) {
      announce(state.phase, next, settings)
    }

    // If the tab was asleep well past the end, don't silently burn the next
    // phase (or cascade through a night's worth of them) — land idle instead.
    const overshootSec = Math.max(0, (Date.now() - endedAt) / 1000)
    const canChain = overshootSec < nextDurationSec
    const autoStart =
      canChain && (next === 'work' ? settings.autoStartWork : settings.autoStartBreaks)

    commit({
      phase: next,
      phaseDurationSec: nextDurationSec,
      workCount,
      pausedElapsedSec: 0,
      status: autoStart ? 'running' : 'idle',
      // Chain from the previous phase's end so the clock stays honest.
      phaseStartedAt: autoStart ? endedAt : null,
      sessionStartedAt: autoStart ? endedAt : null,
    })
  } finally {
    ending = false
  }
}

async function writeSession(
  state: TimerSnapshot,
  { endedAt, durationSec, completed }: { endedAt: number; durationSec: number; completed: boolean },
): Promise<void> {
  if (state.sessionStartedAt === null) return
  // Deterministic id: if two tabs both notice the phase ended, the second
  // insert collides on the primary key and is discarded. One row, always.
  const id = `s_${state.sessionStartedAt}_${state.phase}`
  try {
    await db.sessions.add({
      id,
      taskId: state.phase === 'work' ? state.taskId : undefined,
      taskTitle: state.phase === 'work' ? state.taskTitle : undefined,
      type: state.phase,
      startedAt: state.sessionStartedAt,
      endedAt,
      durationSec,
      completed,
      updatedAt: Date.now(),
    })
  } catch {
    // Duplicate key — another tab already logged this phase.
  }
}

function announce(finished: PhaseType, next: PhaseType, settings: Settings): void {
  if (settings.soundEnabled) playChime(finished === 'work' ? 'work-done' : 'break-done')
  if (settings.notificationsEnabled) {
    const body =
      finished === 'work'
        ? `Time for a ${next === 'long' ? 'long' : 'short'} break.`
        : 'Break over — back to focus.'
    notify(`${PHASE_LABEL[finished]} complete`, body)
  }
}

/* ------------------------------------------------------------- the ticker */

let worker: Worker | null = null
let fallbackInterval: ReturnType<typeof setInterval> | null = null
let tickerRunning = false

function onTick(): void {
  const state = useTimerStore.getState()
  const now = Date.now()
  useTimerStore.setState({ now })
  if (isComplete(state, now)) void endPhase('complete')
}

function syncTicker(): void {
  const shouldRun = useTimerStore.getState().status === 'running'
  if (shouldRun === tickerRunning) return
  tickerRunning = shouldRun
  if (worker) {
    worker.postMessage(shouldRun ? { type: 'start', intervalMs: TICK_MS } : { type: 'stop' })
  } else if (shouldRun) {
    fallbackInterval = setInterval(onTick, TICK_MS)
  } else if (fallbackInterval) {
    clearInterval(fallbackInterval)
    fallbackInterval = null
  }
}

/* --------------------------------------------------------------- lifecycle */

let initialised = false
let releaseOwnership: (() => void) | null = null

/** Wires up persistence, cross-tab sync, ownership and the ticker. Idempotent. */
export function initTimer(): () => void {
  if (initialised) return () => {}
  initialised = true

  const persisted = readPersisted()
  if (persisted) {
    useTimerStore.setState({ ...persisted, now: Date.now(), hydrated: true })
  } else {
    useTimerStore.setState({ hydrated: true })
  }

  try {
    worker = new TimerWorker()
    worker.onmessage = () => onTick()
  } catch {
    worker = null // No worker support: fall back to a main-thread interval.
  }

  try {
    channel = new BroadcastChannel(CHANNEL_NAME)
    channel.onmessage = (event: MessageEvent<TimerSnapshot>) => adopt(event.data)
  } catch {
    channel = null
  }

  // Fallback sync path for browsers without BroadcastChannel.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return
    try {
      adopt(JSON.parse(event.newValue) as TimerSnapshot)
    } catch {
      /* ignore malformed payloads */
    }
  }
  window.addEventListener('storage', onStorage)

  // Coming back to a throttled tab: settle the clock immediately.
  const onVisibility = () => {
    if (document.visibilityState === 'visible') onTick()
  }
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('focus', onVisibility)

  // Exactly one tab holds this lock; it is the one allowed to make noise. The
  // lock is held for as long as the returned promise is pending, so keep the
  // resolver around — without it a StrictMode remount would queue behind a lock
  // nobody can release, and no tab would ever be the owner.
  if (navigator.locks?.request) {
    void navigator.locks.request(
      'pomotab.timer.owner',
      { mode: 'exclusive' },
      () =>
        new Promise<void>((release) => {
          releaseOwnership = release
          useTimerStore.setState({ isOwner: true })
        }),
    )
  } else {
    useTimerStore.setState({ isOwner: true })
  }

  // Keep an idle timer's displayed duration in step with the settings.
  const unsubSettings = useSettingsStore.subscribe((s) => {
    const state = useTimerStore.getState()
    if (state.status !== 'idle') return
    const want = phaseMinutes(s.settings, state.phase) * 60
    if (want !== state.phaseDurationSec) useTimerStore.setState({ phaseDurationSec: want })
  })

  syncTicker()
  onTick() // Catch up on anything that finished while the tab was closed.

  return () => {
    window.removeEventListener('storage', onStorage)
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('focus', onVisibility)
    unsubSettings()
    releaseOwnership?.()
    releaseOwnership = null
    worker?.terminate()
    worker = null
    channel?.close()
    channel = null
    if (fallbackInterval) clearInterval(fallbackInterval)
    fallbackInterval = null
    tickerRunning = false
    useTimerStore.setState({ isOwner: false })
    initialised = false
  }
}
