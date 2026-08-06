import { useEffect } from 'react'
import { formatClock } from '@/lib/format'
import { remainingSec, useTimerStore } from '@/store/timerStore'

/**
 * Puts the countdown on the browser tab — the feature the app is named after.
 * `(12:34) ▸ PomoTab` while running, `(12:34) ⏸ PomoTab` while paused.
 */
export function useDocumentTitle(): void {
  useEffect(() => {
    const render = () => {
      const s = useTimerStore.getState()
      if (s.status === 'idle') {
        document.title = 'PomoTab'
        return
      }
      const clock = formatClock(remainingSec(s, Date.now()))
      const mark = s.status === 'running' ? '▸' : '⏸'
      document.title = `(${clock}) ${mark} PomoTab`
    }
    render()
    const unsub = useTimerStore.subscribe(render)
    return () => {
      unsub()
      document.title = 'PomoTab'
    }
  }, [])
}
