import { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { BackupNudge } from '@/components/layout/BackupNudge'
import { UpdatePrompt } from '@/components/layout/UpdatePrompt'
import { SettingsModal } from '@/components/settings/SettingsModal'
import { Toaster } from '@/components/ui/toast'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { FocusPage } from '@/pages/FocusPage'
import { initSettings } from '@/store/settingsStore'
import { initTimer } from '@/store/timerStore'

// Focus is the landing route and stays eager; the other two carry dnd-kit and
// recharts, which should not delay the first paint of a timer.
const BoardPage = lazy(() => import('@/pages/BoardPage').then((m) => ({ default: m.BoardPage })))
const ActivityPage = lazy(() =>
  import('@/pages/ActivityPage').then((m) => ({ default: m.ActivityPage })),
)
const PrivacyPage = lazy(() =>
  import('@/pages/PrivacyPage').then((m) => ({ default: m.PrivacyPage })),
)

function RouteFallback() {
  return (
    <div className="flex flex-1 items-center justify-center p-10 text-sm text-muted-foreground">
      Loading…
    </div>
  )
}

function Routed() {
  useKeyboardShortcuts()
  useDocumentTitle()

  return (
    <AppShell>
      <BackupNudge />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<FocusPage />} />
          <Route path="/board" element={<BoardPage />} />
          <Route path="/activity" element={<ActivityPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <SettingsModal />
    </AppShell>
  )
}

export function App() {
  useEffect(() => {
    const stopSettings = initSettings()
    const stopTimer = initTimer()
    return () => {
      stopSettings()
      stopTimer()
    }
  }, [])

  return (
    <BrowserRouter>
      <Routed />
      <Toaster />
      <UpdatePrompt />
    </BrowserRouter>
  )
}
