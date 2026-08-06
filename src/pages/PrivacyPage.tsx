import type { ReactNode } from 'react'
import { Cookie, Database, DownloadCloud, HardDrive, ServerOff, ShieldAlert } from 'lucide-react'
import { Card } from '@/components/ui/misc'
import { useUiStore } from '@/store/uiStore'

function Section({
  icon,
  title,
  children,
}: {
  icon: ReactNode
  title: string
  children: ReactNode
}) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>
        {title}
      </h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  )
}

function Row({ what, where, why }: { what: string; where: string; why: string }) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-2 pr-3 align-top font-medium text-foreground">{what}</td>
      <td className="py-2 pr-3 align-top">
        <code className="rounded bg-muted px-1 py-0.5 text-xs">{where}</code>
      </td>
      <td className="py-2 align-top">{why}</td>
    </tr>
  )
}

export function PrivacyPage() {
  const openSettings = useUiStore((s) => s.openSettings)

  return (
    <div className="mx-auto w-full max-w-2xl space-y-10 px-4 py-10 sm:px-6">
      <header className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Privacy &amp; your data</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          PomoTab has no accounts, no database and no analytics. Everything you type stays in your
          own browser. This page explains exactly where it lives, what can delete it, and how to
          move it somewhere else.
        </p>
      </header>

      <Section icon={<ServerOff />} title="The server never sees your work">
        <p>
          The thing running at this address is a static file server. It hands your browser some
          HTML, JavaScript and CSS, and that is the entire conversation. Your boards, cards and
          pomodoro history are created in the browser and never leave it — there is no API to send
          them to and no database to store them in.
        </p>
        <p>
          PomoTab&rsquo;s own web server keeps no access log. If it sits behind a reverse proxy or
          a CDN, that layer may still record ordinary request metadata — your IP address, the URL,
          your browser version — exactly as it would for any website. That is about the connection,
          never about the contents of your board.
        </p>
      </Section>

      <Section icon={<Cookie />} title="No cookies at all">
        <p>
          PomoTab sets none, and no third party can set one either: the content security policy
          only permits this site to load its own files, so there is nothing to embed an ad or
          analytics tracker in.
        </p>
        <p>
          Cookies exist to carry information <em>to a server</em> on every request. Since there is
          no server-side state, a cookie would be pure cost — it would attach your data to every
          request for no reason.
        </p>
      </Section>

      <Section icon={<Database />} title="What is stored, and where">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="pb-2 pr-3 font-medium text-foreground">What</th>
                <th className="pb-2 pr-3 font-medium text-foreground">Stored as</th>
                <th className="pb-2 font-medium text-foreground">Why</th>
              </tr>
            </thead>
            <tbody>
              <Row
                what="Boards, columns, cards, sessions, settings"
                where="IndexedDB · pomotab"
                why="Everything you actually create. This is the real data."
              />
              <Row
                what="Running timer"
                where="localStorage · pomotab.timer"
                why="Lets a refresh or a crash resume mid-pomodoro instead of losing it."
              />
              <Row
                what="Theme"
                where="localStorage · pomotab.theme"
                why="Read before the first paint so the page never flashes the wrong colours."
              />
              <Row
                what="Last board viewed"
                where="localStorage · pomotab.activeBoard"
                why="Opens the board you were last on."
              />
              <Row
                what="Backup reminder snooze"
                where="localStorage · pomotab.backupNudgeSnoozedUntil"
                why="Stops the export nudge reappearing after you dismiss it."
              />
            </tbody>
          </table>
        </div>
        <p>
          The app&rsquo;s files are also kept in the browser&rsquo;s cache so it works offline.
          That cache holds the program, not your data.
        </p>
      </Section>

      <Section icon={<HardDrive />} title="Which browser, on which address">
        <p>
          Storage is tied to a <strong className="text-foreground">browser profile</strong> and the{' '}
          <strong className="text-foreground">exact address</strong> you visit — the scheme, host
          and port together. Each of these is a separate, independent set of boards:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Different browsers on the same computer — Chrome and Firefox do not share.</li>
          <li>Different profiles in the same browser, such as work and personal.</li>
          <li>Private or incognito windows, which are also erased when the window closes.</li>
          <li>
            Different addresses. <code className="rounded bg-muted px-1 py-0.5 text-xs">localhost</code>{' '}
            and <code className="rounded bg-muted px-1 py-0.5 text-xs">127.0.0.1</code> count as two
            different sites even though they are the same machine, and changing the port makes a
            third.
          </li>
        </ul>
        <p>
          Being signed into your browser does <strong className="text-foreground">not</strong> carry
          this between computers. Browser sync covers bookmarks, passwords and history — it does not
          sync the kind of storage PomoTab uses. Two laptops signed into the same account still hold
          two separate sets of pomodoros.
        </p>
      </Section>

      <Section icon={<ShieldAlert />} title="What can delete it">
        <Card className="border-work/40 bg-work/5 p-4 text-foreground">
          <p className="text-sm leading-relaxed">
            <strong>Clearing cookies is what will wipe your history.</strong> Browsers file
            everything under one switch — Chrome calls it &ldquo;Cookies and other site data&rdquo;
            — and that switch deletes the storage PomoTab uses, even though PomoTab sets no cookies
            of its own.
          </p>
        </Card>
        <p>
          On your first save, the app asks the browser to mark its storage as persistent, which
          protects it from being cleared automatically when your disk runs low. Some browsers
          decline that request until you have used the site a few times or installed it. Either way
          it is no defence against a deliberate clear, an uninstalled browser, or a lost laptop.
        </p>
        <p>
          You can see the current state — how much space is used, and whether the browser granted
          persistence — under{' '}
          <button
            onClick={openSettings}
            className="font-medium text-foreground underline underline-offset-4 hover:no-underline"
          >
            Settings → Data
          </button>
          .
        </p>
      </Section>

      <Section icon={<DownloadCloud />} title="Taking your data with you">
        <p>
          Export writes one JSON file containing everything: every board, card, session and setting,
          stamped with a schema version. It is plain text you can read, keep, or move to another
          machine.
        </p>
        <p>
          Import offers <strong className="text-foreground">Merge</strong>, which combines both sets
          and keeps the newer version of anything that appears twice, or{' '}
          <strong className="text-foreground">Replace</strong>, which clears this browser first.
          Files are checked against the schema before a single row is written, so a truncated or
          unrelated file changes nothing.
        </p>
        <p>
          This is also the only way across the boundaries above — from one browser to another, or
          from a local address to a real domain.
        </p>
      </Section>

      <Section icon={<ShieldAlert />} title="What this does not protect against">
        <p>
          &ldquo;Private&rdquo; here means the server never receives your data. It does not mean the
          data is encrypted. Anyone who can use your browser profile can open PomoTab and read
          everything, and the raw storage is visible in the browser&rsquo;s developer tools.
        </p>
        <p>
          If what you need is protection from someone with access to your unlocked computer, this
          design does not provide it — use your operating system&rsquo;s account separation and disk
          encryption for that.
        </p>
      </Section>
    </div>
  )
}
