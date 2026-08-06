/**
 * Browser smoke test against a running build.
 *
 *   npx vite preview --port 4173 &
 *   chrome --headless --remote-debugging-port=9222 &
 *   node scripts/smoke.mjs [baseUrl]
 *
 * Covers the things unit tests cannot: that the app mounts, that the three
 * routes render, that a card written to IndexedDB shows up on the board, and —
 * the important one — that a timer left running across a reload resumes,
 * notices it finished, and writes exactly one session.
 */
import { mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { openPage, wait } from './cdp.mjs'

const BASE = process.argv[2] ?? 'http://127.0.0.1:4173'
const SHOTS = 'shots'
mkdirSync(SHOTS, { recursive: true })

let failures = 0
function check(name, ok, detail = '') {
  if (ok) {
    console.log(`  ✓ ${name}`)
  } else {
    failures++
    console.error(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`)
  }
}

/** Reads a whole object store straight out of IndexedDB, bypassing the app. */
const readStore = (store) => `
  new Promise((resolve, reject) => {
    const open = indexedDB.open('pomotab')
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const db = open.result
      const tx = db.transaction('${store}', 'readonly')
      const req = tx.objectStore('${store}').getAll()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    }
  })
`

// Start from a genuinely empty device so the seed path and the derived counts
// are what is actually under test.
const page = await openPage('about:blank')
await page.clearStorage(BASE)
await page.goto(`${BASE}/`)
await wait(2500)

console.log('\nFocus page')
{
  const text = await page.text()
  check('mounts and shows the shell', text.includes('PomoTab'))
  check('renders the idle countdown', /\b25:00\b/.test(text), text.slice(0, 200))
  check('offers a start control', text.includes('Start'))
  check('shows the untasked default', text.includes('No task'))
  await page.screenshot(`${SHOTS}/focus.png`)
}

console.log('\nSeeded database')
{
  const boards = await page.evaluate(readStore('boards'))
  const columns = await page.evaluate(readStore('columns'))
  check('creates a default board', boards.length === 1, JSON.stringify(boards))
  check(
    'creates Backlog / Doing / Done',
    columns.map((c) => c.name).sort().join(',') === 'Backlog,Doing,Done',
    JSON.stringify(columns.map((c) => c.name)),
  )
  check(
    'keeps a WIP limit on Doing',
    columns.find((c) => c.name === 'Doing')?.wipLimit === 2,
  )
}

console.log('\nBoard page')
{
  // Write a card directly, then confirm the live query renders it.
  const columns = await page.evaluate(readStore('columns'))
  const backlog = columns.find((c) => c.name === 'Backlog')
  await page.evaluate(`
    new Promise((resolve, reject) => {
      const open = indexedDB.open('pomotab')
      open.onsuccess = () => {
        const tx = open.result.transaction('tasks', 'readwrite')
        tx.objectStore('tasks').put({
          id: 'task-smoke', boardId: '${backlog.boardId}', columnId: '${backlog.id}',
          title: 'Write launch blog post', tags: ['launch'], estimatePomos: 3,
          order: 'a0', createdAt: Date.now(), archived: false, updatedAt: Date.now(),
        })
        tx.oncomplete = () => resolve(true)
        tx.onerror = () => reject(tx.error)
      }
    })
  `)
  await page.goto(`${BASE}/board`)
  await wait(2000)
  const text = await page.text()
  check('renders the board name', text.includes('Personal'), text.slice(0, 200))
  check('renders every column', ['Backlog', 'Doing', 'Done'].every((n) => text.includes(n)))
  check('renders the card', text.includes('Write launch blog post'))
  check('renders the estimate', text.includes('🍅 0/3'))
  check('renders the WIP limit', /\b0\/2\b/.test(text))
  await page.screenshot(`${SHOTS}/board.png`)
}

console.log('\nTimer resumes across a reload')
// Keep the whole phase inside today so the "today"/day-range assertions below
// still hold when this runs just after midnight.
const midnight = new Date().setHours(0, 0, 0, 0)
const phaseSec = Math.min(1500, Math.floor((Date.now() - midnight) / 1000) - 10)
const startedAt = Date.now() - phaseSec * 1000 - 2000
{
  if (phaseSec < 60) {
    console.error('  ! skipped: too close to midnight to fit a phase into today')
  } else {
    // Leave a work phase running that ended 2 seconds ago, then reload: the
    // engine must notice on catch-up, log the pomodoro, and move to the break.
    await page.goto(`${BASE}/`)
    await wait(1200)
    await page.evaluate(`
      localStorage.setItem('pomotab.timer', JSON.stringify({
        phase: 'work', status: 'running',
        phaseStartedAt: ${startedAt}, phaseDurationSec: ${phaseSec},
        pausedElapsedSec: 0, workCount: 0,
        taskId: 'task-smoke', taskTitle: 'Write launch blog post',
        sessionStartedAt: ${startedAt}, updatedAt: ${startedAt},
      }))
    `)
    await page.reload()
    await wait(2500)

    const sessions = await page.evaluate(readStore('sessions'))
    check('logs exactly one session', sessions.length === 1, JSON.stringify(sessions))
    const s = sessions[0]
    check('logs it as completed work', s?.type === 'work' && s?.completed === true)
    check('logs the planned duration', s?.durationSec === phaseSec, `got ${s?.durationSec}`)
    check('snapshots the task title', s?.taskTitle === 'Write launch blog post')
    check(
      'ends the session at the planned time',
      Math.abs(s?.endedAt - (startedAt + phaseSec * 1000)) < 1500,
    )

    const text = await page.text()
    check('advances to the short break', text.includes('Short break'), text.slice(0, 300))
    check('counts the pomodoro for today', /1 pomodoro\b/.test(text), text.slice(0, 400))
    await page.screenshot(`${SHOTS}/focus-after.png`)
  }
}

console.log('\nActivity page')
{
  await page.goto(`${BASE}/activity`)
  await wait(2500)
  const text = await page.text()
  // Tile labels are uppercased in CSS, and innerText reflects that.
  const lower = text.toLowerCase()
  check('renders the range switcher', ['Day', 'Week', 'Month'].every((n) => text.includes(n)))
  check(
    'renders the stat tiles',
    ['focused', 'pomodoros', 'tasks done', 'streak'].every((n) => lower.includes(n)),
    text.slice(0, 300),
  )
  check('counts the pomodoro', /\bpomodoros\s*1\b/i.test(text.replace(/\s+/g, ' ')), text.slice(0, 400))
  check('reports a one-day streak', /\b1 day\b/.test(text))
  check('renders the timeline entry', text.includes('Write launch blog post'), text.slice(0, 600))
  await page.screenshot(`${SHOTS}/activity.png`)
}

console.log('\nPrivacy page')
{
  await page.goto(`${BASE}/privacy`)
  await wait(2000)
  const text = await page.text()
  check('renders the privacy explainer', text.includes('Privacy & your data'), text.slice(0, 200))
  check('covers cookies', /no cookies/i.test(text))
  check('lists the storage keys', text.includes('pomotab.timer') && text.includes('IndexedDB'))
  check('warns about clearing site data', /clearing cookies/i.test(text))
  check('is reachable from the footer on every page', await page.evaluate(
    '!!document.querySelector(\'footer a[href="/privacy"]\')',
  ))
  await page.screenshot(`${SHOTS}/privacy.png`)
}

console.log('\nSettings dialog')
{
  await page.goto(`${BASE}/`)
  await wait(1500)
  await page.click('button[aria-label="Settings"]')
  await wait(700)
  // Opening settings must not arm a duration field for typing.
  check(
    'does not autofocus a duration field',
    await page.evaluate('document.activeElement.tagName !== "INPUT"'),
    await page.evaluate('document.activeElement.tagName + "#" + document.activeElement.id'),
  )
  // Every duration input shares one row: same top edge, whatever the label does.
  const tops = await page.evaluate(`(() => {
    const ids = ['workMin', 'shortBreakMin', 'longBreakMin', 'longBreakEvery']
    return ids.map((id) => Math.round(document.getElementById(id).getBoundingClientRect().top))
  })()`)
  check('aligns every duration input on one row', new Set(tops).size === 1, JSON.stringify(tops))
}

console.log('\nDeep links and unknown routes')
{
  await page.goto(`${BASE}/nope`)
  await wait(1500)
  check('unknown routes fall back to Focus', (await page.text()).includes('Short break'))
}

console.log('\nOffline shell')
{
  const sw = await page.evaluate('navigator.serviceWorker.getRegistrations().then(r => r.length)')
  check('registers a service worker', sw > 0, `registrations: ${sw}`)
  check(
    'the service worker controls the page',
    await page.evaluate('!!navigator.serviceWorker.controller'),
  )

  // The VPS can go down mid-session without the user noticing.
  await page.setOffline(true)
  await page.goto(`${BASE}/activity`)
  await wait(2500)
  const offlineText = await page.text()
  check('a deep link still loads with no network', offlineText.includes('PomoTab'), offlineText.slice(0, 200))
  check('the data is still there offline', offlineText.includes('Write launch blog post'))
  await page.screenshot(`${SHOTS}/offline.png`)
  await page.setOffline(false)
}

console.log('\nExport → wipe → import round-trip')
{
  const downloads = resolve(SHOTS, '../.downloads')
  rmSync(downloads, { recursive: true, force: true })
  mkdirSync(downloads, { recursive: true })
  await page.setDownloadPath(downloads)

  await page.goto(`${BASE}/`)
  await wait(1500)
  await page.click('button[aria-label="Settings"]')
  await wait(600)
  await page.clickText('Export JSON')
  await wait(1500)

  const files = readdirSync(downloads).filter((f) => f.endsWith('.json'))
  check('downloads an export file', files.length === 1, readdirSync(downloads).join(', '))
  check(
    'names the file by date',
    /^pomotab-export-\d{4}-\d{2}-\d{2}\.json$/.test(files[0] ?? ''),
    files[0],
  )

  const exportPath = resolve(downloads, files[0])
  const snapshot = JSON.parse(readFileSync(exportPath, 'utf8'))
  check('stamps the app and schema version', snapshot.app === 'pomotab' && snapshot.schemaVersion === 1)
  check('exports the board', snapshot.boards?.length === 1)
  check('exports the columns', snapshot.columns?.length === 3)
  check('exports the card', snapshot.tasks?.[0]?.title === 'Write launch blog post')
  check('exports the session', snapshot.sessions?.length === 1)
  check('exports the settings', snapshot.settings?.workMin === 25)

  // Now become a different device: wipe everything, then import the file.
  await page.clearStorage(BASE)
  await page.goto(`${BASE}/board`)
  await wait(2500)
  check(
    'the wipe really emptied the device',
    !(await page.text()).includes('Write launch blog post'),
  )

  await page.click('button[aria-label="Settings"]')
  await wait(600)
  await page.setFileInput('input[type="file"]', [exportPath])
  await wait(1500)
  await page.clickText('Replace')
  await wait(2000)

  const tasks = await page.evaluate(readStore('tasks'))
  const sessions = await page.evaluate(readStore('sessions'))
  check('restores the card', tasks?.[0]?.title === 'Write launch blog post', JSON.stringify(tasks))
  check('restores its tags', tasks?.[0]?.tags?.[0] === 'launch')
  check('restores the session history', sessions?.length === 1, JSON.stringify(sessions))
  check(
    'restores the pomodoro count on the card',
    sessions?.[0]?.taskId === tasks?.[0]?.id,
  )

  await page.goto(`${BASE}/board`)
  await wait(2000)
  const restored = await page.text()
  check('the board renders the restored card', restored.includes('Write launch blog post'), restored.slice(0, 300))
  check('the restored card keeps its pomodoro count', restored.includes('🍅 1/3'), restored.slice(0, 400))
  await page.screenshot(`${SHOTS}/board-restored.png`)
}

console.log('\nBrowser console')
{
  // A strict CSP is only strict if nothing it blocks is load-bearing. Every
  // violation shows up here, as does any uncaught React error.
  const csp = page.errors.filter((e) => /Content Security Policy/i.test(e))
  check('no CSP violations', csp.length === 0, csp.join('\n      '))
  check('no console errors', page.errors.length === 0, page.errors.join('\n      '))
}

await page.close()

if (failures > 0) {
  console.error(`\n${failures} smoke check(s) failed.`)
  process.exit(1)
}
console.log('\n✓ smoke checks passed')
