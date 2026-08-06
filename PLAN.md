# PomoTab — Plan

> **Your private focus workspace.**
> Pomodoro timer + activity history + kanban task board. Local-only, no sign-in,
> all data stays on the user's device (exportable as JSON). Shipped as a Docker
> image for deployment on Coolify.

---

## 1. Product Principles

1. **Private by architecture, not by policy.** The server never sees user data.
   There is no backend, no database, no analytics, no accounts. The Docker
   container only serves static files.
2. **Instant.** Loads fast, works offline after first visit (PWA), no spinners
   for data that lives 2ms away in IndexedDB.
3. **Portable.** One-click export of everything to a versioned JSON file;
   import restores it on any device/browser.
4. **Focused.** Three surfaces only: **Focus** (timer), **Board** (kanban),
   **Activity** (history/stats). No feature creep.

---

## 2. System Architecture

Because the app is local-only, the "stack" is deliberately thin: a static
single-page app served by nginx. All state lives in the browser.

```
                    VPS (Coolify)                      User's Browser
  ┌───────────────────────────────────┐   ┌─────────────────────────────────────┐
  │  Docker container                 │   │                                     │
  │  ┌─────────────────────────────┐  │   │  ┌───────────────────────────────┐  │
  │  │ nginx:alpine                │  │   │  │  PomoTab SPA (React + TS)     │  │
  │  │  - serves /dist (static)    │◄─┼───┼──┤  - Timer engine (Web Worker)  │  │
  │  │  - gzip, cache headers      │  │   │  │  - Kanban (dnd-kit)           │  │
  │  │  - SPA fallback→index.html  │  │   │  │  - Stats/Activity views       │  │
  │  └─────────────────────────────┘  │   │  └───────────┬───────────────────┘  │
  │        NO backend                 │   │              │ Dexie.js             │
  │        NO database                │   │  ┌───────────▼───────────────────┐  │
  │        NO user data ever          │   │  │  IndexedDB  (all user data)   │  │
  └───────────────────────────────────┘   │  │  boards/columns/tasks/        │  │
              ▲                           │  │  sessions/settings            │  │
              │ git push → auto deploy    │  └───────────────────────────────┘  │
      GitHub repo (private)               │  Export ⇄ Import: versioned .json   │
                                          └─────────────────────────────────────┘
```

Assets are only fetched once thanks to the PWA service worker — after the first
visit the app works fully offline; the VPS can even go down without users
noticing mid-session.

---

## 3. Tech Stack

| Layer          | Choice                        | Why                                                      |
|----------------|-------------------------------|----------------------------------------------------------|
| Build          | Vite + React 19 + TypeScript  | Fast dev loop, tiny static output, huge ecosystem         |
| Styling        | Tailwind CSS v4 + shadcn/ui   | Quick, consistent, dark mode for free                     |
| State          | Zustand                       | Minimal global store for timer + UI state                 |
| Persistence    | Dexie.js (IndexedDB)          | Typed schema, live queries via `dexie-react-hooks`        |
| Drag & drop    | @dnd-kit                      | Accessible, actively maintained, made for kanban          |
| Charts (stats) | Recharts                      | Simple bar/heatmap needs only                             |
| Offline        | vite-plugin-pwa               | Service worker + manifest with zero config drama          |
| Routing        | react-router (3 routes)       | Focus `/`, Board `/board`, Activity `/activity`           |
| Serve          | nginx:alpine (Docker stage 2) | Static file serving, ~10 MB image                         |

No backend framework, no ORM, no auth library — intentionally.

---

## 4. Data Model

All entities live in IndexedDB via Dexie. IDs are `crypto.randomUUID()`.
Ordering uses fractional-index strings (`"a0"`, `"a0V"`, …) so drag-and-drop
reorders touch only the moved item.

