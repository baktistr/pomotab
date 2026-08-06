import { useRegisterSW } from 'virtual:pwa-register/react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * The service worker precaches everything, so a deploy only reaches an open tab
 * when the user says so. Never reload out from under a running pomodoro.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError: (error) => console.error('service worker registration failed', error),
  })

  if (!needRefresh) return null

  return (
    <div
      className={[
        'fixed bottom-4 left-1/2 z-[90] -translate-x-1/2 border border-border bg-card shadow-xl',
        // A pill on desktop; a plain card on narrow screens, where the pill
        // shape forced the sentence to wrap inside its own rounded ends.
        'flex w-[calc(100vw-2rem)] flex-wrap items-center justify-center gap-2 rounded-xl p-3',
        'sm:w-auto sm:flex-nowrap sm:gap-3 sm:rounded-full sm:py-2 sm:pl-4 sm:pr-2',
      ].join(' ')}
    >
      <span className="text-sm">A new version of PomoTab is ready.</span>
      <Button size="sm" onClick={() => void updateServiceWorker(true)}>
        <RefreshCw />
        Reload
      </Button>
      <button
        onClick={() => setNeedRefresh(false)}
        className="rounded-full px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        Later
      </button>
    </div>
  )
}
