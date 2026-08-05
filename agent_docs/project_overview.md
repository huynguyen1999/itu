# Project Overview

## Purpose

iTu is a personal-first productivity and learning system for individual practitioners and self-directed learners. It combines task planning, task-linked focus sessions, habit tracking, spaced-repetition study, and a deterministic Growth economy in one workspace.

The product is designed to support deep work, consistent habit execution, knowledge retention, and transparent personal progression without requiring several disconnected tools.

## Current capabilities

- Planning with projects, tasks, one-level subtasks, tags, priorities, scheduling, due dates, reminders, recurrence metadata, smart views, ordering, completion, cancellation, archive, and recoverable trash.
- Focus sessions with Pomodoro and stopwatch modes, task linking, pause/resume, extensions, completion and abandonment, history, conflict handling, and a global timer.
- Habit schedules and occurrence tracking with boolean, count, duration, and quantity progress, check-ins, journals, streaks, heatmaps, and archive controls.
- Decks, cards, review sessions, spaced repetition, and learning history.
- Growth attributes and skills, XP and levels, coins, achievements, rewards, inventory, and shop purchases.
- Offline-first web mutations for supported entities with IndexedDB persistence, optimistic TanStack Query updates, cross-tab coordination, cursor pulls, WebSocket invalidation, and conflict retention.

## Architecture and workflows

The web client writes supported mutations to a durable IndexedDB outbox, updates its local TanStack Query cache immediately, and synchronizes through a push-then-pull REST protocol. Other tabs coordinate through BroadcastChannel; other devices receive WebSocket invalidations and pull changes after their cursor.

The API follows hexagonal layering:

```text
React web
  -> IndexedDB outbox and authenticated batch sync
  -> NestJS / Fastify transport
  -> application services and domain rules
  -> Prisma adapters
  -> PostgreSQL
```

RabbitMQ handles scheduled, synchronization, and AI jobs. Redis is provisioned by the local Compose file for future infrastructure; the current application code does not depend on it according to the project README.

The web app is organized by feature and keeps reusable API, authentication, browser, editor, Markdown, synchronization, UI, and utility behavior in `shared`. Server state belongs to TanStack Query; local React state is limited to ephemeral interaction and forms.

The macOS client is a native SwiftUI application that mirrors the web product’s planning, focus, habits, learning, Growth, statistics, account, notification, and synchronization concepts. Its current parity and follow-up work are tracked in `macos/ROADMAP.md`.

The two clients share a calm, focused product language and consistent terminology, status meaning, and interaction semantics. The web client uses its CSS token and shared-component system; the macOS client uses the native `iTuTheme` and SwiftUI/AppKit conventions. Detailed shared and platform-specific rules are maintained in `agent_docs/frontend_design_guidelines.md`, `agent_docs/web_client_guidelines.md`, and `agent_docs/swiftui_client_guidelines.md`.

## Major decisions

- Keep API domain and application behavior independent from transport and persistence adapters.
- Use client-generated ULIDs, UTC timestamps, optimistic versions, idempotency, and transactional persistence for synchronizable entities.
- Treat IndexedDB and the existing sync queue as the write path for cross-device web and native mutations; feature code must not call sync endpoints directly.
- Keep Growth award and inventory state explainable through immutable or append-only ledgers.
- Preserve feature ownership boundaries: API use cases own authorization and business rules; web features own presentation; shared synchronization owns cache and queue behavior.
- Keep web and macOS behavior semantically consistent while allowing each client to use platform-native navigation, layout, input, and accessibility behavior.

## Documentation notes

The root `README.md` references `PLAN.md` and a root `ROADMAP.md`, but those files are not present at the workspace root in the inspected state. The macOS project has its own `macos/ROADMAP.md`, which is the verified native status source.
