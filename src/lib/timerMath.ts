import type { PhaseType, Settings } from './types'

export type TimerStatus = 'idle' | 'running' | 'paused'

/**
 * The part of the timer that is shared across tabs and survives a reload.
 * Everything else (remaining seconds, progress) is *derived* from these
 * timestamps, which is what makes the countdown immune to background-tab
 * throttling.
 */
export interface TimerSnapshot {
  phase: PhaseType
  status: TimerStatus
  /** Shifted forward on resume so `now - phaseStartedAt` is always running time. */
  phaseStartedAt: number | null
  phaseDurationSec: number
  /** Running time accumulated when the timer was paused. */
  pausedElapsedSec: number
  /** Work phases completed since the last long break; drives the cadence. */
  workCount: number
  taskId?: string
  taskTitle?: string
  /** Wall-clock start of the phase — becomes `Session.startedAt`. */
  sessionStartedAt: number | null
  updatedAt: number
}

export function elapsedSec(s: TimerSnapshot, now: number): number {
  if (s.status === 'running' && s.phaseStartedAt) return (now - s.phaseStartedAt) / 1000
  if (s.status === 'paused') return s.pausedElapsedSec
  return 0
}

export function remainingSec(s: TimerSnapshot, now: number): number {
  return Math.max(0, s.phaseDurationSec - elapsedSec(s, now))
}

export function progress(s: TimerSnapshot, now: number): number {
  if (s.phaseDurationSec <= 0) return 0
  return Math.min(1, Math.max(0, elapsedSec(s, now) / s.phaseDurationSec))
}

export function isComplete(s: TimerSnapshot, now: number): boolean {
  return s.status === 'running' && elapsedSec(s, now) >= s.phaseDurationSec
}

/**
 * The work-phase tally once `phase` ends. A long break closes the cycle, and
 * skipped work never counts toward the next one — you don't earn a long break
 * by abandoning pomodoros.
 */
export function workCountAfter(phase: PhaseType, workCount: number, completed: boolean): number {
  if (phase === 'long') return 0
  if (phase === 'work' && completed) return workCount + 1
  return workCount
}

/** Which phase follows, given the tally `workCountAfter` produced. */
export function phaseAfter(phase: PhaseType, tally: number, settings: Settings): PhaseType {
  if (phase !== 'work') return 'work'
  return tally > 0 && tally % settings.longBreakEvery === 0 ? 'long' : 'short'
}

/**
 * The phase the user is heading for if the current one runs to completion —
 * used for the "Next: …" hint, so it assumes success.
 */
export function nextPhaseAfter(phase: PhaseType, workCount: number, settings: Settings): PhaseType {
  return phaseAfter(phase, workCountAfter(phase, workCount, true), settings)
}
