# iTu

iTu is a personal productivity and learning application. The current working
implementation combines task planning, task-linked focus sessions, dedicated
habits, and spaced-repetition learning.

See [PLAN.md](./PLAN.md) for the product direction and
[ROADMAP.md](./ROADMAP.md) for verified progress and known gaps.

## AI Agent Guidelines

If you are working on this repository using an AI coding assistant (e.g. Antigravity, Codex CLI, Cursor, Gemini), please review the agent rules before making changes:

- [AGENTS.md](./AGENTS.md) — Open standard guidelines, safety rules, architecture constraints, and verification protocols.
- [GEMINI.md](./GEMINI.md) — Operational instructions and strict constraints for Gemini and Codex models.

---

## Current state

### Implemented

- Existing authentication, decks, cards, spaced repetition, history,
  AI learning helpers, offline sync foundation, settings, and account lifecycle.
- Projects, tasks, one-level subtasks, tags, four priorities, estimates,
  persistent custom sections, manual ordering, scheduling, due dates,
  recurrence metadata, independent reminders,
  completion, cancellation, and archive states.
- Explainable Eisenhower urgency using explicit overrides, overdue state,
  near-due state, and high priority.
- Today, Plan, Inbox, Upcoming, Matrix, Focus, Habits, Growth, and Learn web routes.
- A dense three-pane task workspace with smart lists and tags, grouped task
  rows, inline capture, and a persistent task-detail inspector.
- Decks, cards, Review, and Learning History remain first-class navigation
  destinations under Learn.
- Task-linked Pomodoro countdown and stopwatch sessions.
- Default 25/5 and 50/10 focus presets, pause/resume, extension,
  interruptions, completion, abandonment, version conflicts, event
  idempotency, and one active session per user.
- Persistent global web timer and focus history summary.
- Dedicated build/limit habits with weekday, interval, weekly, and monthly
  schedules.
- Boolean, count, duration, and quantity progress through append-only,
  source-attributed logs; complete, missed, skip, undo, and adjusted backfill.
- A time-of-day Habit Journal, reusable occurrence checklists, history heatmap,
  current/best streaks, success rate, archive controls, and Today filters.
- One-time supporting tasks, dedicated generated-task templates, configurable
  task↔habit completion synchronization, and focus-derived duration progress.
- New productivity data in account export and sync bootstrap snapshots.
- Offline-first web mutations for tasks, task lists, decks, cards, study
  sessions/reviews, and AI jobs, backed by IndexedDB with conflict retention.
- Multi-tab and multi-browser synchronization through per-tab client identity,
  BroadcastChannel optimistic updates, cursor pulls, and WebSocket invalidation.
- A grouped Growth system with six starter Attributes and six starter Skills,
  permanent XP and levels, coins, immutable award/reversal ledgers,
  configurable task, habit, and focus rewards, metric/manual achievements,
  a unified item catalog, an append-only inventory, and atomic Shop purchases.
- Task details use a searchable grouped Growth picker with shared or
  per-entry XP, coin rewards, and item quantities. Task rows show concise
  reward chips, while acknowledged completions return server-calculated
  progress receipts with level-ups, balances, and inventory quantities.

### Planned or incomplete

- Applying the new migration to the configured database.
- Scheduled recurring task occurrence generation.
- Service-worker push notifications while the web app is closed and email
  reminder delivery.
- Complete focus policy CRUD and automatic work/break transitions.
- Health, Screen Time, Calendar, and external habit-progress adapters.
- Google Calendar.
- Native SwiftUI macOS application.
- Notes and weekly review.
- Screen recording, enforcement, productivity rules, and AI reports.

The detailed status and verification evidence live in
[ROADMAP.md](./ROADMAP.md).

---

## Architecture

```text
React web
    │ IndexedDB outbox + authenticated batch sync
    ▼
NestJS / Fastify transport
    │
    ▼
Application services and domain rules
    │
    ▼
Prisma adapters ── PostgreSQL
    │
    ├── RabbitMQ scheduled, sync, and AI jobs
    └── cursor sync + WebSocket invalidation for offline clients
```

The web client writes supported mutations to a durable IndexedDB outbox,
updates TanStack Query optimistically, and flushes through `POST /sync`.
Each browser installation has a stable device identity and each tab has a
separate client identity, allowing sibling tabs and other browsers to receive
`SYNC_AVAILABLE` without replacing one another's socket connection.

The API follows a hexagonal structure:

- `core/domain` contains framework-independent models, enums, and errors.
- `core/application` contains use cases, business rules, and ports.
- `infrastructure/transport` contains REST controllers, guards, and DTO
  validation.
- `infrastructure/persistence` contains Prisma mapping and repositories.
- `features` assembles NestJS modules.

The new productivity vertical slice keeps its rules in application services.
Persistence is currently provided through the shared Prisma adapter. Further
work should move the larger productivity persistence surface behind explicit
repository ports before additional clients are added.

The web application uses feature folders for complete product areas and
`shared` for API, authentication, browser, Markdown, and reusable UI behavior.
TanStack Query owns server state; local React state is limited to forms and
ephemeral interaction state.

---

## Repository layout

```text
api/       NestJS, Fastify, Prisma, PostgreSQL, RabbitMQ, and tests
web/       React 19, Vite, TanStack Query, Tailwind, and shadcn/ui
macos/     Reserved for the future native SwiftUI application
AGENTS.md  Agent guidelines, safety rules, and operational constraints
GEMINI.md  Gemini and Codex instructions and strict boundaries
PLAN.md    Product direction and delivery phases
ROADMAP.md Living status, verification, limitations, and next milestone
```