```
 ┌────────────────┐        ┌────────────────┐        ┌────────────────┐
 │    Board       │ 1    * │    Column      │ 1    * │     Task       │
 ├────────────────┤───────►├────────────────┤───────►├────────────────┤
 │ id             │        │ id             │        │ id             │
 │ name           │        │ boardId        │        │ boardId        │
 │ order          │        │ name           │        │ columnId       │
 │ createdAt      │        │ order          │        │ title          │
 └────────────────┘        │ wipLimit?      │        │ notes?         │
                           └────────────────┘        │ tags: string[] │
 ┌────────────────┐                                  │ estimatePomos? │
 │   Settings     │  (singleton row)                 │ order          │
 ├────────────────┤                                  │ createdAt      │
 │ workMin: 25    │        ┌────────────────┐        │ completedAt?   │
 │ shortBreakMin:5│        │    Session     │ *    1 │ archived: bool │
 │ longBreakMin:15│        ├────────────────┤───────►└────────────────┘
 │ longBreakEvery4│        │ id             │  taskId (nullable —
 │ autoStartBreaks│        │ taskId?        │   untasked focus is OK)
 │ autoStartWork  │        │ type: work|    │
 │ soundEnabled   │        │  short|long    │
 │ notifications  │        │ startedAt      │
 │ theme          │        │ endedAt        │
 └────────────────┘        │ durationSec    │
                           │ completed: bool│  ← false if skipped/aborted
                           │ note?          │
                           └────────────────┘
```

Notes:
- A **Session** is the atomic activity record. The Activity page and all stats
  are pure derivations over `sessions` — no separate "activity log" table to
  keep in sync.
- `Task.completedPomos` is **not stored**; it's counted from sessions to avoid
  drift.
- Deleting a task keeps its sessions (with a snapshot of the task title on the
  session at completion time) so history stays truthful.

---

## 5. Pomodoro Timer Engine

The trickiest part of any browser pomodoro is **background-tab throttling** —
`setInterval` slows to ≥1/min in inactive tabs. Design around it:

- The engine stores `phaseStartedAt` (epoch ms) + `phaseDurationSec` and always
  computes remaining time as `duration - (now - startedAt)`. Ticks only drive
  re-rendering, never the actual countdown.
- Ticking runs in a **Web Worker** (workers are throttled less), and phase
  completion is additionally checked on `visibilitychange`.
- Timer state is mirrored to `localStorage` on every transition → a page
  refresh or accidental tab close **resumes the running timer exactly**.
- Multi-tab: a `BroadcastChannel` keeps tabs in sync; one tab is elected timer
  owner via Web Locks.

### State machine

```
                        ┌─────────────────────────────────────────────┐
                        │                                             │
        start           ▼            phase complete                   │
 ┌──────┐      ┌──────────────┐  (n % longBreakEvery ≠ 0) ┌─────────────────┐
 │ IDLE │─────►│ WORK running │─────────────────────────► │ SHORT BREAK     │
 └──────┘      └──────┬───────┘                           └─────────────────┘
    ▲            ▲    │ pause/resume                            │
    │            │    ▼                                         │ complete /
    │          ┌──────────────┐   phase complete                │ auto-start
    │          │ WORK paused  │  (n % longBreakEvery = 0)       ▼
    │          └──────────────┘         │              ┌─────────────────┐
    │                                   └────────────► │ LONG BREAK      │
    │   abort (from any state; logs incomplete session)└─────────────────┘
    └───────────────────────────────────────────────────────────┘
```

Behaviors:
- Completing a **work** phase writes a `Session{type:'work', completed:true}`
  and increments the linked task's derived pomo count.
- **Skip** ends the phase early and logs `completed:false` with actual elapsed
  time — honest history over inflated stats.
- Completion fires a Notification (permission requested on first timer start),
  an optional sound, and updates `document.title` (`(12:34) ▸ PomoTab`) so the
  countdown is visible on the browser tab — fitting the "PomoTab" name.

---

## 6. UI Map

Top-level shell: left nav (3 items) + persistent **mini-timer pill** visible on
every page so a running pomodoro is never out of sight.

### 6.1 Focus page `/`

