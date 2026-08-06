import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Download, ShieldAlert, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { db } from '@/lib/db'
import { daysSinceExport, exportToFile } from '@/lib/exportImport'
import { useSettingsStore } from '@/store/settingsStore'

const SNOOZE_KEY = 'pomotab.backupNudgeSnoozedUntil'
const NUDGE_AFTER_DAYS = 30
/** Below this, there is not enough history to be worth nagging about. */
const MIN_SESSIONS = 20

function snoozedUntil(): number {
  try {
    return Number(localStorage.getItem(SNOOZE_KEY) ?? 0)
  } catch {
    return 0
  }
}

/**
 * IndexedDB is device-local and the browser may evict it. A gentle reminder
 * beats a support thread about vanished history.
 */
export function BackupNudge() {
  const settings = useSettingsStore((s) => s.settings)
  const loaded = useSettingsStore((s) => s.loaded)
  const [dismissed, setDismissed] = useState(() => Date.now() < snoozedUntil())
  const sessionCount = useLiveQuery(async () => db.sessions.count(), [], 0)

  useEffect(() => {
    if (!dismissed) return
    const timeout = setTimeout(() => setDismissed(Date.now() < snoozedUntil()), 60_000)
    return () => clearTimeout(timeout)
  }, [dismissed])

  if (!loaded || dismissed || (sessionCount ?? 0) < MIN_SESSIONS) return null

  const days = daysSinceExport(settings)
  const stale = days === null || days >= NUDGE_AFTER_DAYS
  if (!stale) return null

  function snooze() {
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + 7 * 86_400_000))
    } catch {
      /* dismissal is best-effort */
    }
    setDismissed(true)
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl items-center gap-3 px-4 pt-3 sm:px-6">
      <div className="flex w-full items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
        <ShieldAlert className="size-4 shrink-0 text-muted-foreground" />
        <p className="min-w-0 flex-1 text-sm">
          {days === null
            ? 'Your history has never been backed up.'
            : `Last backup was ${days} days ago.`}{' '}
          <span className="text-muted-foreground">
            Browser storage can be cleared without warning.
          </span>
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            const { filename } = await exportToFile()
            toast('Backup downloaded', { variant: 'success', description: filename })
          }}
        >
          <Download />
          Export
        </Button>
        <button
          onClick={snooze}
          className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Remind me later"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  )
}
