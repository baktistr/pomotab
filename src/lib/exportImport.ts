import { db, saveSettings } from './db'
import type { Snapshot } from './exportSchema'
import { dayKey } from './format'
import { ImportError } from './importError'
import { DEFAULT_SETTINGS, type Board, type Column, type Session, type Settings, type Task } from './types'

export { ImportError }
export type { Snapshot }

export const SCHEMA_VERSION = 1

/* ------------------------------------------------------------------ export */

export async function buildSnapshot(): Promise<Snapshot> {
  const [settings, boards, columns, tasks, sessions] = await Promise.all([
    db.settings.get('settings'),
    db.boards.toArray(),
    db.columns.toArray(),
    db.tasks.toArray(),
    db.sessions.toArray(),
  ])
  return {
    app: 'pomotab',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    settings: { ...DEFAULT_SETTINGS, ...settings },
    boards,
    columns,
    tasks,
    sessions,
  }
}

export function exportFilename(now = Date.now()): string {
  return `pomotab-export-${dayKey(now)}.json`
}

/** Serialises everything to a downloaded file and records the backup time. */
export async function exportToFile(): Promise<{ filename: string; records: number }> {
  const snapshot = await buildSnapshot()
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const filename = exportFilename()
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)

  await saveSettings({ lastExportAt: Date.now() })
  return {
    filename,
    records:
      snapshot.boards.length +
      snapshot.columns.length +
      snapshot.tasks.length +
      snapshot.sessions.length,
  }
}

/* ------------------------------------------------------------------ import */

export type ImportMode = 'replace' | 'merge'

export interface ImportResult {
  mode: ImportMode
  boards: number
  columns: number
  tasks: number
  sessions: number
  /** Rows referencing a board/column that does not exist after the import. */
  skippedOrphans: number
}

/** Validates a file against the export schema. Throws `ImportError` on refusal. */
export async function parseSnapshot(text: string): Promise<Snapshot> {
  const { parse } = await import('./exportSchema')
  return parse(text)
}

function newestWins<T extends { id: string; updatedAt: number }>(existing: T[], incoming: T[]): T[] {
  const byId = new Map(existing.map((row) => [row.id, row]))
  for (const row of incoming) {
    const current = byId.get(row.id)
    if (!current || row.updatedAt >= current.updatedAt) byId.set(row.id, row)
  }
  return [...byId.values()]
}

export async function importSnapshot(snapshot: Snapshot, mode: ImportMode): Promise<ImportResult> {
  const existing =
    mode === 'merge'
      ? await Promise.all([
          db.boards.toArray(),
          db.columns.toArray(),
          db.tasks.toArray(),
          db.sessions.toArray(),
        ])
      : [[], [], [], []]
  const [exBoards, exColumns, exTasks, exSessions] = existing as [Board[], Column[], Task[], Session[]]

  const boards = newestWins(exBoards, snapshot.boards as Board[])
  const columns = newestWins(exColumns, snapshot.columns as Column[])
  const tasks = newestWins(exTasks, snapshot.tasks as Task[])
  const sessions = newestWins(exSessions, snapshot.sessions as Session[])

  // Drop rows whose parent is missing rather than writing invisible data.
  const boardIds = new Set(boards.map((b) => b.id))
  const liveColumns = columns.filter((c) => boardIds.has(c.boardId))
  const columnIds = new Set(liveColumns.map((c) => c.id))
  const liveTasks = tasks.filter((t) => boardIds.has(t.boardId) && columnIds.has(t.columnId))
  const skippedOrphans = columns.length - liveColumns.length + (tasks.length - liveTasks.length)

  await db.transaction('rw', db.boards, db.columns, db.tasks, db.sessions, async () => {
    if (mode === 'replace') {
      await Promise.all([
        db.boards.clear(),
        db.columns.clear(),
        db.tasks.clear(),
        db.sessions.clear(),
      ])
    }
    await db.boards.bulkPut(boards)
    await db.columns.bulkPut(liveColumns)
    await db.tasks.bulkPut(liveTasks)
    await db.sessions.bulkPut(sessions)
  })

  if (snapshot.settings) {
    const { id: _id, updatedAt: _updatedAt, ...patch } = snapshot.settings as Partial<Settings>
    await saveSettings(patch)
  }

  return {
    mode,
    boards: boards.length,
    columns: liveColumns.length,
    tasks: liveTasks.length,
    sessions: sessions.length,
    skippedOrphans,
  }
}

/** Danger zone: removes every trace of the user's data from this device. */
export async function wipeAllData(): Promise<void> {
  await db.transaction('rw', db.boards, db.columns, db.tasks, db.sessions, db.settings, async () => {
    await Promise.all([
      db.boards.clear(),
      db.columns.clear(),
      db.tasks.clear(),
      db.sessions.clear(),
      db.settings.clear(),
    ])
  })
  try {
    localStorage.removeItem('pomotab.timer')
  } catch {
    /* nothing to clean up */
  }
}

/** Days since the last export, or null if the user has never exported. */
export function daysSinceExport(settings: Settings, now = Date.now()): number | null {
  if (!settings.lastExportAt) return null
  return Math.floor((now - settings.lastExportAt) / 86_400_000)
}
