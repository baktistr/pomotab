import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Download, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label, Separator } from '@/components/ui/misc'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/toast'
import {
  ImportError,
  exportToFile,
  importSnapshot,
  parseSnapshot,
  wipeAllData,
  type ImportMode,
  type Snapshot,
} from '@/lib/exportImport'
import { formatDate } from '@/lib/format'
import {
  notificationPermission,
  requestNotificationPermission,
} from '@/lib/notifications'
import { playChime } from '@/lib/sound'
import type { ThemePreference } from '@/lib/types'
import { useSettingsStore } from '@/store/settingsStore'
import { useUiStore } from '@/store/uiStore'

function NumberField({
  id,
  label,
  value,
  min,
  max,
  suffix,
  onCommit,
}: {
  id: string
  label: string
  value: number
  min: number
  max: number
  suffix?: string
  onCommit: (value: number) => void
}) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])

  return (
    // `grid-rows-subgrid` borrows the parent's two rows, so every label sits in
    // row 1 and every input in row 2 — a label that wraps onto two lines (as
    // "Long break every" does) no longer shoves its own input out of the row.
    <div className="row-span-2 grid grid-rows-subgrid gap-1.5">
      <Label htmlFor={id} className="self-end leading-tight">
        {label}
      </Label>
      <div className="flex items-center gap-1.5">
        <Input
          id={id}
          type="number"
          min={min}
          max={max}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const parsed = Number.parseInt(draft, 10)
            if (Number.isFinite(parsed) && parsed >= min && parsed <= max) onCommit(parsed)
            else setDraft(String(value))
          }}
          className="w-full min-w-0"
        />
        {suffix && (
          <span className="shrink-0 text-sm text-muted-foreground">{suffix}</span>
        )}
      </div>
    </div>
  )
}

function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string
  description?: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  )
}

