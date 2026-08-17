# Latest Session Work

## Session date

2026-08-15

## Completed

- Replaced Budget v1 with the expense-only Budget v2 contract: Expenses, Expense Categories, Monthly Budgets, Category Budget Limits, Recurring Expenses, signed remaining values, derived reports, and explicit recurring confirmation/skip.
- Applied the destructive local Budget reset migration, removed the old Budget tables and queued v1 mutation replay paths, and kept the macOS reset scoped to Budget data only. Existing reset accounts lazily receive the ten default categories on first category load.
- Completed the REST, Prisma, sync, offline, macOS, and Web surfaces for expense CRUD, filtering/search, limits, recurring management, reports, Trash restore, and month selection. Updated the canonical glossary and platform architecture references to the v2 terms.

## Verification

- Local PostgreSQL: `20260815000000_budget_v2_reset` is applied; `Expense`, `ExpenseCategory`, `MonthlyBudget`, `CategoryBudgetLimit`, and `RecurringExpense` exist; old Budget tables are absent.
- API: 81 suites / 375 tests, typecheck, and build passed.
- Web: 64 files / 325 tests, typecheck, and production build passed.
- macOS: signed Apple Development build and six focused Budget tests passed.
- The Budget-scoped diff passes `git diff --check`. The repository also has two unrelated pre-existing Gym blank-line warnings; the only remaining Budget v1-name matches are the four intentional macOS queue-purge filters documented in `SyncModels.swift`.

## Unfinished

- No Budget implementation work remains in this cutover. Production deployment still requires the normal migration-target review; the destructive migration was verified only against the configured disposable local database.

## Session date

2026-08-13

## Completed

- Implemented Phase 1 Daily/Weekly Review Insights across API, Web, and macOS: durable Daily Reviews, richer Weekly Reviews, deterministic cross-domain review context, coverage/evidence contracts, structured Gemini output, queued AI jobs, and source-version stale protection.
- Preserved offline-first Journal writes and existing AI/job/provider boundaries. AI output remains separate from reflection and failed regeneration preserves the previous successful snapshot.

## Verification

- API: 72 suites / 328 tests, typecheck, and build passed.
- Web: 57 files / 309 tests, typecheck, and production build passed.
- macOS: the signed Apple Development build/test passed before the final offline replay hardening. The final rerun is blocked before test execution by pre-existing Swift 6 compile errors in `AppPerformanceSignposts.swift` and `EisenhowerMatrixView.swift`; the new review parity test was green in the earlier signed run.

## Unfinished

- Apply the additive `20260813100000_review_insights` migration before deployment, then run live Gemini configuration, authenticated visual QA, and two-device sync/generation acceptance.

---

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
# Session date

2026-08-17

## Completed

- Narrowed the in-progress iOS client to iPhone only: app, tests, widgets, and
  Device Activity targets use device family `1`; the app shell is a single tab
  navigation; Learn uses `NavigationStack`; Matrix uses a single-column layout.
- Recorded the decision and revised delivery/acceptance criteria in
  [`plan/ios-iphone-only.md`](../plan/ios-iphone-only.md).

## Verification

- Static inspection confirms no remaining iPad-specific shell, split-view, or
  size-class references under `ios/`.
- `xcodebuild -project ios/iTu.xcodeproj -scheme iTu -sdk iphonesimulator
  -configuration Debug build` passed, including the app, widgets, Device
  Activity extension, and shared `iTuCore` package.
- The focused `testNavigationDestinationsExposePhase6Sections` simulator test
  passed.
- The full simulator suite compiled, but remains red on the pre-existing
  `testHealthTransactionRollsBackOnPersistFailure` expectation and a later
  test-process restart; those failures are unrelated to the iPhone-only scope
  change.

## Unfinished

- Run the signed physical-iPhone/device-extension validation when the iOS
  provisioning and simulator/device environment is available.

## Follow-up: Screen Time import slice

### Completed

- Added the iPhone-only Device Activity report target and App Group snapshot
  transport for hourly application and website activity.
- Added normalization into the existing `UsageSummary` and
  `WebsiteUsageSummary` models, absolute per-window replacement, and upload
  through the existing usage batch endpoints.
- Added focused tests for normalization and duplicate/stale-bucket handling.

