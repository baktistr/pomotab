import { z } from 'zod'
import { ImportError } from './importError'

/**
 * Validation for imported files. Loaded on demand — a user who never imports
 * anything never downloads Zod.
 */

export const SCHEMA_VERSION = 1

const themeSchema = z.enum(['light', 'dark', 'system'])
const phaseSchema = z.enum(['work', 'short', 'long'])

const boardSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  order: z.string().min(1),
  createdAt: z.number(),
  updatedAt: z.number().default(0),
})

const columnSchema = z.object({
  id: z.string().min(1),
  boardId: z.string().min(1),
  name: z.string(),
  order: z.string().min(1),
  wipLimit: z.number().int().positive().optional(),
  createdAt: z.number(),
  updatedAt: z.number().default(0),
})

const taskSchema = z.object({
  id: z.string().min(1),
  boardId: z.string().min(1),
  columnId: z.string().min(1),
  title: z.string(),
  notes: z.string().optional(),
  tags: z.array(z.string()).default([]),
  estimatePomos: z.number().int().nonnegative().optional(),
  order: z.string().min(1),
  createdAt: z.number(),
  completedAt: z.number().optional(),
  archived: z.boolean().default(false),
  updatedAt: z.number().default(0),
})

const sessionSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().optional(),
  taskTitle: z.string().optional(),
  type: phaseSchema,
  startedAt: z.number(),
  endedAt: z.number(),
  durationSec: z.number().nonnegative(),
  completed: z.boolean(),
  note: z.string().optional(),
  updatedAt: z.number().default(0),
})

const settingsSchema = z.object({
  id: z.literal('settings').default('settings'),
  workMin: z.number().int().min(1).max(180),
  shortBreakMin: z.number().int().min(1).max(180),
  longBreakMin: z.number().int().min(1).max(180),
  longBreakEvery: z.number().int().min(1).max(12),
  autoStartBreaks: z.boolean(),
  autoStartWork: z.boolean(),
  soundEnabled: z.boolean(),
  notificationsEnabled: z.boolean(),
  theme: themeSchema,
  lastExportAt: z.number().optional(),
  updatedAt: z.number().default(0),
})

export const snapshotSchema = z.object({
  app: z.literal('pomotab'),
  schemaVersion: z.number().int().positive(),
  exportedAt: z.string(),
  settings: settingsSchema.partial().optional(),
  boards: z.array(boardSchema).default([]),
  columns: z.array(columnSchema).default([]),
  tasks: z.array(taskSchema).default([]),
  sessions: z.array(sessionSchema).default([]),
})

export type Snapshot = z.infer<typeof snapshotSchema>

export function parse(text: string): Snapshot {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new ImportError('That file is not valid JSON.')
  }
  if (typeof raw !== 'object' || raw === null) {
    throw new ImportError('That file does not contain a PomoTab export.')
  }
  if ((raw as { app?: unknown }).app !== 'pomotab') {
    throw new ImportError('That file was not exported from PomoTab.')
  }
  const parsed = snapshotSchema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    throw new ImportError(
      `The file does not match the PomoTab format${
        first ? ` (${first.path.join('.')}: ${first.message})` : ''
      }.`,
    )
  }
  if (parsed.data.schemaVersion > SCHEMA_VERSION) {
    throw new ImportError(
      `This file was written by a newer version of PomoTab (schema v${parsed.data.schemaVersion}). Update the app first.`,
    )
  }
  return parsed.data
}
