# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

Individual practitioners and self-directed learners who manage their own tasks, focus sessions, daily habits, spaced-repetition study, and long-term personal growth within a single unified workspace.

## Product Purpose

iTu provides a personal-first productivity and learning system that seamlessly integrates task planning (Eisenhower matrix, subtasks, scheduling), task-linked focus sessions (Pomodoro/stopwatch), dedicated habit tracking, spaced-repetition flashcard learning (Learn module), a Calendar timeline, and a gamified Growth engine (XP, attributes, coins, shop, and ledgers). Success means enabling deep work, consistent habit execution, efficient knowledge retention, and transparent personal progression without relying on disjointed single-purpose tools.

## Positioning

An offline-first, single-user productivity and learning hub that tightly connects task execution with real-time focus timers, habit check-in journals, spaced-repetition study reviews, and a deterministic gamified progression economy (XP and inventory ledger).

## Operating Context

- Web application running on React 19, Vite, TanStack Query, Tailwind CSS, and shadcn/ui.
- Native macOS client (SwiftUI) sharing the same `iTuTheme` token palette and design language as the web client, with native SF Symbols, controls, menu-bar focus status, and responsive split-rail behavior.
- Multi-device and multi-tab synchronization backed by an IndexedDB offline mutation queue, WebSocket change invalidation, and push-then-pull REST sync against a NestJS/Fastify/Prisma API.
- Dense task workspace with smart lists, tags, inline capture, a persistent task-detail inspector, and Eisenhower matrix views.
- Focus session overlay/global timer, habit check-ins and heatmaps, Calendar timeline views, spaced-repetition study review, Growth dashboard/shop, Budget tracking, Gym workout logging, Journal notes and reviews, usage Statistics, Trash, Notifications, Conflicts, Profile, and Settings.

## Capabilities and Constraints

- **Capabilities**:
  - Task management with projects, tags, priorities, subtasks, scheduling, explainable Eisenhower matrix, and smart views.
  - Task-linked Pomodoro & stopwatch focus sessions with server-authoritative state and global timer.
  - Dedicated boolean, count, duration, and quantity habit check-ins, heatmaps, streaks, and habit journal.
  - Spaced-repetition flashcard decks, cards, study reviews, and learning history.
  - Calendar timelines for Day, Week, and Month views, grouped Tasks, Due Dates, Focus Sessions, and read-only external calendar events, with task arrange/move/resize interactions and synced display preferences.
  - Budget workspaces for overview, transactions, budgets, and categories.
  - Gym workspaces for overview, active workouts, exercise library, and workout history.
  - Journal notes, tags, templates, revisions, attachments, and weekly reviews.
  - Usage and Website Activity statistics with privacy-aware local/offline states and drill-down history.
  - Offline-first mutation queue (IndexedDB), ULID entity identifiers, multi-tab BroadcastChannel state sharing, and WebSocket real-time invalidation.
  - Gamified Growth system featuring starter Attributes and Skills, permanent Account XP and Skill XP, coins, immutable Growth Ledgers, Growth Receipts, and a Shop Item inventory.
- **Constraints**:
  - Strictly Yarn Classic 1.22 (`yarn`) package manager inside `web/` and `api/` (no `npm` or `pnpm`).
  - Preserve the current top-level product boundaries (`api/`, `web/`, `macos/`, `extension/`); do not add another client stack without a product decision.
  - Hexagonal layering in NestJS backend (`core/domain`, `core/application`, `infrastructure/transport`, `infrastructure/persistence`).
  - TanStack Query owns server state; local React state reserved for ephemeral UI.

## Brand Commitments

- Product name: iTu.
- Binding visual world: "The Botanical Sanctuary" — a calm teal-and-mint productivity aesthetic fully defined in [`DESIGN.md`](DESIGN.md).
- Binding cross-platform token vocabulary: the `--itu-*` CSS custom properties (web) mirror the `iTuTheme` enum (macOS) token-for-token; token names and roles are the cross-platform contract.
- Binding palette: deep organic teals (`--itu-teal-600` `#167f71`), fresh mint highlights (`--itu-teal-400` `#3fb6a4`), warm amber/coral/gold accents, and paper/forest neutral surfaces.
- Binding typography: Manrope (display/body), Fraunces (editorial serif accent), IBM Plex Mono (mono metrics); native clients map these to system faces (SF Pro / SF Mono / New York).

## Evidence on Hand

- Functional web client (`web/`) with active workspaces for Home, Plan, Matrix, Focus, Calendar, Habits, Statistics, Budget, Gym, Journal, Learn, Growth, Trash, plus utility destinations for Conflicts, Notifications, Profile, and Settings (`web/src/features/`).
- Native macOS client (`macos/`) with the same workspace vocabulary, native menu-bar Focus status, a fixed primary rail, responsive planning rail, and the shared token system in [`macos/iTu/Shared/UI/iTuTheme.swift`](macos/iTu/Shared/UI/iTuTheme.swift).
- Durable design system captured in [`DESIGN.md`](DESIGN.md).
- Current implementation status and verification notes in [`README.md`](README.md), [`agent_docs/project_progress.md`](agent_docs/project_progress.md), and [`agent_docs/latest_session_work.md`](agent_docs/latest_session_work.md).

## Product Principles

1. **Integrated Unity over Fragmented Tools**: Tasks, focus, habits, learning, and growth are mutually reinforcing layers of a single workflow, not isolated silos.
2. **Offline-First Reliability & Instant Perception**: Writes reflect immediately in local cache and IndexedDB before syncing asynchronously; state is never lost during network drops.
3. **Data Integrity & Determinism**: All entity IDs use client-generated ULIDs; timestamps are stored in UTC; state changes produce immutable, explainable receipts and audit ledgers.
4. **Scannability & High Density**: Provide rich productivity tools with clean, low-friction interactions and structural clarity suitable for daily personal operation.
