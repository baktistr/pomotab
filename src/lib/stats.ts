import { addDays, dayKey, startOfDay } from './format'
import type { Session, Task } from './types'

/** Everything on the Activity page is a pure derivation over `sessions`. */

export function inRange(sessions: Session[], from: number, to: number): Session[] {
  return sessions
    .filter((s) => s.startedAt >= from && s.startedAt < to)
    .sort((a, b) => a.startedAt - b.startedAt)
}

export interface RangeSummary {
  focusedSec: number
  pomodoros: number
  breakSec: number
  /** Work phases that were skipped or aborted. */
  abandoned: number
}

export function summarize(sessions: Session[]): RangeSummary {
  let focusedSec = 0
  let pomodoros = 0
  let breakSec = 0
  let abandoned = 0
  for (const s of sessions) {
    if (s.type === 'work') {
      // Partial work still counts as time focused; only completed phases are 🍅.
      focusedSec += s.durationSec
      if (s.completed) pomodoros += 1
      else abandoned += 1
    } else {
      breakSec += s.durationSec
    }
  }
  return { focusedSec, pomodoros, breakSec, abandoned }
}

/** 24 buckets of focused seconds, split across hour boundaries. */
export function focusByHour(sessions: Session[], dayStart: number): number[] {
  const buckets = new Array<number>(24).fill(0)
  for (const s of sessions) {
    if (s.type !== 'work') continue
    // A session can straddle hours; attribute each slice to the hour it fell in.
    const from = Math.max(s.startedAt, dayStart)
    const to = Math.min(s.endedAt, dayStart + 24 * 3600_000)
    if (to <= from) continue
    let cursor = from
    while (cursor < to) {
      const hour = new Date(cursor).getHours()
      const hourEnd = new Date(cursor).setMinutes(60, 0, 0)
      const slice = Math.min(hourEnd, to) - cursor
      buckets[hour] += slice / 1000
      cursor += slice
    }
  }
  return buckets
}

export interface DayBucket {
  key: string
  start: number
  focusedSec: number
  pomodoros: number
}

export function focusByDay(sessions: Session[], from: number, days: number): DayBucket[] {
  const buckets: DayBucket[] = []
  const index = new Map<string, DayBucket>()
  for (let i = 0; i < days; i++) {
    const start = addDays(from, i)
    const bucket: DayBucket = { key: dayKey(start), start, focusedSec: 0, pomodoros: 0 }
    buckets.push(bucket)
    index.set(bucket.key, bucket)
  }
  for (const s of sessions) {
    if (s.type !== 'work') continue
    const bucket = index.get(dayKey(s.startedAt))
    if (!bucket) continue
    bucket.focusedSec += s.durationSec
    if (s.completed) bucket.pomodoros += 1
  }
  return buckets
}

export function tasksCompletedInRange(tasks: Task[], from: number, to: number): Task[] {
  return tasks.filter((t) => t.completedAt !== undefined && t.completedAt >= from && t.completedAt < to)
}

/**
 * Consecutive days ending today (or yesterday, if today has not started yet)
 * with at least one completed pomodoro.
 */
export function currentStreak(sessions: Session[], now = Date.now()): number {
  const days = new Set<string>()
  for (const s of sessions) {
    if (s.type === 'work' && s.completed) days.add(dayKey(s.startedAt))
  }
  if (days.size === 0) return 0

  let cursor = startOfDay(now)
  // A streak stays alive until the end of today, so start counting from
  // yesterday when today is still empty.
  if (!days.has(dayKey(cursor))) {
    cursor = addDays(cursor, -1)
    if (!days.has(dayKey(cursor))) return 0
  }
  let streak = 0
  while (days.has(dayKey(cursor))) {
    streak += 1
    cursor = addDays(cursor, -1)
  }
  return streak
}

/** Completed work sessions per task id — the 🍅 counts shown on cards. */
export function pomoCountByTask(sessions: Session[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const s of sessions) {
    if (s.type !== 'work' || !s.completed || !s.taskId) continue
    counts.set(s.taskId, (counts.get(s.taskId) ?? 0) + 1)
  }
  return counts
}
