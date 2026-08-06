import { create } from 'zustand'

const ACTIVE_BOARD_KEY = 'pomotab.activeBoard'

function readActiveBoard(): string | null {
  try {
    return localStorage.getItem(ACTIVE_BOARD_KEY)
  } catch {
    return null
  }
}

interface UiStore {
  settingsOpen: boolean
  /** Which board the Board page is showing; remembered between visits. */
  activeBoardId: string | null
  /** Incremented by the `n` shortcut; the board opens a card composer on change. */
  newCardSignal: number
  openSettings: () => void
  closeSettings: () => void
  setActiveBoard: (id: string | null) => void
}

export const useUiStore = create<UiStore>((set) => ({
  settingsOpen: false,
  activeBoardId: readActiveBoard(),
  newCardSignal: 0,
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
  setActiveBoard: (id) => {
    try {
      if (id) localStorage.setItem(ACTIVE_BOARD_KEY, id)
      else localStorage.removeItem(ACTIVE_BOARD_KEY)
    } catch {
      /* remembering the board is a convenience, not a requirement */
    }
    set({ activeBoardId: id })
  },
}))