export function SettingsModal() {
  const navigate = useNavigate()
  const open = useUiStore((s) => s.settingsOpen)
  const closeSettings = useUiStore((s) => s.closeSettings)
  const settings = useSettingsStore((s) => s.settings)
  const update = useSettingsStore((s) => s.update)

  const fileRef = useRef<HTMLInputElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [pendingImport, setPendingImport] = useState<Snapshot | null>(null)
  const [confirmWipe, setConfirmWipe] = useState(false)
  const [storageInfo, setStorageInfo] = useState<string | null>(null)
  const permission = notificationPermission()

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      try {
        const estimate = await navigator.storage?.estimate?.()
        const persisted = (await navigator.storage?.persisted?.()) ?? false
        if (cancelled) return
        const used = estimate?.usage
        setStorageInfo(
          `${used !== undefined ? `${(used / 1_048_576).toFixed(1)} MB used` : 'Size unknown'} · ${
            persisted ? 'protected from eviction' : 'not persisted — export regularly'
          }`,
        )
      } catch {
        if (!cancelled) setStorageInfo(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  async function handleFile(file: File) {
    try {
      setPendingImport(await parseSnapshot(await file.text()))
    } catch (error) {
      toast(error instanceof ImportError ? error.message : 'Could not read that file.', {
        variant: 'error',
      })
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function runImport(mode: ImportMode) {
    if (!pendingImport) return
    const snapshot = pendingImport
    setPendingImport(null)
    try {
      const result = await importSnapshot(snapshot, mode)
      toast(mode === 'replace' ? 'Data replaced' : 'Data merged', {
        variant: 'success',
        description:
          `${result.boards} boards · ${result.columns} columns · ${result.tasks} cards · ${result.sessions} sessions` +
          (result.skippedOrphans > 0 ? ` · ${result.skippedOrphans} orphaned rows skipped` : ''),
      })
    } catch {
      toast('Import failed — nothing was changed.', { variant: 'error' })
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !next && closeSettings()}>
        <DialogContent
          className="max-w-lg"
          // Radix focuses the first field on open, which selects the Focus
          // duration — one stray keystroke would silently rewrite it. Put focus
          // on the dialog itself instead so the trap and screen readers still
          // behave, but nothing is armed for typing.
          ref={contentRef}
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            contentRef.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>
              Stored on this device only. Nothing is ever sent anywhere.
            </DialogDescription>
          </DialogHeader>

          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Durations
            </h3>
            <div className="grid grid-cols-2 grid-rows-[repeat(4,auto)] gap-x-3 gap-y-3 sm:grid-cols-4 sm:grid-rows-[repeat(2,auto)]">
              <NumberField
                id="workMin"
                label="Focus"
                value={settings.workMin}
                min={1}
                max={180}
                suffix="min"
                onCommit={(workMin) => void update({ workMin })}
              />
              <NumberField
                id="shortBreakMin"
                label="Short break"
                value={settings.shortBreakMin}
                min={1}
                max={180}
                suffix="min"
                onCommit={(shortBreakMin) => void update({ shortBreakMin })}
              />
              <NumberField
                id="longBreakMin"
                label="Long break"
                value={settings.longBreakMin}
                min={1}
                max={180}
                suffix="min"
                onCommit={(longBreakMin) => void update({ longBreakMin })}
              />
              <NumberField
                id="longBreakEvery"
                label="Long break every"
                value={settings.longBreakEvery}
                min={1}
                max={12}
                suffix="🍅"
                onCommit={(longBreakEvery) => void update({ longBreakEvery })}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Changes apply to the next phase — a running timer is never yanked.
            </p>
          </section>

          <Separator />

          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Behaviour
            </h3>
            <ToggleRow
              label="Auto-start breaks"
              description="Roll straight into the break when focus ends."
              checked={settings.autoStartBreaks}
              onCheckedChange={(autoStartBreaks) => void update({ autoStartBreaks })}
            />
            <ToggleRow
              label="Auto-start focus"
              description="Roll straight back into work when a break ends."
              checked={settings.autoStartWork}
              onCheckedChange={(autoStartWork) => void update({ autoStartWork })}
            />
            <ToggleRow
              label="Sound"
              description="A short chime when a phase completes."
              checked={settings.soundEnabled}
              onCheckedChange={(soundEnabled) => {
                void update({ soundEnabled })
                if (soundEnabled) playChime('work-done')
              }}
            />
            <ToggleRow
              label="Desktop notifications"
              description={
                permission === 'unsupported'
                  ? 'This browser does not support notifications.'
                  : permission === 'denied'
                    ? 'Blocked in browser settings — allow them there first.'
                    : 'Shown when a phase completes.'
              }
              checked={settings.notificationsEnabled && permission === 'granted'}
              disabled={permission === 'unsupported' || permission === 'denied'}
              onCheckedChange={async (notificationsEnabled) => {
                if (!notificationsEnabled) {
                  await update({ notificationsEnabled: false })
                  return
                }
                const result = await requestNotificationPermission()
                if (result === 'granted') await update({ notificationsEnabled: true })
                else toast('Notification permission was not granted.', { variant: 'error' })
              }}
            />
            <div className="flex items-center justify-between gap-4 py-1.5">
              <p className="text-sm font-medium">Theme</p>
              <Select
                value={settings.theme}
                onValueChange={(theme) => void update({ theme: theme as ThemePreference })}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </section>

          <Separator />

          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Data
            </h3>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const { filename, records } = await exportToFile()
                  toast('Export downloaded', {
                    variant: 'success',
                    description: `${records} records → ${filename}`,
                  })
                }}
              >
                <Download />
                Export JSON
              </Button>
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <Upload />
                Import JSON
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void handleFile(file)
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {settings.lastExportAt
                ? `Last export ${formatDate(settings.lastExportAt)}.`
                : 'Never exported. Browser storage can be cleared without warning — keep a copy.'}
              {storageInfo ? ` ${storageInfo}.` : ''}{' '}
              <button
                onClick={() => {
                  closeSettings()
                  navigate('/privacy')
                }}
                className="font-medium text-foreground underline underline-offset-4 hover:no-underline"
              >
                How storage works
              </button>
            </p>
          </section>

          <Separator />

          <section className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-destructive">
              <AlertTriangle className="size-3.5" />
              Danger zone
            </h3>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Erase every board, card and session on this device.
              </p>
              <Button variant="destructive" size="sm" onClick={() => setConfirmWipe(true)}>
                Wipe all data
              </Button>
            </div>
          </section>
        </DialogContent>
      </Dialog>

      <Dialog open={pendingImport !== null} onOpenChange={(next) => !next && setPendingImport(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Import this file?</DialogTitle>
            <DialogDescription>
              {pendingImport
                ? `${pendingImport.boards.length} boards · ${pendingImport.columns.length} columns · ${pendingImport.tasks.length} cards · ${pendingImport.sessions.length} sessions, exported ${new Date(pendingImport.exportedAt).toLocaleString()}.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Button className="w-full justify-start" variant="outline" onClick={() => void runImport('merge')}>
              <span className="flex flex-col items-start">
                <span>Merge</span>
                <span className="text-xs font-normal text-muted-foreground">
                  Keep what is here; newer versions of the same record win.
                </span>
              </span>
            </Button>
            <Button
              className="w-full justify-start"
              variant="outline"
              onClick={() => void runImport('replace')}
            >
              <span className="flex flex-col items-start">
                <span className="text-destructive">Replace</span>
                <span className="text-xs font-normal text-muted-foreground">
                  Wipe this device&rsquo;s data first, then load the file.
                </span>
              </span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmWipe}
        onOpenChange={setConfirmWipe}
        title="Wipe all data?"
        description="Every board, card, session and setting on this device is deleted. This cannot be undone — export first if you are unsure."
        confirmLabel="Delete everything"
        destructive
        onConfirm={async () => {
          await wipeAllData()
          toast('All data deleted', { variant: 'success' })
          window.location.reload()
        }}
      />
    </>
  )
}