### Verification

- iPhone simulator build passed, including the app, widgets, monitor,
  Device Activity report extension, and shared `iTuCore` package.
- Focused simulator tests passed:
  `testDeviceActivityReportNormalizesHourlyApplicationsAndWebsites` and
  `testDeviceActivityImportReplacesEmptyBucketsWithoutDuplicatingRows`.
- Shared `iTuCore` `OfflineStoreTests` passed, including the existing Device
  Activity replacement regressions.
- Static iPhone-only scan still finds no iPad target-family, split-view, or
  size-class references under `ios/`.

### Unfinished

- Validate Family Controls authorization, non-tokenized bundle/domain data,
  report-extension callbacks, and real usage attribution on a provisioned
  physical iPhone. The simulator verifies compilation and persistence logic,
  not real Screen Time measurements.

## Follow-up: Journal attachment sync slice

### Completed

- Ported the existing macOS pending-Journal-attachment uploader to iOS.
- Wired upload draining into the normal sync lifecycle, preserving queued
  bytes on failure and removing them only after the returned attachment is
  persisted on the cached Journal entry.
- Updated the iPhone Journal copy to describe offline queueing and automatic
  reconnect upload.

### Verification

- iPhone simulator build passed, including the app, widgets, Device Activity
  extensions, and shared `iTuCore` package.
- Focused simulator tests passed for Screen Time normalization/replacement and
  HealthKit date/interval normalization.
- `git diff --check` passed.

### Unfinished

- Exercise attachment selection, offline relaunch, reconnect upload, and
  server-visible attachment reconciliation on a physical iPhone.

## Follow-up: iPhone review integration

### Completed

- Added phone-native daily and weekly review editors from Journal tools.
- Loaded the existing daily/weekly review context endpoints, including
  measured task, focus, habit, gym, app, website, and HealthKit metrics.
- Saved review reflections and measured snapshots through the existing offline
  Journal mutation/outbox path.
- Added online AI insight generation and local reconciliation for review
  entries.
- Added an offline XCTest covering both review kinds and snapshot persistence.

### Verification

- `xcodebuild ... build-for-testing` passed for the iPhone app, extensions,
  shared package, and test target.
- The focused runtime test could not execute because the local CoreSimulator
  service stopped; the same build successfully compiled and signed the test
  bundle.
- `git diff --check` remains clean.

### Unfinished

- Validate review loading, save/reconnect behavior, and AI insight generation
  against an authenticated backend on a physical iPhone.

## Follow-up: Growth Reset parity slice

### Completed

- Replaced the disabled iPhone Growth Reset placeholder with scope selection,
  optional skill selection, server preview, affected-skill/coin summary, and
  explicit destructive confirmation.
- Reused the existing Growth Reset API contract and generated an idempotency
  key for execution.
- Kept reset online-only and refreshed the cached account state after success.

### Verification

- `xcodebuild ... build-for-testing` passed for the iPhone app, extensions,
  shared package, and test target.
- `git diff --check` passed.

### Unfinished

- Validate preview and execution against an authenticated backend, including
  all three scopes, on a physical iPhone.

## Follow-up: iPhone local notifications

### Completed

- Added a native `UserNotifications` scheduler for active task reminders and
  countdown Focus completion.
- Added foreground presentation and tap routing into the Plan or Focus
  workspace.
- Rebuilt managed pending requests from each current offline snapshot, so
  completion, snooze, pause, logout, and account changes remove stale local
  notifications without a background polling loop.
- Added Settings permission state/request UI and a Task Detail reminder-create
  flow using the existing server reminder endpoint.

### Verification

- `xcodebuild -project ios/iTu.xcodeproj -scheme iTu -sdk iphonesimulator
  -configuration Debug -derivedDataPath /tmp/itu-ios-dd-notifications
  build-for-testing` passed.
- Added a focused permission-state XCTest contract.
- `git diff --check` passed; the static iPhone-only scan still finds no iPad
  target-family, split-view, or size-class references under `ios/`.

### Unfinished

- Validate notification permission, background delivery, Focus completion
  delivery, and server reminder reconciliation on a provisioned physical
  iPhone. Simulator coverage does not prove lock-screen delivery.

## Follow-up: task and habit App Intents

### Completed

