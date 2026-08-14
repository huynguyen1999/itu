# Project Structure

## Workspace

```text
api/       NestJS, Fastify, Prisma, PostgreSQL, RabbitMQ, and backend tests
web/       React/Vite application, feature modules, shared client behavior, and tests
macos/     Native SwiftUI application, shared models, persistence, sync, and tests
tools/     Project tooling
plans/     Planning artifacts
agent_docs/ Durable project context and workflow routes
```

The API, web, macOS, and workflow directories are independent Git repositories or repository boundaries inside the shared workspace. Existing uncommitted changes in those project repositories are user-owned and outside this documentation task.

## API ownership

- `api/src/core/domain`: framework-independent domain models, enums, and errors.
- `api/src/core/application`: use cases, business rules, constants, pagination, and ports. Production core code does not import infrastructure, `PrismaClient`/`PrismaService`, `Prisma.TransactionClient`, or Prisma input/client types; generated `@prisma/client` business-enum imports remain where needed.
- Usage application behavior is split between `UsageQueryService`, `UsageIngestionService`, `UsageWebsiteService`, and `UsageIdentityService`; `UsageService` remains the controller-facing facade and `usage-validation.ts` contains pure validation/normalization.
- Calendar application services consume typed repository and integration ports. Calendar persistence, HTTP/ICS/Google OAuth and token crypto adapters, and the periodic sync scheduler remain under infrastructure.
- `api/src/core/application/ulid.ts`: application ULID generator; `api/src/infrastructure/persistence/prisma/ulid.ts` re-exports it for infrastructure callers.
- `api/src/infrastructure/transport`: REST controllers, guards, and DTO validation.
- `api/src/infrastructure/persistence`: Prisma mapping and repositories. `PrismaSyncRepository` is the sync facade and delegates mutation handling to `prisma-sync-transport-mutations.ts`, `prisma-sync-study-mutations.ts`, `prisma-sync-focus-habits.ts`, `prisma-sync-tasks.ts`, and `prisma-sync-growth-mutations.ts`.
- `api/src/infrastructure/persistence/prisma/prisma-productivity-habits.ts` composes `PrismaFocusPersistence` for focus persistence; `prisma-growth.repository.ts` composes `PrismaGrowthResets` for Growth reset persistence.
- `api/src/infrastructure/queue`, `ai`, `logging`, `security`, and `sync`: infrastructure adapters and integrations.
- Preferences persistence and Journal persistence (including Weekly Review snapshot queries) are injected through typed application ports and implemented by Prisma adapters.
- `api/src/features`: NestJS assembly for AI, auth, cards, dashboard, decks, devices, Growth, productivity, study, sync, and trash.
- `api/prisma`: schema, seeds, and additive migrations.

## Web ownership

- `web/src/features`: complete product areas including auth, dashboard, decks, focus, Growth, habits, history, learning, planning, profile, review, settings, statistics, today, and trash.
- `web/src/shared/ui/Layout.tsx` receives feature slots; `web/src/App.tsx` composes the planning sidebar and global focus timer into those slots.
- `web/src/features/planning/components/PlanningSidebar.tsx`: planning-owned sidebar surface; it is composed by `App` rather than owned by shared UI.
- `web/src/features/calendar/CalendarPage.tsx` is a thin composition root. Calendar data/preferences and task interactions live in feature hooks; toolbar, settings, timeline, and arrangement surfaces live in feature components. Day, Week, and Month behavior remains unchanged.
- `web/src/features/planning/MatrixPage.tsx` is a composition root over `MatrixToolbar`, `MatrixTaskDialog`, `MatrixTaskGrid`, selection, and existing task-ordering helpers.
- `web/src/features/calendar/components/CalendarTimeline.tsx` coordinates timeline state; `CalendarTimelineViews.tsx` owns Day/Week/Month rendering pieces without moving calendar algorithms into shared code.
- Reusable Growth presentation and reward-editing utilities live in `web/src/shared/ui/GrowthIcons.tsx`, `GrowthRewardChip.tsx`, and `GrowthRewardEditor.tsx`, with shared Growth calculations/filtering in `web/src/shared/growthRewardMath.ts`, `growthEntryFilters.ts`, and `constants/growth.constants.ts`.
- `web/src/features/growth/GrowthPage.tsx` composes feature-local `components/GrowthLedger.tsx`, `GrowthDialogs.tsx`, `GrowthSkillCard.tsx`, `GrowthSettings.tsx`, and `GrowthPrimitives.tsx`.
- `web/src/shared/api`: typed API client and contracts. `client.ts` is the stable facade composed from `apiContext.ts`, `syncApi.ts`, `productivityApi.ts`, `focusProductivityApi.ts`, `authApi.ts`, `growthApi.ts`, and `deckStudyApi.ts`; feature imports and public methods remain stable.
- `web/src/shared/auth`: authentication state and refresh behavior.
- `web/src/shared/sync`: offline store, mutation queue, cache reconciliation, WebSocket invalidation, and sync provider.
- Web sync is guarded by authenticated account/session lifecycle generations. Sync changes invalidate Calendar projections (including task-list, task, Focus, external-calendar, and calendar-preference changes) through the shared cache reconciler.
- `web/src/shared/ui`, `hooks`, `utils`, `constants`, `editor`, `markdown`, and `browser`: reusable cross-feature behavior.
- `web/src/styles`: application styling and design tokens.

