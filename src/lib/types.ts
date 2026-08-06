/**
 * Every entity carries `updatedAt` so the "merge" import strategy can resolve
 * collisions by last-write-wins without a server clock.
 */

export type ThemePreference = 'light' | 'dark' | 'system'

export type PhaseType = 'work' | 'short' | 'long'

export interface Board {
  id: string
  name: string
  order: string
  createdAt: number
  updatedAt: number
}

export interface Column {
  id: string
  boardId: string
  name: string
  order: string
  /** Soft cap surfaced in the UI; nothing is ever blocked, just flagged. */
  wipLimit?: number
  createdAt: number
  updatedAt: number
}

export interface Task {
  id: string
  boardId: string
  columnId: string
  title: string
  notes?: string
  tags: string[]
  estimatePomos?: number
  order: string
  createdAt: number
  completedAt?: number
  archived: boolean
  updatedAt: number
}

export interface Session {
  id: string
  taskId?: string
  /**
   * Snapshot of the task title at the time the session ran, so history stays
   * readable after the task is deleted.
   */
  taskTitle?: string
  type: PhaseType
  startedAt: number
  endedAt: number
  durationSec: number
  /** false when the phase was skipped or aborted before its planned end. */
  completed: boolean
  note?: string
  updatedAt: number
}

export interface Settings {
  /** Singleton row. */
  id: 'settings'
  workMin: number
  shortBreakMin: number
  longBreakMin: number
  longBreakEvery: number
  autoStartBreaks: boolean
  autoStartWork: boolean
  soundEnabled: boolean
  notificationsEnabled: boolean
  theme: ThemePreference
  /** Epoch ms of the last successful export, used for the backup nudge. */
  lastExportAt?: number
  updatedAt: number
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  workMin: 25,
  shortBreakMin: 5,
  longBreakMin: 15,
  longBreakEvery: 4,
  autoStartBreaks: true,
  autoStartWork: false,
  soundEnabled: true,
  notificationsEnabled: false,
  theme: 'system',
  updatedAt: 0,
}

export const PHASE_LABEL: Record<PhaseType, string> = {
  work: 'Focus',
  short: 'Short break',
  long: 'Long break',
}

export function phaseMinutes(settings: Settings, phase: PhaseType): number {
  switch (phase) {
    case 'work':
      return settings.workMin
    case 'short':
      return settings.shortBreakMin
    case 'long':
      return settings.longBreakMin
  }
}