- Added `CreateTaskIntent` and `CompleteTaskIntent`.
- Added `CompleteHabitIntent` and `IncrementHabitIntent`.
- Routed each intent through `IOSAppProcessRegistry` into the existing
  local-first `AppModel` and `OfflineStore` mutations.
- Added an offline XCTest covering task creation/completion, habit increments,
  and habit outbox persistence.

### Verification

- iPhone simulator `build-for-testing` passed with App Intents metadata
  processing.
- `testTaskAndHabitIntentsUseLocalFirstMutations` passed.
- `git diff --check` passed.

### Unfinished

- Validate Shortcuts/Siri discovery and execution on a provisioned physical
  iPhone after app termination.

## Follow-up: HealthKit background refresh reliability

### Completed

- Registered the `BGAppRefreshTask` identifier from `iTuApp.init()` before the
  first scene is created.
- Changed the background handler to await the account-scoped HealthKit import
  before calling `setTaskCompleted`.
- Connected task expiration to cancellation of the in-flight import.

### Verification

- iPhone simulator `build-for-testing` passed after the lifecycle change.
- Existing HealthKit normalization, anchor, and date-boundary tests remain in
  the test target.
- `git diff --check` passed.

### Unfinished

- Validate observer delivery, background refresh scheduling, and HealthKit
  permission behavior on a provisioned physical iPhone.
- The connected iPhone currently cannot run tests because Xcode reports that
  its developer disk image cannot be mounted.

## Follow-up: Screen Time report aggregation correctness

### Completed

- Fixed Device Activity report aggregation keys to include the actual local
  date, hour, bundle identifier, and hostname values instead of literal source
  text.
- Fixed the Growth Reset action label and temporary test paths that had the
  same interpolation typo.

### Verification

- Screen Time normalization and replacement tests passed.
- iPhone target build passed after the report-extension change.
- `git diff --check` passed.

### Unfinished

- Confirm multi-hour, multi-app, and multi-domain attribution from a real
  provisioned iPhone report extension.
- The physical-device SDK build is currently blocked by missing development
  profiles for the app and extensions; installing profiles requires explicit
  Apple account/provisioning access.

## Follow-up: HealthKit sync contract and ExtensionKit packaging

### Completed

- Verified the HealthKit summary/workout outbox contract against the Prisma
  schema and sync persistence implementation.
- Verified review-context health aggregation and cross-device deduplication.
- Added Swift 6 `@retroactive` annotations to the iPhone and macOS sync
  adapters.
- Removed duplicate Device Activity report metadata and embedded the report
  extension in `iTu.app/Extensions` instead of `PlugIns`.

### Verification

- `swift test` passed: 46 tests.
- API Prisma validation, typecheck, build, and full Jest passed: 83 suites,
  406 tests.
- iPhone simulator `build-for-testing` passed, with the report bundle at
  `iTu.app/Extensions/iTuDeviceActivityReport.appex`.

### Unfinished

- The full iPhone simulator XCTest run reached test-session startup but stalled
  in the local simulator test service and was interrupted.
- Authenticated backend/AI flows and physical-device validation remain blocked
  by the connected iPhone's developer disk image and missing provisioning
  profiles.

## Follow-up: macOS parity after shared-core extraction

- Built the macOS app with the extracted `iTuCore` package using normal Apple
  Development signing.
- Focused `JournalParityTests`, `OfflineStoreTests`, and `SyncCoordinatorTests`
  all passed.
- The isolated `UsageTrackingTests` target passed all 26 cases.
- The broader macOS result bundle recorded 330/331 passing in serial mode;
  the one stale-account inverted expectation passed in isolation. Parallel
  full-suite UsageTracking failures are test-harness interference, and no
  production tracker change was made.
- Updated `plan/ios-iphone-only.md` to mark the local macOS parity gate complete.
- Remaining gaps are physical-iPhone validation and authenticated backend/AI
  acceptance; no local implementation blocker was found in this phase.

## Follow-up: iPhone cold-start actions and simulator acceptance

- Added the missing Calendar link to the iPhone `More` workspace list.
- Made Focus App Intents restore the cached account and offline snapshot before
  mutating state when a Live Activity launches a cold app process.
- Fixed daily and weekly review saves to persist under their generated journal
  note identifiers.
