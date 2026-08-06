import { useEffect } from 'react'
import { create } from 'zustand'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { uid } from '@/lib/utils'

type ToastVariant = 'default' | 'success' | 'error'

interface Toast {
  id: string
  title: string
  description?: string
  variant: ToastVariant
}

interface ToastStore {
  toasts: Toast[]
}

const useToastStore = create<ToastStore>(() => ({ toasts: [] }))

export function toast(
  title: string,
  options: { description?: string; variant?: ToastVariant; durationMs?: number } = {},
): void {
  const id = uid()
  const { description, variant = 'default', durationMs = 4500 } = options
  useToastStore.setState((s) => ({ toasts: [...s.toasts, { id, title, description, variant }] }))
  setTimeout(() => dismiss(id), durationMs)
}

function dismiss(id: string): void {
  useToastStore.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)

  // Keep the live region tidy when the app unmounts (tests, HMR).
  useEffect(() => () => useToastStore.setState({ toasts: [] }), [])

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'pointer-events-auto flex items-start gap-3 rounded-lg border border-border bg-card p-3 shadow-xl',
            'animate-[fade-in_150ms_ease-out]',
            t.variant === 'success' && 'border-short/40',
            t.variant === 'error' && 'border-destructive/50',
          )}
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{t.title}</p>
            {t.description && (
              <p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p>
            )}
          </div>
          <button
            onClick={() => dismiss(t.id)}
            className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Dismiss"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