The `api/`, `web/`, and `macos/` directories are independent Git repositories
even though they share this workspace.

---

## Requirements

- Node.js 20 or newer.
- Yarn Classic 1.22.
- PostgreSQL 16.
- RabbitMQ 4.
- Docker Compose is recommended for local infrastructure.

The supplied Compose file also provisions Redis 7 for future infrastructure;
the current application code does not depend on Redis.

---

## Local setup

### API

```bash
cd api
yarn install
cp .env.example .env
docker compose up -d
yarn prisma:generate
yarn prisma:deploy
yarn prisma:seed
yarn prisma:seed2
yarn dev
```

Before running `prisma:deploy`, verify that `DATABASE_URL` points to a
disposable or explicitly approved database. The workspace used during this
implementation pointed to a remote database, so the new migration was not
applied automatically.

The API listens on `http://localhost:3000` by default.

`prisma:seed2` is an idempotent sample-data seed. Run it after `prisma:seed`
to recreate the representative admin workspace with sample tasks, growth
rewards, decks, habits, focus sessions, and recoverable Trash entries.

For private-network development through a machine IP, keep the browser page and
API on the same host so the HTTP-only refresh cookie is sent on `/auth/refresh`.
Leave `VITE_API_BASE_URL` empty to let the web app choose the API host from the
current page host: `http://localhost:5173` uses `http://localhost:3000`, while
`http://100.114.72.98:5173` uses `http://100.114.72.98:3000`. Add both browser
origins to `WEB_ORIGIN` in `api/.env`, separated by commas.

### Web

```bash
cd web
yarn install
cp .env.example .env
yarn dev
```

The web application listens on `http://localhost:5173` by default. It reads the
API address from `VITE_API_BASE_URL` when set, otherwise it uses the current page
hostname with API port `3000`.

---

## Quick Command Cheat Sheet

| Task | API (`api/`) | Web (`web/`) |
| --- | --- | --- |
| **Start Dev Server** | `yarn dev` | `yarn dev` |
| **Run Typecheck** | `yarn typecheck` | `yarn typecheck` |
| **Run Unit Tests** | `yarn test --runInBand` | `yarn test` |
| **Build Production** | `yarn build` | `yarn build` |
| **Create Migration** | `yarn prisma:migration:create` | N/A |
| **Deploy Migration** | `yarn prisma:deploy` | N/A |

---

## Environment variables

Start from the checked-in `.env.example` files. Important API groups include:

- `DATABASE_URL`
- `RABBITMQ_URL` and queue names
- JWT access and refresh secrets
- Google OAuth credentials used by existing sign-in
- AI provider credentials and model names
- media storage paths
- logging controls
- `WEB_ORIGIN`

Never commit real credentials. Do not log passwords, tokens, OAuth payloads,
private notes, or reminder content.

---

## Database changes

Migrations are additive and live under `api/prisma/migrations`.

The committed planning, focus, habits, and Growth migrations add:

- planning projects, tasks, tags, reminders, and occurrences
- focus presets, policies, sessions, events, and interruptions
- habits, habit reminders, occurrences, and check-ins
- Growth Attributes and Skills, earning rules, immutable XP/coin ledgers,
  achievements, item categories, task item awards, append-only inventory
  transactions, shop rewards, and redemption history

It also adds a partial unique index preventing more than one active or paused
focus session per user.

Create migrations with:

```bash
yarn prisma:migration:create
```

Apply committed migrations with:

```bash
yarn prisma:deploy
```

Use `yarn prisma:migrate` only with a disposable development database.

---

## Troubleshooting & Setup Caveats

- **Database Migration Safeguard**: Verify `DATABASE_URL` targets an approved or disposable database instance before running `yarn prisma:deploy`. Never apply unverified migrations to production or shared databases.

---

## Verification

### API

```bash
cd api
yarn typecheck
yarn test --runInBand
yarn build
```

### Web

```bash
cd web
yarn typecheck
yarn test
yarn build
```

For dated verification results and exact suite counts, see the
[ROADMAP verification log](./ROADMAP.md#verification-log).

---

## Code conventions

### API

- Keep domain and application behavior independent from controllers and DTOs.
- Validate every external input with class-validator DTOs.
- Enforce ownership in use cases or repositories.
- Do not expose raw Prisma entities intentionally as long-term public
  contracts; map stable response DTOs as the API matures.
- Use transactions for multi-record state changes.
- Use opaque ULIDs for client-synchronizable entities.
- Require idempotency keys for retryable events.
- Use optimistic versions for state-machine conflicts.
- Store timestamps in UTC and apply user timezone rules at scheduling edges.
- Throw domain exceptions and let the transport filter map them.
- Add focused Jest tests for business rules.

### Web

- Use strict TypeScript.
- Keep server state in TanStack Query.
- Keep feature-specific components inside their feature folder.
- Put reusable API, authentication, browser, Markdown, and UI behavior in
  `shared`.
- Follow existing Tailwind v3 and shadcn/ui conventions.
- Keep authorization enforcement in the API.
- Add focused Vitest coverage for calculations and important interaction
  behavior.

### General

- Use Yarn Classic; do not add `package-lock.json`.
- Keep migrations additive and review destructive operations explicitly.
- Update `ROADMAP.md` whenever a milestone changes state.
- Mark work completed only after its documented verification passes.