- Corrected the task mutation test to match intentional consecutive-update
  outbox coalescing.
- Focused iPhone simulator tests passed for all three fixes.
- Full iPhone simulator XCTest suite passed: 54/54 tests.
- Shared `iTuCore` package tests passed: 46 tests.
- API Prisma validation, typecheck, build, and full Jest suite passed: 83
  suites, 406 tests.
- Focused macOS JournalParity, OfflineStore, and SyncCoordinator tests passed;
  isolated UsageTracking passed all 26 tests.
- `git diff --check` passed; the iPhone source/configuration scan found no iPad
  navigation or device-family support.
- The connected iPhone is paired and available, and all iPhone targets use
  `TARGETED_DEVICE_FAMILY = 1`.
- A normally signed device build reached the paired device but stopped with
  `The developer disk image could not be mounted on this device` (exit 70).
  The device is an iPhone 13 on iOS 26.3.1; the host is Xcode 26.3.
- A generic physical-device build independently confirms that the app and all
  three extensions need development provisioning profiles.
- The local signing audit found no valid code-signing identities or mobile
  provisioning profiles. Remaining gaps are resolving the device-image state,
  provisioning the app/extensions through the Apple account, and running
  authenticated backend/AI acceptance with an explicitly authorized account.

## Follow-up: optional EventKit calendar overlay

- Added `IOSEventKitCalendar` as an iPhone-only, read-only EventKit service.
- iOS 17+ requests full event access; older supported iOS versions use the
  legacy event-access request.
- Added current and legacy calendar usage descriptions to `iTu-Info.plist` and
  linked `EventKit.framework` in the iPhone target.
- The Calendar screen now shows Apple Calendar events in a separate section
  without changing the existing iTu task timeline or offline model.
- Denied, restricted, and write-only access states are explicit; write-only
  access never enables reads.
- Full iPhone simulator XCTest suite passed: 55/55 tests.
- iPhone build-for-testing passed after the EventKit integration.
- `git diff --check` passed.

### Unfinished

- Calendar permission prompts and real event attribution remain physical-device
  acceptance work alongside the existing signing and authenticated backend/AI
  gates.

## Follow-up: Screen Time Focus blocking

- Added `IOSFocusBlockingService` using account-scoped, App Group-persisted
  `FamilyActivitySelection` values.
- Added the native Family Activity Picker to Settings and linked its selection
  to the existing Screen Time authorization state.
- Applied `ManagedSettingsStore` app/category/web-domain shields from the
  existing `AppModel.apply` Focus state path. Shields only apply while Focus is
  active and clear on pause, finish, account switch, and logout.
- No background loop or extra server contract was introduced.
- Fixed and covered the edge case where the first target is selected during an
  already-active Focus session.
- Full iPhone simulator XCTest suite passed: 57/57 tests.
- iPhone build-for-testing and `git diff --check` passed.

### Unfinished

- Real Family Activity Picker selection and physical shield enforcement still
  require the provisioned iPhone acceptance run.

## Follow-up: iOS 18 Control Center Focus control

- Added an iOS 18+ `ControlWidget` to the existing iTu widget extension.
- The control invokes `StartFocusIntent`, reusing the same local-first Focus
  mutation path as the app, widgets, and Live Activity actions.
- Kept it conditionally available for earlier supported iOS versions.
- iPhone build-for-testing passed.
- Full iPhone simulator XCTest run passed on the available iPhone destination.
- `git diff --check` passed.

### Unfinished

- Control Center registration and action execution remain physical-device
  acceptance work alongside the existing signing and backend/AI gates.

## Follow-up: opt-in HealthKit Gym workout write-back

- Added optional `Save to Apple Health` to completed Gym workout history.
- HealthKit authorization now requests workout sharing alongside existing read
  access.
- Exported workouts use a stable `com.itu.gymWorkoutID` metadata key, so
  retries are idempotent and the importer excludes iTu-owned workouts.
- Added `NSHealthUpdateUsageDescription` and updated permission copy.
- iPhone build-for-testing passed.
- Full iPhone simulator XCTest run passed on the available iPhone destination.
- `git diff --check` passed.

### Unfinished

- Real HealthKit permission, save, duplicate retry, and Apple Health display
  remain physical-device acceptance work.