```
┌──────────────────────────────────────────────────────────────┐
│ ◉ PomoTab      [ Focus ] [ Board ] [ Activity ]        ⚙  ☾ │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                  ● work  ○ short  ○ long                     │
│                                                              │
│                        24:59                                 │
│                   ▓▓▓▓▓▓▓▓░░░░░░░░  (ring)                   │
│                                                              │
│              [ ⏸ Pause ]   [ ⏭ Skip ]   [ ✕ ]                │
│                                                              │
│   Working on: [ Write launch blog post          ▾ ]          │
│                (searchable picker from Board tasks)          │
│                                                              │
│   Today: 🍅🍅🍅🍅  (4 pomodoros · 1h 40m focused)             │
└──────────────────────────────────────────────────────────────┘
```

### 6.2 Board page `/board`

```
┌──────────────────────────────────────────────────────────────┐
│ ◉ PomoTab      [ Focus ] [ Board ] [ Activity ]   ⏱ 24:59 ⚙ │
├──────────────────────────────────────────────────────────────┤
│  Board: [ Personal ▾ ]                        [+ Add column] │
│                                                              │
│  ┌ Backlog ──── 4 ┐ ┌ Doing ── 1/2 ┐ ┌ Done ─────── 12 ┐     │
│  │ ┌──────────┐  │ │ ┌──────────┐ │ │ ┌──────────┐    │     │
│  │ │ Fix nav  │  │ │ │ Blog post│ │ │ │ Setup CI │    │     │
│  │ │ 🍅 0/3   │  │ │ │ 🍅 2/4 ▶ │ │ │ │ 🍅 5     │    │     │
│  │ └──────────┘  │ │ └──────────┘ │ │ └──────────┘    │     │
│  │ ┌──────────┐  │ │              │ │      …          │     │
│  │ │ Tax docs │  │ │  (WIP 1/2)   │ │                 │     │
│  │ └──────────┘  │ │              │ │                 │     │
│  │ [+ Add card]  │ │ [+ Add card] │ │ [+ Add card]    │     │
│  └───────────────┘ └──────────────┘ └─────────────────┘     │
└──────────────────────────────────────────────────────────────┘
```

- Card front: title, tags, `🍅 done/estimate`, ▶ button = "start a pomodoro on
  this task" (jumps to Focus with task pre-linked).
- Card detail (modal): notes (markdown-lite), tags, estimate, per-task session
  history, archive/delete.
- Drag: cards within/between columns; columns reorder; multiple boards.

### 6.3 Activity page `/activity`

```
┌──────────────────────────────────────────────────────────────┐
│ ◉ PomoTab      [ Focus ] [ Board ] [ Activity ]   ⏱ 24:59 ⚙ │
├──────────────────────────────────────────────────────────────┤
│  [ Day | Week | Month ]                    ◄  Aug 5, 2026 ►  │
│                                                              │
│  ┌ Focused ─────┐ ┌ Pomodoros ─┐ ┌ Tasks done ┐ ┌ Streak ─┐  │
│  │   3h 45m     │ │     9      │ │     3      │ │  6 days │  │
│  └──────────────┘ └────────────┘ └────────────┘ └─────────┘  │
│                                                              │
│  Focus by hour            ▂▂ ▅▅ ██ ▅▅    ▂▂ ██ ▅▅            │
│                     06    09    12    15    18    21         │
│                                                              │
│  Timeline (Aug 5)                                            │
│  09:12  🍅 25m  Write launch blog post                       │
│  09:40  ☕  5m  short break                                   │
│  09:47  🍅 25m  Write launch blog post                       │
│  10:15  🍅 14m  (no task) — skipped early                    │
│  …                                                           │
└──────────────────────────────────────────────────────────────┘
```

### 6.4 Settings (modal, ⚙)

Durations (work/short/long), long-break cadence, auto-start toggles, sound,
notifications, theme (light/dark/system), and **Data**: Export JSON, Import
JSON (merge or replace), Danger zone → wipe all data.

---

## 7. Export / Import

Single JSON file, full snapshot, versioned for future migrations:

