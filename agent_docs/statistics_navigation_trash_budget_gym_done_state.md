# Statistics, Navigation, Trash, Budget, and Gym — Done State

**Checkpoint:** 2026-08-11  
**Source plan:** [`plans/statistics-navigation-trash-budget-gym.md`](../plans/statistics-navigation-trash-budget-gym.md) and the user-approved implementation brief.  
**Overall status:** **PASS — Phases 0–23 implemented and verified. Deployment and manual cross-client acceptance remain pending.**

## Done

- **Phases 0–2 — Usage foundation:** regression coverage, engagement semantics, app-only legacy cleanup, and ~120-second upload/lifecycle delivery.
- **Phases 3–4 — Statistics Web and app icons:** truthful Engaged Time, domain donut and URL drilldown, user-scoped application identities/icons, native upload, and Web rendering.
- **Phase 5 — Navigation:** identical Web/macOS primary groups and order, real Web Conflicts/Notifications destinations, and parity tests.
- **Phase 6 — macOS Statistics settings:** persisted display controls plus hydrated tracking preferences and safe account switching.
- **Phase 7 — Global Trash:** Journal/Budget/Gym tombstones, queued stale-safe restore, confirmed permanent deletion, offline-restart persistence, exact global filters, and removal of Journal-local Trash.
- **Phase 8 — Journal styling:** Web and macOS Journal surfaces use the shared visual language, responsive editor/inspector layouts, accessible controls, and motion-safe states without changing offline data behavior.
- **Phase 9 — macOS Budget parity:** Overview, Transactions, Budgets, Calendar, and Categories now match the Web capability set, retain optimistic writes across refresh/restart, and hydrate the current Budget Period for offline overview values.
- **Phases 10–16 — Gym logger UX:** one-action start, prominent Active Workout navigation, filtered/custom exercise picker, metric-aware set logging, previous values, set completion/reopen, live rest timer, set types, units, sounds, and settings on Web and macOS.
- **Phases 17–22 — Gym reliability:** granular Workout/Workout Exercise/Workout Set Sync mutations, field clocks, versioned lifecycle mutations, compatible outbox compaction, optimistic restart/reconnect replay, remote child deletion, completion summaries, history, and Exercise progress.
- **Phase 23 — Explicit exclusion:** no Routine system, HealthKit, or watchOS integration was added. A legacy `ROUTINE` preference value remains accepted only for backward compatibility.

## Verified

- API full gate: **63 suites / 273 tests**, typecheck, and build passed; Prisma/OpenAPI focused Gym validation passed.
- Web full gate: **47 files / 221 tests**, typecheck, build, and Impeccable detection passed.
- macOS signed focused `BudgetGymParityTests` + `OfflineStoreTests` passed with Apple Development signing; focused Trash, navigation, Statistics, usage, and app-identity evidence remains green.
- Swift parse and repository whitespace checks passed.
- A prior full signed macOS run had three incumbent failures: one Usage Tracking timing test and two Journal parity assertions unrelated to this plan.

## Left before production release

1. Apply and validate the required undeployed migrations in the intended environment.
2. Run authenticated Web visual QA at desktop/mobile widths and in light/dark themes.
3. Exercise the manual two-device Gym field-merge flow plus offline restart/reconnect against running Web and macOS clients.
4. Resolve or formally quarantine the incumbent macOS Usage Tracking and Journal parity test failures before a release-wide green gate.

## Deployment boundary

The migrations below are additive/approved but **not deployed**:

- `20260811000000_usage_cleanup_legacy_engagement`
- `20260811100000_usage_app_identities`
- `20260811120000_website_activity_sessions`
- `20260811130000_website_activity_session_contract`
- `20260811140000_global_trash`
- `20260811150000_gym_granular_sync`

The earlier separation migration `20260810000000_budget_gym_journal_separation` is also unapplied and requires its documented disposable-data decision before deployment.

## Resume point

Implementation is complete. Resume at **deployment and manual cross-client acceptance**, not at an implementation phase. Do not redo Phases 0–23. Preserve the dirty working tree and use this file as the handoff checkpoint.
