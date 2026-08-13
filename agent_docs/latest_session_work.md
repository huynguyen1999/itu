# Latest Session Work

## Session date

2026-08-13

## Completed

- Resolved the Calendar and Sync merge conflicts while preserving the current Calendar presentation and existing user-owned changes.
- Moved API Calendar persistence and external integration concerns behind typed ports, extracted its scheduler, and moved Preferences/Journal persistence behind typed repositories.
- Reduced Web `CalendarPage` to a composition root, reused the shared default Due Date rule, and made Sync cache/channel work safe across logout and User Account changes.
- Split macOS Budget/Gym and Notifications/Trash responsibilities while keeping stable `AppModel`/`OfflineStore` façades; hardened Sync lifecycle ownership and monotonic cursor handling.
- Added canonical Calendar semantics fixtures and an executable architecture-boundary check.

## Verification

- API: 70 suites / 315 tests, typecheck, build, Prisma generate/validate, architecture boundary check, and byte-stable OpenAPI regeneration passed.
- Web: 56 files / 301 tests, typecheck, and production build passed.
- Extension: 11/11 tests passed. All touched Swift production/test files parse and repository conflict/whitespace checks pass.
- Signed macOS build/test could not reach compilation because `KeyboardShortcuts` package DNS and sandboxed Swift/Xcode cache access are unavailable; signing was not disabled.

## Unfinished

- Re-run the signed macOS build/test gate when dependency and cache access are available. No further architecture-refactor scope is open.

## Next entry point

Run the signed macOS gate only; otherwise proceed with normal product work without reopening this remediation plan.

---

## Session date

2026-08-11

## Completed

- Replaced the extension's seven-day cumulative website store with IndexedDB Website Activity Sessions, daily URL/domain projections, safe legacy aggregation, a local dashboard, local-only deletion/reset controls, and a durable partial-acknowledgement outbox.
- Added DSN-authenticated Website Activity Session ingestion with owned idempotent checkpoint upserts, timezone-correct statistics/session reads, title/Private metadata, and Web/macOS domain-to-URL-to-session presentation.
- Enforced URL query/credential/fragment removal, initial-plus-three transient retries, persisted FAILED/BLOCKED behavior, and signal-based recovery without periodic retry loops.
- Repaired usage engagement storage and delivery: explicit 5C cleanup of app summaries with missing engagement, native watermark/cache cleanup, `engagedSeconds` serialization/invariants, ~120-second batched app/website uploads, and lifecycle flushes.
- Reworked Web Statistics usage presentation with truthful Engaged Time copy, accessible coverage details, a Recharts top-domain donut with `Other`, keyboard/pointer selection, and paginated URL drilldown.
- Added the app identity/icon pipeline: user-scoped API metadata and processed media, deterministic macOS AppKit icon hashing/upload with account-safe coalescing and retry, and zero-extra-request authenticated Web rendering with initials fallback.
- Repaired icon replacement cleanup, route-segment escaping, concurrent upload duplication, duplicate wake ticks, and stale-account upload/application races found by independent review.
- Aligned Web and macOS primary navigation to Productivity, Tracking, Knowledge, and System; added real Web Conflicts/Notifications destinations, canonical mobile reachability, Plan child-route selection, and native/Web parity tests.
- Added the native Statistics settings popover with persisted display controls and hydrated/synced usage preferences. Repaired account-switch tracker recreation, exclusion editing, preference error feedback, privacy-filter fallback, and accessible native controls found during independent review.
- Unified global Trash across Tasks, Journal entries, Budget transactions, Gym workouts, and user-owned exercises. Added versioned/device-aware tombstones, stale-safe queued restores, confirmed permanent deletion with media/reference safeguards, native offline-restart persistence, exact Web/native filters, and removed Journal-local Trash navigation.
- Normalized Journal presentation across Web and macOS while preserving its offline-first contract; added responsive inspector behavior, accessible controls, tokenized native surfaces, and motion-safe Web states.
- Brought macOS Budget to Web capability parity and repaired current-period hydration, strict limit validation, archived filtering, and pending category/period/transaction replay across refresh and restart.
- Rebuilt Gym as a live logger across API, Web, and macOS with granular child mutations, field-clock merges, offline optimistic replay, exercise picking, metric-aware sets, completion/reopen, timers, units, settings, summaries, history, and progress. Routine/HealthKit/watchOS remain excluded.

## Verification

