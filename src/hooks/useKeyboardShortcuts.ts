import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTimerStore } from '@/store/timerStore'
import { useUiStore } from '@/store/uiStore'

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable ||
    target.closest('[role="dialog"]') !== null
  )
}

/**
 * Global shortcuts: Space toggles the timer, `n` starts a new card on the
 * board, `,` opens settings. All are suppressed while typing or in a dialog.
 */
export function useKeyboardShortcuts(): void {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (isTyping(event.target)) return

      if (event.code === 'Space') {
        event.preventDefault()
        useTimerStore.getState().toggle()
        return
      }
      if (event.key === 'n') {
        event.preventDefault()
        if (location.pathname !== '/board') navigate('/board')
        useUiStore.setState((s) => ({ newCardSignal: s.newCardSignal + 1 }))
        return
      }
      if (event.key === ',') {
        event.preventDefault()
        useUiStore.getState().openSettings()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigate, location.pathname])
}
