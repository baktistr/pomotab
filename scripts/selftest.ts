/**
 * Sanity checks for the pure logic that the UI is built on: clock formatting,
 * date bucketing, activity derivations, timer maths and drag ordering.
 *
 * Run with `npm run selftest` — it bundles with esbuild and executes in Node,
 * so it needs neither a browser nor a test framework.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import {
  addDays,
  dayKey,
  formatClock,
  formatDuration,
  isSameDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from '../src/lib/format'
import { byOrder, orderAt, orderBetween } from '../src/lib/ordering'
import { currentStreak, focusByDay, focusByHour, inRange, summarize } from '../src/lib/stats'
import {
  elapsedSec,
  isComplete,
  nextPhaseAfter,
  phaseAfter,
  progress,
  remainingSec,
  workCountAfter,
  type TimerSnapshot,
} from '../src/lib/timerMath'
import { DEFAULT_SETTINGS, type Session } from '../src/lib/types'

let failures = 0
let checks = 0

function check(name: string, actual: unknown, expected: unknown): void {
  checks++
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) {
    failures++
    console.error(`✗ ${name}\n    expected ${e}\n    actual   ${a}`)
  }
}

function assert(name: string, condition: boolean): void {
  checks++
  if (!condition) {
    failures++
    console.error(`✗ ${name}`)
  }
}

/* ------------------------------------------------------------- formatting */

check('formatClock 25 min', formatClock(1500), '25:00')
check('formatClock rounds down', formatClock(59.9), '00:59')
check('formatClock over an hour', formatClock(3725), '1:02:05')
check('formatClock clamps negatives', formatClock(-10), '00:00')
check('formatDuration seconds', formatDuration(30), '30s')
check('formatDuration minutes', formatDuration(540), '9m')
check('formatDuration hours', formatDuration(6300), '1h 45m')
check('formatDuration whole hours', formatDuration(7200), '2h')

/* ------------------------------------------------------------ date maths */

const wed = new Date(2026, 7, 5, 13, 42, 17).getTime() // Wed 5 Aug 2026
check('startOfDay strips time', new Date(startOfDay(wed)).getHours(), 0)
check('startOfWeek is Monday', new Date(startOfWeek(wed)).getDate(), 3)
check('startOfMonth is the 1st', new Date(startOfMonth(wed)).getDate(), 1)
check('addDays crosses months', new Date(addDays(wed, 27)).getMonth(), 8)
assert('isSameDay ignores time', isSameDay(wed, wed + 3600_000))
assert('isSameDay rejects other days', !isSameDay(wed, addDays(wed, 1)))
check('dayKey is zero padded', dayKey(new Date(2026, 0, 9).getTime()), '2026-01-09')

// A DST-agnostic guarantee: a "day" is whatever the user's clock says.
assert('addDays keeps midnight', new Date(addDays(startOfDay(wed), 40)).getHours() === 0)

/* ---------------------------------------------------------------- stats */

function session(partial: Partial<Session> & { startedAt: number }): Session {
  const durationSec = partial.durationSec ?? 1500
  return {
    id: `s${partial.startedAt}`,
    type: 'work',
    completed: true,
    durationSec,
    endedAt: partial.startedAt + durationSec * 1000,
    updatedAt: 0,
    ...partial,
  }
}

const day = startOfDay(wed)
const sessions: Session[] = [
  session({ startedAt: day + 9 * 3600_000 }), // 09:00 work, 25m
  session({ startedAt: day + 9.5 * 3600_000, type: 'short', durationSec: 300 }),
  session({ startedAt: day + 10 * 3600_000, durationSec: 840, completed: false }), // skipped 14m
  session({ startedAt: day + 14 * 3600_000 }), // 14:00 work
  session({ startedAt: addDays(day, 1) + 9 * 3600_000 }), // tomorrow — out of range
]

const today = inRange(sessions, day, addDays(day, 1))
check('inRange excludes other days', today.length, 4)
assert(
  'inRange sorts ascending',
  today.every((s, i) => i === 0 || today[i - 1].startedAt <= s.startedAt),
)

const summary = summarize(today)
check('summarize counts completed pomodoros', summary.pomodoros, 2)
check('summarize counts abandoned work', summary.abandoned, 1)
check('summarize sums work seconds including partials', summary.focusedSec, 1500 + 840 + 1500)
check('summarize keeps break time separate', summary.breakSec, 300)

const hours = focusByHour(today, day)
check('focusByHour ignores breaks', hours[9] > 0 && hours[10] > 0, true)
check('focusByHour attributes 14:00 work', Math.round(hours[14]), 1500)
check('focusByHour total matches work time', Math.round(hours.reduce((a, b) => a + b, 0)), 3840)

// A session that straddles an hour boundary is split across both buckets.
const straddle = focusByHour([session({ startedAt: day + 10.75 * 3600_000, durationSec: 1800 })], day)
check('focusByHour splits across the boundary', Math.round(straddle[10]), 900)
check('focusByHour puts the rest in the next hour', Math.round(straddle[11]), 900)

const week = focusByDay(sessions, day, 3)
check('focusByDay buckets today', week[0].pomodoros, 2)
check('focusByDay buckets tomorrow', week[1].pomodoros, 1)
check('focusByDay pads empty days', week[2].focusedSec, 0)

/* --------------------------------------------------------------- streak */