- Website Activity: extension 11/11; API Prisma generate/validate, typecheck/build, and 59 suites / 254 tests; Web typecheck, 43 files / 207 tests, and production build; signed macOS build plus focused API/Statistics 13/13 passed.
- API: Prisma generate/validate, preference-focused tests, build, app-identity full/focused gates, and deterministic OpenAPI generation passed.
- Web: full 43-file / 207-test gate, typecheck, build, focused Statistics/API/navigation tests, and independent accessibility/design reviews passed.
- macOS: signed Apple Development app identity, usage, navigation parity, Statistics display, and API client suites passed. The latest full signed run executed 237 tests (234 passed); its three failures are incumbent Usage Tracking and Journal tests unrelated to Statistics settings. All touched Swift files parse and `git diff --check` passes.
- Global Trash: API focused Trash/Sync tests (20), typecheck, and build passed; Web focused Trash/API/cache tests (26) and production build passed; the signed native restart/restore regression passed after fixing a shared exclusivity trap. The broader signed run's two remaining failures are incumbent Journal parity assertions.
- Final plan gate: API **63 suites / 273 tests**, typecheck, and build passed; Web **47 files / 221 tests**, typecheck, build, and UI detector passed; signed Apple Development `BudgetGymParityTests` + `OfflineStoreTests` passed.

## Unfinished

- Website Activity migrations `20260811120000_website_activity_sessions` and `20260811130000_website_activity_session_contract` are not deployed.
- The approved legacy-engagement cleanup and additive app-identity migrations are not deployed.
- The additive global-Trash migration `20260811140000_global_trash` is not deployed.
- The additive Gym granular-sync migration `20260811150000_gym_granular_sync` and the earlier separation migration `20260810000000_budget_gym_journal_separation` are not deployed.
- An existing frontmost-application timing test (`testRestartDoesNotBackfillTimeBetweenTrackerInstances`) remains flaky in isolated signed execution without assertion diagnostics; the new cancellation test and relevant focused suites pass.
- Authenticated Web visual QA could not run because the sandbox cannot bind the Vite server and no authenticated fixture is available.
- The generated OpenAPI artifact includes intended uncommitted route/schema changes, so the repository's HEAD-diff-based OpenAPI check exits nonzero until those changes are committed.
- Manual authenticated two-device Gym field-merge and offline restart/reconnect acceptance remains unrun.

## Next entry point

Apply and validate the required migrations, then run authenticated Web visual QA and the manual two-device Gym conflict/offline acceptance flow. Do not redo implementation Phases 0–23.

---

## Session date

2026-08-10

## Completed

- Separated Budget Transactions and Gym Workouts from Journal with standalone Prisma models, repositories, REST contracts, Sync handlers, versions, tombstones, and Workout Exercise snapshots.
- Narrowed Journal to Notes and Weekly Reviews while retaining Tags, Templates, Attachments, Revisions, Trash, structured reflections, and read-only activity summaries. Removed the former Expense/Workout Journal runtime contracts and data.
- Implemented the retained Budget, Gym, and Journal capability union on Web and macOS with durable optimistic outboxes, restart/reconnect reconciliation, conflict handling, decimal-string money, optional durable Exercise images, idempotent Journal attachment upload, offline attachment deletion, and offline revision restore.
- Added both Gym Workout entry paths: `IN_PROGRESS` to `COMPLETED`, and direct `COMPLETED` creation.
- Locked Budget and Journal product-calendar calculations to `Asia/Ho_Chi_Minh` and normalized Weekly Review date contracts to `YYYY-MM-DD`.
- Repaired missing Website Usage Summaries in macOS Statistics by correcting the batch upload route, merging server and pending local values, and fixing browser attribution/error states.
- Updated the parity plan, Journal contract, roadmap, glossary, and platform architecture documents. Preserved unrelated architecture walkthrough changes and Git state.
- Ran the guarded development Journal reset against the local `iTu` database: 7 entries and 11 revisions removed; no Journal attachments/media, templates, or tags existed.

## Verification

- API: Prisma generate/validate, typecheck, build, and 56 suites / 227 tests passed.
- Web: typecheck, build, and 43 files / 206 tests passed.
- macOS: all touched Swift sources/tests parse; focused offline parity regressions were added; independent cross-platform review found no remaining production code blockers.
- `git diff --check` passes.

## Unfinished

- The post-repair signed macOS focused/full build and test gate is blocked before compilation because GitHub DNS/cache access cannot resolve the existing `KeyboardShortcuts` package. Earlier signed suites passed before the final native repair.
- The separation migration `20260810000000_budget_gym_journal_separation` was not applied. The environment rejected the migration-status permission request; do not bypass that boundary.
- Manual two-device conflict and offline restart/reconnect acceptance has not been exercised against running clients.
- The separation migration is a disposable-development cutover and must not be deployed to retained production Journal data without a separate data-migration decision.

## Next entry point

When dependency access is available, run the signed macOS focused and full gates with automatic Apple Development signing. Then inspect/apply the separation migration only to the disposable local database and execute the two-device active-Workout conflict plus offline Journal attachment/revision acceptance flow.