Feature code should remain inside its feature directory; reusable behavior belongs in `shared`. TanStack Query owns server state.

Cross-feature imports should use the exporting feature's public entrypoint (for
example, `@/features/calendar`) rather than a deep implementation path. The
architecture checker reports existing deep imports as migration warnings.

Code-health enforcement lives in `tools/check-architecture.mjs` and
`tools/architecture-large-files-baseline.json`. Root workflows run the
boundary check, dependency-cruiser cycle/boundary checks, and report-only Knip
unused-code checks; oversized files are grandfathered but may not grow beyond
the recorded baseline allowance. Knip currently reports no unused files or
dependencies; remaining exported types are retained API/domain contracts.

## macOS ownership

- `macos/iTu/Features`: native feature surfaces for authentication, conflicts, focus, Growth, habits, home, learning, menu bar, notifications, settings, shell, statistics, and tasks.
- `macos/iTu/App/AppModel.swift` and `AppModel+*.swift` split the same `AppModel` type into feature-responsibility extensions; `macos/iTu/Shared/Persistence/OfflineStore.swift` and `OfflineStore+*.swift` use the same pattern for persistence responsibilities.
- AppModel extensions keep Budget, Gym, Notifications, and Trash responsibilities separate; matching OfflineStore extensions keep their persistence and pending-mutation replay separate while preserving the shared facade.
- `macos/iTu.xcodeproj/project.pbxproj` uses synchronized root groups for `iTu` and `iTuTests`, so files under those groups are auto-included by the Xcode targets.
- `macos/iTu/Shared/API`: the `APIClient` transport/session actor facade, endpoint-family extensions, and session cache.
- `macos/.swiftlint.yml` and `macos/.periphery.yml` define non-blocking native code-health checks; `macos/scripts/code-health.sh` runs them when the tools are installed.
- `macos/iTu/Shared/Models`: typed native models and settings state.
- `macos/iTu/Shared/Persistence`: offline snapshot and mutation persistence.
- `macos/iTu/Shared/Sync`: synchronization coordinator and ULID support.
- macOS sync transport is guarded by account/store lifecycle generations. OfflineStore applies only changes newer than its local cursor, orders applicable changes, and advances the cursor monotonically.
- `macos/iTu/Shared/UI`: native theme and shared controls.
- `macos/iTuTests`: native unit and interaction coverage.

## Documentation ownership

- `agent_docs/project_overview.md`: product purpose, architecture, workflows, and major decisions.
- `agent_docs/project_core_tech.md`: technology and infrastructure facts.
- `agent_docs/project_structure.md`: module ownership and boundaries.
- `agent_docs/project_guidelines.md`: iTu-specific agent rules.
- `agent_docs/frontend_design_guidelines.md`: shared product design language, interaction states, accessibility, cross-client consistency, and frontend work style.
- `agent_docs/web_client_guidelines.md`: React/Vite ownership, web design-system usage, responsive behavior, and verification workflow.
- `agent_docs/swiftui_client_guidelines.md`: native SwiftUI ownership, macOS interaction conventions, design-system usage, parity, and verification workflow.
- `agent_docs/project_progress.md`: durable implementation status.
- `agent_docs/project_diary.md`: lasting decisions and lessons.
- `agent_docs/latest_session_work.md`: cross-session handoff.
- `agent_docs/workflows/route_selection.md`: route selection, working states, context loading, and documentation responsibility by route.
- `agent_docs/workflows/direct_route.md` and `agent_docs/workflows/subagent_route.md`: per-route procedures.
