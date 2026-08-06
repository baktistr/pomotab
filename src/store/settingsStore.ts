import { liveQuery } from 'dexie'
import { create } from 'zustand'
import { getSettings, saveSettings } from '@/lib/db'
import { DEFAULT_SETTINGS, type Settings, type ThemePreference } from '@/lib/types'

interface SettingsStore {
  settings: Settings
  loaded: boolean
  update: (patch: Partial<Omit<Settings, 'id'>>) => Promise<void>
}

export const useSettingsStore = create<SettingsStore>(() => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  update: async (patch) => {
    const next = await saveSettings(patch)
    useSettingsStore.setState({ settings: next, loaded: true })
  },
}))

export function currentSettings(): Settings {
  return useSettingsStore.getState().settings
}

const THEME_KEY = 'pomotab.theme'

export function applyTheme(pref: ThemePreference): void {
  const dark =
    pref === 'dark' ||
    (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#18181b' : '#ffffff')
  try {
    localStorage.setItem(THEME_KEY, pref)
  } catch {
    // Private mode with storage disabled — the class toggle above still works.
  }
}

/** Mirrors the settings row into a synchronous store the timer engine can read. */
export function initSettings(): () => void {
  const sub = liveQuery(() => getSettings()).subscribe({
    next: (settings) => {
      useSettingsStore.setState({ settings, loaded: true })
      applyTheme(settings.theme)
    },
    error: (err) => console.error('settings subscription failed', err),
  })

  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const onSystemChange = () => {
    if (useSettingsStore.getState().settings.theme === 'system') applyTheme('system')
  }
  media.addEventListener('change', onSystemChange)

  return () => {
    sub.unsubscribe()
    media.removeEventListener('change', onSystemChange)
  }
}
