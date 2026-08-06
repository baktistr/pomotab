# PomoTab

> Your private focus workspace — pomodoro timer, kanban board and activity
> history, with every byte of your data staying on your own device.

The server is a static file server and nothing else. There is no backend, no
database, no account, no analytics and no outbound request of any kind. See
[PLAN.md](PLAN.md) for the design this implements.

| Surface | Route | What it does |
|---|---|---|
| **Focus** | `/` | Timer with work / short / long phases, task link, today's tally |
| **Board** | `/board` | Multi-board kanban: columns, cards, drag & drop, WIP limits |
| **Activity** | `/activity` | Day / week / month stats, focus-by-hour chart, honest timeline |
| **Privacy** | `/privacy` | Plain-language explainer: what is stored, what deletes it, why there are no cookies |

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

```bash
npm run verify       # typecheck + logic tests + production build
npm run build        # dist/
npm run preview      # serve dist/ locally
```

## Run it as the deployed container

```bash
docker build -t pomotab .
docker run --rm -p 8080:80 pomotab   # http://localhost:8080
```

The final image is `nginx:1.27-alpine-slim` plus the built assets — **13 MB**,
no Node at runtime.

---

## Deploying to Coolify

1. **New Resource → Private Repository**, pick this repo, branch `main`.
2. Build pack **Dockerfile**, exposed port **80**.
3. Attach a domain (`pomo.yourdomain.com`); Coolify handles TLS.
4. Enable auto-deploy on push.

There are no environment variables — there is nothing to configure at runtime.

`nginx.conf` handles the rest: SPA fallback for `/board` and `/activity`,
immutable caching for `/assets/*`, `no-cache` on the shell and service worker so
deploys actually roll out, gzip, and a strict CSP.

> **One thing to know before editing `index.html`:** the CSP allows exactly one
> inline script — the theme bootstrap that prevents a flash of the wrong colours
> — by SHA-256 hash. `npm run selftest` fails if that script changes without the
> hash in `nginx.conf` being regenerated, and prints the value to paste in.

---

## Your data

Everything lives in IndexedDB under the origin you visit. That is fast and
private, but it is also *device-local and evictable*: clearing site data, an
aggressive browser cleanup, or a new laptop all lose it.

- **Settings → Data → Export JSON** writes a complete, versioned snapshot.
- **Import** offers *Merge* (union by id, newest `updatedAt` wins) or *Replace*
  (wipe, then load). Files are validated against a schema before anything is
  written; a malformed file changes nothing.
- The app calls `navigator.storage.persist()` on first write and nudges you to
  export if the last backup is over 30 days old.

Export from one browser imports cleanly into another — that round-trip is
covered by the smoke test.

---

## Keyboard

| Key | Action |
|---|---|
| `Space` | Start / pause the timer |
| `n` | New card (jumps to the board) |
| `,` | Open settings |

Suppressed while typing or inside a dialog.

---

## How the timer survives a background tab

Browsers throttle `setInterval` to about once a minute in a hidden tab, so the
countdown is never driven by ticks:

- The engine stores `phaseStartedAt` and `phaseDurationSec` and derives the
  remaining time as `duration - (now - startedAt)`. Ticks only trigger repaints.
- Ticking runs in a **Web Worker** (throttled far less), with an extra check on
  `visibilitychange` and `focus`.
- Every transition is mirrored to `localStorage`, so a refresh — or a crash —
  resumes exactly where it left off. A phase that finished while the tab was
  closed is logged on the next load, with the correct end time.
- Tabs sync over a `BroadcastChannel`. One tab holds a **Web Lock** and is the
  only one that plays sound or posts a notification. Session rows use a
  deterministic id derived from the phase start, so even if two tabs both notice
  the phase ended, IndexedDB's primary key guarantees exactly one row.

---

## Tests

```bash
npm run selftest     # 1065 assertions over the pure logic — no browser needed
npm run smoke        # drives a real browser against a running build
```

`selftest` bundles with esbuild and runs in Node: clock formatting, local-time
date bucketing, activity derivations, streaks, timer maths (including the
"frozen for 20 minutes" case), fractional-index ordering across 1000 reorders,
and the CSP hash check described above.

`smoke` speaks the DevTools protocol directly — no Playwright dependency — and
covers what unit tests cannot: the app mounts, the database seeds, the board
renders, **a timer left running across a reload resumes and logs exactly one
session**, the activity page derives the right numbers, the PWA serves a deep
link with the network cut, an export survives a full wipe and re-import, and the
console stays free of CSP violations.

```bash
# terminal 1
npm run build && npm run preview
# terminal 2
chromium --headless --remote-debugging-port=9222 --user-data-dir=/tmp/pomotab-chrome
# terminal 3
npm run smoke                          # defaults to http://127.0.0.1:4173
npm run smoke -- http://127.0.0.1:8080 # or point it at the container
```

## Regenerating the icons

`public/*.png` are committed, rendered by a dependency-free rasteriser:

```bash
npm run icons
```

---

## Stack

Vite · React 19 · TypeScript · Tailwind v4 · Zustand · Dexie (IndexedDB) ·
dnd-kit · Recharts · Zod · vite-plugin-pwa · nginx.

Board and Activity are lazy routes, so the first paint of the timer does not
wait on dnd-kit or Recharts, and Zod only downloads if you actually import a
file.
