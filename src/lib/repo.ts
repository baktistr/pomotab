import { generateKeyBetween } from 'fractional-indexing'
import { db, requestPersistence } from './db'
import { byOrder, orderAt, orderBetween } from './ordering'
import type { Board, Column, Session, Task } from './types'
import { uid } from './utils'

export { byOrder, orderAt, orderBetween }

function touch<T extends object>(patch: T): T & { updatedAt: number } {
  return { ...patch, updatedAt: Date.now() }
}

/* ------------------------------------------------------------------ boards */

export async function createBoard(name: string): Promise<string> {
  void requestPersistence()
  const boards = byOrder(await db.boards.toArray())
  const now = Date.now()
  const id = uid()
  await db.transaction('rw', db.boards, db.columns, async () => {
    await db.boards.add({
      id,
      name: name.trim() || 'Untitled board',
      order: orderBetween(boards.at(-1)?.order, null),
      createdAt: now,
      updatedAt: now,
    })
    let key: string | null = null
    for (const columnName of ['Backlog', 'Doing', 'Done']) {
      key = generateKeyBetween(key, null)
      await db.columns.add({
        id: uid(),
        boardId: id,
        name: columnName,
        order: key,
        createdAt: now,
        updatedAt: now,
      })
    }
  })
  return id
}

export async function updateBoard(id: string, patch: Partial<Board>): Promise<void> {
  await db.boards.update(id, touch(patch))
}

/**
 * Deletes the board, its columns and its tasks. Sessions survive — they carry a
 * snapshot of the task title so history stays truthful.
 */
export async function deleteBoard(id: string): Promise<void> {
  await db.transaction('rw', db.boards, db.columns, db.tasks, async () => {
    await db.tasks.where('boardId').equals(id).delete()
    await db.columns.where('boardId').equals(id).delete()
    await db.boards.delete(id)
  })
}

/* ----------------------------------------------------------------- columns */

export async function createColumn(boardId: string, name: string): Promise<string> {
  void requestPersistence()
  const columns = byOrder(await db.columns.where('boardId').equals(boardId).toArray())
  const now = Date.now()
  const id = uid()
  await db.columns.add({
    id,
    boardId,
    name: name.trim() || 'New column',
    order: orderBetween(columns.at(-1)?.order, null),
    createdAt: now,
    updatedAt: now,
  })
  return id
}

export async function updateColumn(id: string, patch: Partial<Column>): Promise<void> {
  await db.columns.update(id, touch(patch))
}

export async function deleteColumn(id: string): Promise<void> {
  await db.transaction('rw', db.columns, db.tasks, async () => {
    await db.tasks.where('columnId').equals(id).delete()
    await db.columns.delete(id)
  })
}

export async function moveColumn(boardId: string, columnId: string, toIndex: number): Promise<void> {
  const columns = byOrder(await db.columns.where('boardId').equals(boardId).toArray())
  const without = columns.filter((c) => c.id !== columnId)
  await db.columns.update(columnId, touch({ order: orderAt(without, toIndex) }))
}

/* ------------------------------------------------------------------- tasks */

export async function createTask(
  boardId: string,
  columnId: string,
  title: string,
  extra: Partial<Task> = {},
): Promise<string> {
  void requestPersistence()
  const siblings = byOrder(await db.tasks.where('columnId').equals(columnId).toArray())
  const now = Date.now()
  const id = uid()
  await db.tasks.add({
    id,
    boardId,
    columnId,
    title: title.trim(),
    tags: [],
    order: orderBetween(siblings.at(-1)?.order, null),
    createdAt: now,
    archived: false,
    updatedAt: now,
    ...extra,
  })
  return id
}

export async function updateTask(id: string, patch: Partial<Task>): Promise<void> {
  await db.tasks.update(id, touch(patch))
}

export async function deleteTask(id: string): Promise<void> {
  await db.tasks.delete(id)
}

export async function setTaskComplete(id: string, complete: boolean): Promise<void> {
  await updateTask(id, { completedAt: complete ? Date.now() : undefined })
}

/**
 * Moves a task to `toIndex` within `toColumnId`.
 *
 * Convention: dropping a card into a column literally named "Done" marks it
 * complete, and dragging it back out clears that. Any other completion change
 * is explicit, via the card's checkbox.
 */
export async function moveTask(taskId: string, toColumnId: string, toIndex: number): Promise<void> {
  const task = await db.tasks.get(taskId)
  if (!task) return
  const siblings = byOrder(await db.tasks.where('columnId').equals(toColumnId).toArray())
  const without = siblings.filter((t) => t.id !== taskId)
  const target = await db.columns.get(toColumnId)
  const intoDone = /^done$/i.test(target?.name ?? '')
  const patch: Partial<Task> = {
    columnId: toColumnId,
    order: orderAt(without, toIndex),
  }
  if (intoDone && !task.completedAt) patch.completedAt = Date.now()
  if (!intoDone && task.completedAt && task.columnId !== toColumnId) patch.completedAt = undefined
  await db.tasks.update(taskId, touch(patch))
}

/* ---------------------------------------------------------------- sessions */

export async function addSession(session: Omit<Session, 'id' | 'updatedAt'>): Promise<string> {
  void requestPersistence()
  const id = uid()
  await db.sessions.add({ ...session, id, updatedAt: Date.now() })
  return id
}

export async function updateSession(id: string, patch: Partial<Session>): Promise<void> {
  await db.sessions.update(id, touch(patch))
}

export async function deleteSession(id: string): Promise<void> {
  await db.sessions.delete(id)
}

/** Completed work sessions attributed to a task — the source of its 🍅 count. */
export async function countTaskPomos(taskId: string): Promise<number> {
  return db.sessions
    .where('taskId')
    .equals(taskId)
    .filter((s) => s.type === 'work' && s.completed)
    .count()
}
