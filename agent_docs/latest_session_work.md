# Latest Session Work

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
