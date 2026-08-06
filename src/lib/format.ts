/** Formatting helpers shared by the timer, board and activity surfaces. */

/** `1500` → `"25:00"`, `3725` → `"1:02:05"`. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(s / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  const seconds = s % 60
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes)
  return hours > 0
    ? `${hours}:${mm}:${String(seconds).padStart(2, '0')}`
    : `${mm.padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/** `6300` → `"1h 45m"`, `540` → `"9m"`, `30` → `"30s"`. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  if (s < 60) return `${s}s`
  const hours = Math.floor(s / 3600)
  const minutes = Math.round((s % 3600) / 60)
  if (hours === 0) return `${minutes}m`
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}m`
}

export function formatTimeOfDay(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function formatDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatDateShort(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

/** Local-time day boundaries — all stats are "what the user's clock says". */
export function startOfDay(epochMs: number): number {
  const d = new Date(epochMs)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function endOfDay(epochMs: number): number {
  return startOfDay(epochMs) + 24 * 60 * 60 * 1000
}

/** Weeks start on Monday. */
export function startOfWeek(epochMs: number): number {
  const d = new Date(startOfDay(epochMs))
  const dow = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - dow)
  return d.getTime()
}

export function startOfMonth(epochMs: number): number {
  const d = new Date(epochMs)
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function addDays(epochMs: number, days: number): number {
  const d = new Date(epochMs)
  d.setDate(d.getDate() + days)
  return d.getTime()
}

export function addMonths(epochMs: number, months: number): number {
  const d = new Date(epochMs)
  d.setMonth(d.getMonth() + months)
  return d.getTime()
}

export function isSameDay(a: number, b: number): boolean {
  return startOfDay(a) === startOfDay(b)
}

export function dayKey(epochMs: number): string {
  const d = new Date(epochMs)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}
