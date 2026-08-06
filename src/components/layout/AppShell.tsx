import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import {
  BarChart3,
  Check,
  Github,
  KanbanSquare,
  Monitor,
  Moon,
  Settings,
  ShieldCheck,
  Sun,
  Timer,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { ThemePreference } from '@/lib/types'
import { useSettingsStore } from '@/store/settingsStore'
import { useUiStore } from '@/store/uiStore'
import { MiniTimer, MiniTimerButton } from './MiniTimer'

const NAV = [
  { to: '/', label: 'Focus', icon: Timer },
  { to: '/board', label: 'Board', icon: KanbanSquare },
  { to: '/activity', label: 'Activity', icon: BarChart3 },
] as const

const FOOTER_LINK = 'font-medium text-foreground underline underline-offset-4 hover:no-underline'

const THEMES: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

function Logo() {
  return (
    <div className="flex items-center gap-2">
      <svg viewBox="0 0 24 24" className="size-6 shrink-0" aria-hidden>
        <circle cx="12" cy="12" r="8" className="fill-none stroke-border" strokeWidth="3" />
        <path
          d="M12 4a8 8 0 1 1-7.6 5.5"
          className="fill-none stroke-work"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="12" cy="12" r="2" className="fill-work" />
      </svg>
      <span className="text-sm font-semibold tracking-tight">PomoTab</span>
    </div>
  )
}

function ThemeMenu() {
  const theme = useSettingsStore((s) => s.settings.theme)
  const update = useSettingsStore((s) => s.update)
  const Active = THEMES.find((t) => t.value === theme)?.icon ?? Monitor

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        aria-label="Theme"
      >
        <Active className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {THEMES.map(({ value, label, icon: Icon }) => (
          <DropdownMenuItem key={value} onSelect={() => void update({ theme: value })}>
            <Icon />
            <span className="flex-1">{label}</span>
            {theme === value && <Check className="size-3.5 opacity-60" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const openSettings = useUiStore((s) => s.openSettings)

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-3 sm:gap-4 sm:px-6">
          <Logo />

          <nav className="ml-1 flex items-center gap-0.5 sm:ml-4 sm:gap-1" aria-label="Main">
            {NAV.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors sm:px-3',
                    isActive
                      ? 'bg-secondary text-secondary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )
                }
              >
                <Icon className="size-4 shrink-0" />
                <span className="hidden sm:inline">{label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <MiniTimer />
            <MiniTimerButton />
            <ThemeMenu />
            <button
              onClick={openSettings}
              className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Settings"
            >
              <Settings className="size-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col">{children}</main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-x-2.5 gap-y-1 px-3 py-3 text-xs text-muted-foreground sm:px-6">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
            Everything you create stays in this browser.
          </span>
          <span aria-hidden className="opacity-40">
            ·
          </span>
          <NavLink to="/privacy" className={FOOTER_LINK}>
            Privacy &amp; data
          </NavLink>
          <span aria-hidden className="opacity-40">
            ·
          </span>
          <a
            href="https://github.com/baktistr/pomotab"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(FOOTER_LINK, 'flex items-center gap-1.5')}
          >
            <Github className="size-3.5 shrink-0" aria-hidden />
            Source
          </a>
        </div>
      </footer>
    </div>
  )
}