const now = new Date(2026, 7, 5, 20, 0, 0).getTime()
const streakDays = [0, -1, -2].map((offset) =>
  session({ startedAt: addDays(startOfDay(now), offset) + 10 * 3600_000 }),
)
check('currentStreak counts consecutive days', currentStreak(streakDays, now), 3)
check(
  'currentStreak survives an empty today',
  currentStreak(streakDays.slice(1), now),
  2,
)
check(
  'currentStreak breaks on a gap',
  currentStreak([...streakDays.slice(0, 1), session({ startedAt: addDays(startOfDay(now), -5) })], now),
  1,
)
check('currentStreak ignores skipped work', currentStreak([session({ startedAt: now, completed: false })], now), 0)
check('currentStreak with no history', currentStreak([], now), 0)

/* ----------------------------------------------------------- timer maths */

const base: TimerSnapshot = {
  phase: 'work',
  status: 'running',
  phaseStartedAt: now,
  phaseDurationSec: 1500,
  pausedElapsedSec: 0,
  workCount: 0,
  sessionStartedAt: now,
  updatedAt: now,
}

check('remaining is derived from timestamps', remainingSec(base, now + 60_000), 1440)
check('remaining never goes below zero', remainingSec(base, now + 9_999_999), 0)
check('elapsed while paused uses the stored value', elapsedSec({ ...base, status: 'paused', pausedElapsedSec: 42 }, now + 999_999), 42)
check('idle has no elapsed time', elapsedSec({ ...base, status: 'idle' }, now + 999_999), 0)
check('progress is a 0..1 fraction', progress(base, now + 750_000), 0.5)
check('progress clamps at 1', progress(base, now + 9_999_999), 1)
assert('a phase past its duration is complete', isComplete(base, now + 1_500_001))
assert('a phase inside its duration is not', !isComplete(base, now + 1_499_000))
assert('a paused phase never completes on its own', !isComplete({ ...base, status: 'paused', pausedElapsedSec: 99_999 }, now))

// Background-tab throttling: no ticks for 20 minutes must not lose 20 minutes.
check('a 20-minute freeze still counts down', remainingSec(base, now + 20 * 60_000), 300)

const settings = { ...DEFAULT_SETTINGS, longBreakEvery: 4 }
check('work → short break', phaseAfter('work', 1, settings), 'short')
check('the 4th pomodoro earns a long break', phaseAfter('work', 4, settings), 'long')
check('breaks always return to work', phaseAfter('short', 3, settings), 'work')
check('long breaks return to work', phaseAfter('long', 0, settings), 'work')
check('completing work advances the tally', workCountAfter('work', 3, true), 4)
check('skipping work does not', workCountAfter('work', 3, false), 3)
check('a long break resets the cycle', workCountAfter('long', 4, true), 0)
check('a skipped 4th pomodoro gets a short break', phaseAfter('work', workCountAfter('work', 3, false), settings), 'short')
check('the hint assumes completion', nextPhaseAfter('work', 3, settings), 'long')

/* -------------------------------------------------------------- ordering */

const a = orderBetween(null, null)
const b = orderBetween(a, null)
const between = orderBetween(a, b)
assert('appended keys sort after', a < b)
assert('an inserted key lands between its neighbours', a < between && between < b)

const list = [{ order: a }, { order: b }]
assert('orderAt(0) sorts before everything', orderAt(list, 0) < a)
assert('orderAt(end) sorts after everything', orderAt(list, 2) > b)
const middle = orderAt(list, 1)
assert('orderAt(middle) lands between', a < middle && middle < b)

// A thousand reorders of the same card must stay strictly ordered.
let head = orderBetween(null, null)
let tail = orderBetween(head, null)
for (let i = 0; i < 1000; i++) {
  const inserted = orderBetween(head, tail)
  assert(`reorder ${i} stays ordered`, head < inserted && inserted < tail)
  head = inserted
}

check(
  'byOrder sorts lexicographically',
  byOrder([{ order: 'a2' }, { order: 'a0' }, { order: 'a1' }]).map((x) => x.order),
  ['a0', 'a1', 'a2'],
)

/* ------------------------------------------------------ CSP / inline script */

// index.html inlines a theme bootstrap so the page never flashes the wrong
// colours. `script-src 'self'` would block it, so nginx allows exactly that one
// script by hash — which silently breaks the moment the script is edited.
{
  const html = readFileSync('index.html', 'utf8')
  const nginx = readFileSync('nginx.conf', 'utf8')
  const inline = /<script>([\s\S]*?)<\/script>/.exec(html)
  assert('index.html still has exactly one inline script', inline !== null)
  assert(
    'index.html has no second inline script',
    (html.match(/<script>/g) ?? []).length === 1,
  )
  if (inline) {
    const digest = `sha256-${createHash('sha256').update(inline[1], 'utf8').digest('base64')}`
    assert(
      `nginx CSP allows the inline theme script (expected '${digest}')`,
      nginx.includes(`'${digest}'`),
    )
  }
  assert("CSP does not fall back to 'unsafe-inline' for scripts", !/script-src[^;]*unsafe-inline/.test(nginx))
  assert('CSP is applied unconditionally', nginx.includes('Content-Security-Policy'))
}

/* ---------------------------------------------------------------- verdict */

if (failures > 0) {
  console.error(`\n${failures} of ${checks} checks failed.`)
  process.exit(1)
}
console.log(`✓ all ${checks} checks passed`)
