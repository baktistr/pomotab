import Dexie, { type Table } from 'dexie'
import { generateKeyBetween } from 'fractional-indexing'
import { DEFAULT_SETTINGS, type Board, type Column, type Session, type Settings, type Task } from './types'
import { uid } from './utils'

/**
 * Everything the user owns lives here and nowhere else. There is no sync, no
 * remote mirror, and no telemetry.
 *
 * Booleans (`archived`, `completed`) are deliberately un-indexed: IndexedDB
 * cannot use them as keys, and the collections are small enough to filter in
 * memory.
 */
export class PomoTabDB extends Dexie {
  boards!: Table<Board, string>
  columns!: Table<Column, string>
  tasks!: Table<Task, string>
  sessions!: Table<Session, string>
  settings!: Table<Settings, string>

  constructor() {
    super('pomotab')
    this.version(1).stores({
      boards: 'id, order, createdAt',
      columns: 'id, boardId, order',
      tasks: 'id, boardId, columnId, order, createdAt, completedAt',
      sessions: 'id, taskId, type, startedAt',
      settings: 'id',
    })

    this.on('populate', () => {
      const now = Date.now()
      const boardId = uid()
      void this.boards.add({
        id: boardId,
        name: 'Personal',
        order: generateKeyBetween(null, null),
        createdAt: now,
        updatedAt: now,
      })
      let key: string | null = null
      const names: Array<[string, number | undefined]> = [
        ['Backlog', undefined],
        ['Doing', 2],
        ['Done', undefined],
      ]
      for (const [name, wipLimit] of names) {
        key = generateKeyBetween(key, null)
        void this.columns.add({
          id: uid(),
          boardId,
          name,
          order: key,
          wipLimit,
          createdAt: now,
          updatedAt: now,
        })
      }
      void this.settings.add({ ...DEFAULT_SETTINGS, updatedAt: now })
    })
  }
}

export const db = new PomoTabDB()

/**
 * Asks the browser not to evict IndexedDB under storage pressure. Called once
 * per session on the first write; failure is non-fatal (Safari says no unless
 * the app is installed, for instance).
 */
let persistenceRequested = false
export async function requestPersistence(): Promise<boolean> {
  if (persistenceRequested) return false
  persistenceRequested = true
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

/** The settings row always exists after `populate`, but be defensive. */
export async function getSettings(): Promise<Settings> {
  const row = await db.settings.get('settings')
  if (row) return { ...DEFAULT_SETTINGS, ...row }
  const fresh = { ...DEFAULT_SETTINGS, updatedAt: Date.now() }
  await db.settings.put(fresh)
  return fresh
}

export async function saveSettings(patch: Partial<Omit<Settings, 'id'>>): Promise<Settings> {
  const current = await getSettings()
  const next: Settings = { ...current, ...patch, id: 'settings', updatedAt: Date.now() }
  await db.settings.put(next)
  return next
}