```json
{
  "app": "pomotab",
  "schemaVersion": 1,
  "exportedAt": "2026-08-05T09:00:00Z",
  "settings": { },
  "boards": [ ], "columns": [ ], "tasks": [ ], "sessions": [ ]
}
```

- Export: serialize all Dexie tables → `pomotab-export-2026-08-05.json`
  download. Also offered proactively via a gentle "last backup 30+ days ago"
  nudge, since IndexedDB is device-local and evictable.
- Import: validate with Zod against `schemaVersion`; **Replace** (wipe + load)
  or **Merge** (union by id, newest `updatedAt` wins).
- Call `navigator.storage.persist()` on first write to ask the browser not to
  evict the data under storage pressure.

---

## 8. Docker & Coolify Deployment

Multi-stage build; final image is nginx + static files (~10 MB, no Node at
runtime):

```dockerfile
# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- serve ----
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO /dev/null http://127.0.0.1/ || exit 1
```

`nginx.conf` essentials:
- SPA fallback: `try_files $uri /index.html;`
- Hashed assets (`/assets/*`): `Cache-Control: public, max-age=31536000, immutable`
- `index.html` + `sw.js`: `Cache-Control: no-cache` (so deploys roll out)
- gzip on; basic security headers (`X-Content-Type-Options`, CSP allowing only
  `'self'` — trivially strict since there are zero external calls)

**Coolify setup** (one-time):
1. New Resource → *Private Repository* → pick the repo, branch `main`.
2. Build pack: **Dockerfile** (it will find `./Dockerfile`), exposed port **80**.
3. Attach domain, e.g. `pomo.yourdomain.com` — Coolify handles TLS via
   Let's Encrypt.
4. Enable auto-deploy on push (webhook). No environment variables needed —
   there is nothing to configure at runtime.

```
 git push ──► Coolify webhook ──► docker build (2 stages) ──► deploy
                                                              │
                              pomo.yourdomain.com ◄── Traefik ┘ (TLS)
```

---

## 9. Milestones

Deploy pipeline first, features second — so every phase lands on the real URL.

| Phase | Deliverable | Acceptance check |
|-------|-------------|------------------|
| **0. Skeleton + deploy** | Vite/React/TS/Tailwind scaffold, routing shell, Dockerfile, nginx.conf, live on Coolify | `pomo.yourdomain.com` serves the shell over HTTPS |
| **1. Timer core** | Timer engine (worker + timestamp math), full state machine, settings, notifications/sound/title, refresh-safe resume | Timer survives refresh & background tab; sessions written to IndexedDB |
| **2. Kanban** | Boards/columns/cards CRUD, dnd-kit drag & drop, card detail modal, WIP limits | Reorder + cross-column drag persists across reload |
| **3. Link + Activity** | Task picker on Focus, ▶ on cards, Activity page (day/week/month, timeline, stat tiles) | A completed pomodoro shows on the card count and in Activity |
| **4. Data portability** | Export/import (replace + merge), Zod validation, storage-persist request, backup nudge | Export from browser A imports cleanly into browser B |
| **5. Polish** | PWA offline, keyboard shortcuts (space = start/pause, `n` = new card), dark mode pass, empty states, favicon/manifest | Lighthouse PWA installable; works with wifi off |

Each phase ends with a deploy. Phases 1 and 2 are independent and could be
reordered.

---

## 10. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Background tab throttling breaks countdown | Timestamp-based engine + Web Worker + `visibilitychange` check (§5) |
| Browser evicts IndexedDB (storage pressure, "clear site data") | `storage.persist()`, export nudges, versioned import |
| Multi-tab double-counting sessions | Web Locks elects one timer owner; BroadcastChannel syncs the rest |
| Data loss on browser/device switch | Export/import is a first-class Phase-4 feature, not an afterthought |
| Scope creep (sync! accounts! teams!) | Principles §1: if it needs a backend, it's out of scope for v1 |

**Deferred ideas (v2+):** ambient sounds, per-tag stats, task recurrence,
optional end-to-end-encrypted sync via a self-hosted CouchDB — noted only so
they don't sneak into v1.
