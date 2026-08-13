# Project Progress

## Completed: Phase 1 Review Insights

- Added durable `DAILY_REVIEW` Journal entries, extended Weekly Review reflections/comparisons, sync/revision persistence, and an additive Prisma migration.
- Added deterministic, timezone-aware review aggregation across Tasks, Focus, Learning, Habits, Journal, Gym, Budget, app usage, and non-private website usage with coverage metadata, evidence IDs, and current-vs-immediately-previous-week comparison.
- Added structured Gemini Review Insights behind the existing `IAiProvider` and durable `AiJob`/RabbitMQ workflow, including prompt-injection resistance, evidence validation, stale source-version protection, stable failures, and preservation of previous successful results.
- Added Web Daily/Weekly Review reflection, comparison, AI generation, polling, stale/error states, and compact metrics; added corresponding macOS models, offline persistence, sync mapping, UI, and generation behavior.
- Verification: API 72 suites / 328 tests, typecheck, and build; Web 57 files / 309 tests, typecheck, and build. A signed macOS build/test passed before final replay hardening; the final native rerun is blocked by pre-existing Swift 6 compile errors in `AppPerformanceSignposts.swift` and `EisenhowerMatrixView.swift`. The additive review migration remains undeployed; live Gemini and authenticated visual/two-device acceptance remain deployment checks.

## Completed deployment: architecture drift remediation

- API Calendar orchestration now depends on typed repository and integration ports; Prisma, HTTP/SSRF, OAuth, crypto, ICS parsing, and scheduling live in infrastructure. Preferences and Journal persistence also use typed ports, while existing REST/OpenAPI behavior is preserved.
- Web `CalendarPage` is a thin composition root over focused data, interaction, and presentation modules. Sync responses and cleanup are account/lifecycle guarded, cross-tab messages are session-scoped, and Calendar projections invalidate with Task, Focus Session, and Calendar Subscription changes.
- macOS keeps the `AppModel` and `OfflineStore` façades while Budget, Gym, Notifications, and Trash responsibilities are split into focused extensions. Sync work is generation/account guarded and cursors cannot move backward.
- Canonical Calendar fixtures and architecture checks lock the cross-client semantics and dependency boundaries without adding dependencies, changing routes, deploying migrations, or editing CI.
- Final proof: API 70 suites / 315 tests, Web 56 files / 301 tests, and extension 11/11 pass; API/Web typechecks and builds pass; Prisma generate/validate pass; OpenAPI regeneration is byte-stable; architecture boundaries and Swift parsing pass.
- Signed macOS build/test remains environment-blocked before compilation by `KeyboardShortcuts` DNS and sandboxed cache permissions. This is the only unfinished verification item; no further refactor scope is open.

## Completed deployment: unified Calendar timeline

- Web and macOS now use a source-grouped row timeline for Tasks, Due Dates, Focus Sessions, and Calendar Subscription events, with an hourly Day axis and date-based Week/Month axes.
- Tasks retain editing, moving, resizing, and Arrange Tasks; Focus Sessions and Calendar Subscription events are read-only. All-day milestones, source colors, stable source ordering, keyboard controls, and responsive states are aligned across clients.
- Server-backed `CalendarPreferences` sync Day/Week/Month zoom, visible item kinds, completed visibility, and collapsed source groups through the existing offline Sync path. Sync input is validated and remote nested preference changes are applied correctly on both clients.
- Verification passed: API focused Calendar/preferences/Sync tests and typecheck; Web full 50-file/238-test gate, typecheck, production build, 35 final focused tests, and a clean Impeccable detector; signed macOS build plus focused CalendarParityTests 2/2; independent cross-client contract review found no remaining Calendar defects.
- The additive `20260812130000_calendar_preferences` migration remains undeployed. Browser visual QA was not run. The full signed macOS suite still has unrelated existing Usage Tracking, navigation parity, and Journal parity failures.

## Completed deployment: Website Activity session history

- The Chromium extension now stores indefinite local Website Activity Sessions in IndexedDB, incrementally maintains daily URL/domain projections, migrates old `totals` as legacy aggregates without fabricated timestamps, and uses a durable session outbox.
- URL normalization removes credentials, queries, and fragments while retaining paths; sessions preserve page title and Private state. The popup remains Today-first and the local dashboard provides preset/custom ranges, adaptive trends, domain composition, domain-to-URL-to-session detail, search/privacy/sync diagnostics, and local-only range/clear/reset actions.
- The API provides DSN-authenticated, partially acknowledged session ingestion plus authenticated statistics/session reads. Stable checkpoint retries update one owned row, range aggregation uses each session's timezone, and title/Private metadata is available to Web and macOS Statistics.
- Transient uploads stop after the initial request plus three exponential retries. FAILED rows wait for an online/user signal; permanent rejections and configuration failures are not restarted by connectivity recovery.
- Verification passed: extension 11/11 tests; API Prisma generate/validate, typecheck, build, and 59 suites / 254 tests; Web typecheck, 43 files / 207 tests, and production build; signed macOS Debug build and focused API/Statistics 13/13 tests. The full signed macOS suite remains blocked by three pre-existing failures recorded in `latest_session_work.md`.
- Additive migrations `20260811120000_website_activity_sessions` and `20260811130000_website_activity_session_contract` remain undeployed.

## Implementation complete: Statistics, navigation, Trash, Budget, and Gym

- Canonical plan: [`plans/statistics-navigation-trash-budget-gym.md`](../plans/statistics-navigation-trash-budget-gym.md), derived from the user-approved 5C implementation brief.
- Durable checkpoint: [`agent_docs/statistics_navigation_trash_budget_gym_done_state.md`](statistics_navigation_trash_budget_gym_done_state.md). Resume there instead of reconstructing this session.
- Completed `USAGE-FOUNDATION`: app-only legacy rows without engagement and their native watermarks are cleaned, `engagedSeconds` is uploaded and validated, app/website usage flushes through the shared ~120-second path plus lifecycle triggers, and focused/full API and signed macOS gates passed. The cleanup migration remains undeployed.
- Completed `STATISTICS-WEB`: Engaged Time copy/coverage accessibility, a top-domain donut with `Other`, keyboard selection, and paginated URL drilldown passed focused/full Web tests, typecheck, build, and independent design review. Authenticated visual QA remains unavailable in the sandbox.
- Completed `APP-IDENTITY`: the API stores user-scoped app identities and processed icon media; macOS hashes and uploads deterministic 64×64 PNGs with account-safe retry/coalescing; Web renders authenticated icons with the existing fallback. API, Web, and signed focused macOS verification passed; the additive identity migration remains undeployed.
- Completed `NAV-PARITY`: Web and macOS now share the exact four-group primary navigation order, real Web Conflicts/Notifications destinations, canonical mobile reachability, native Plan-to-Inbox mapping, and drift-detecting parity tests. Web full gates and signed native parity tests passed.
- Completed `STATISTICS-MACOS`: a native gear popover persists local display controls and hydrates/syncs tracking preferences (including idle threshold and exclusions), Statistics honors visibility/top-N/density settings, and account changes rebuild usage trackers safely. API preference tests/build and signed focused macOS settings/client tests passed; the existing usage restart timing test remains flaky.
- Completed `GLOBAL-TRASH`: the additive API contract, Web, and macOS now unify Task, Journal, Budget Transaction, Gym Workout, and user-owned Exercise tombstones behind the global Trash filters, queued restores, and confirmed permanent deletion. Journal-local Trash navigation is removed; stale restore versions are rejected; native server Trash rows persist across offline restarts. The additive migration remains undeployed.
- Completed `JOURNAL-STYLE`: shared token language, responsive Web inspector/editor behavior, accessible controls, and native surface/radius normalization without changing Journal Sync behavior.
- Completed `BUDGET-PARITY`: native Overview/Transactions/Budgets/Calendar/Categories parity plus current-period hydration and restart-safe optimistic replay.
- Completed Gym Phases 10–22: live logger UX, granular field-clock Sync, restart/reconnect-safe optimistic children, compatible compaction, completion/reopen, settings/units/timers, history, and progress on Web and macOS.
- Phase 23 remains an explicit product exclusion: no Routine system, HealthKit, or watchOS was introduced.
- Final gates passed for API (63 suites / 273 tests, typecheck, build), Web (47 files / 221 tests, typecheck, build, detector), and signed focused macOS Budget/Gym + OfflineStore tests. Production release still requires the undeployed migrations and manual authenticated two-device/visual acceptance recorded in the durable checkpoint.

## Implementation complete: offline-first Budget, Gym, and Journal parity

- Canonical plan: [`plans/macos-budget-gym-journal-parity.md`](../plans/macos-budget-gym-journal-parity.md).
- Budget Transactions, Gym Workouts, and Journal now have separate persistence, application, REST, and Sync boundaries. Journal is limited to Notes and Weekly Reviews; Tags, Templates, Attachments, Revisions, and Trash remain supported.
- Web and macOS implement the retained feature union through durable optimistic outboxes, including active-to-completed and direct-completed Gym Workouts, optional durable Exercise image uploads, Journal attachment deletion, and revision restore.
- Money remains decimal-string/Prisma Decimal end to end, and Budget/Journal calendar boundaries use `Asia/Ho_Chi_Minh`.
- macOS Website Usage Summaries now use the correct batch upload endpoint and render server values merged with pending local deltas.
- Verification passed for API (56 suites / 227 tests, Prisma generate/validate, typecheck, build), Web (43 files / 206 tests, typecheck, build), native Swift parsing, independent parity review, and whitespace checks.
- Deployment verification remains open: the post-repair signed macOS build/test could not resolve `KeyboardShortcuts` because GitHub DNS/cache access was unavailable; the local separation migration was not applied after its permission request was rejected; manual two-device conflict acceptance remains unrun. The guarded local Journal reset removed 7 entries and 11 revisions and found no Journal media.

## Completed deployment: Chromium Browser Integration core

- Added one dependency-free Manifest V3 extension under `extension/`, with an explicit local opt-in, hostname-only **Browser Activity**, incognito and non-HTTP(S) exclusion, active-tab/window reconciliation, heartbeat, deduplication, and bounded reconnect behavior.
- Added the signed `BrowserActivityHost` target, exact Edge native-messaging manifest installer, 16 KB framed-message boundary, strict protocol/browser/hostname/incognito validation, atomic App Group state, and clean disconnect state.
- Added `WebsiteUsageTracker`, local **Website Usage Summary** persistence and upload watermarks, foreground/session/freshness guards, midnight/restart handling, shared retention, and range/all deletion without changing foreground-application totals.
- Added authenticated `/usage/websites/summaries` GET, batch POST, and DELETE endpoints; owned macOS Sync Device enforcement; both-opt-in gating; concurrency-safe composite upserts; aggregation; retention cleanup; and an additive migration.
- Verification passed: extension 6/6 tests; API Prisma validation, typecheck, build, and 52 suites / 211 tests; signed macOS Debug build and final 187/187 tests; native active/inactive and rejection boundary proofs; scoped whitespace checks.
- The migration was not deployed and live Edge-to-host acceptance was not exercised. Website charts/read UI and Browser Integration status/install UI remain follow-up scope; existing staged and unstaged work and Git state were preserved.

## Completed deployment: macOS foreground usage monitoring

- Added explicit opt-in macOS foreground-app tracking, off by default, which continues while the frontmost application is idle and excludes lock, sleep, and screen-off periods.
- Added local daily per-app summaries, 15-minute changed-summary uploads, immediate day-rollover upload, retry scheduling, and 7–365-day local retention and deletion controls.
- Added the `MACOS` Sync Device platform, authenticated usage summary endpoints, concurrency-safe device/day/app upserts, account ownership isolation, cross-device aggregation, and scheduled retention cleanup.
- Added macOS and web Statistics totals, top apps, daily trends, and loading/error/empty states plus Settings controls for retention and confirmed range/all deletion. Pause and native Launch at Login remain macOS-local controls.
- Verification passed: API typecheck, build, Prisma generate/validate, full 52-suite/204-test gate and focused 3-suite/16-test usage gate; web typecheck, build, full 34-file/178-test gate and focused settings/statistics tests; signed macOS Debug build, full test gate, and focused `UsageTrackingTests` 9/9.
- Regenerated the API OpenAPI contract and updated the macOS roadmap. The former Observation macro environment blocker did not recur. Existing unrelated work and Git state were preserved; the additive migration was not deployed.

## Completed deployment: deep Sync modules and cross-client reliability parity

- Web and macOS keep their existing feature-facing interfaces while synchronization lifecycle, retry, conflict, device, WebSocket, and reconciliation behavior moves behind one deep platform module.
- Web remains the behavioral reference; macOS gains matching foreground-session reliability and a separate atomic Account hydration module. Direct feature reads and server wire contracts remain unchanged.
- Canonical JSON contract fixtures cover queued mutations, push/pull responses, conflicts, invalidations, and Growth outcomes across API, Web, and macOS tests.
- Work is split into disjoint Web and macOS executor packages. The main agent owns shared fixtures, integration, durable documentation, and final proof. Existing staged and unstaged work in all repositories must remain preserved.
- Acceptance requires focused Sync and hydration coverage plus the applicable API, Web, and macOS verification gates. The known local Observation macro plugin failure must be reported honestly if it still blocks macOS tests.

### Completion state

- Web stale-session cleanup, asynchronous response handling, startup refresh, and BroadcastChannel delivery are generation/session guarded; Calendar cache invalidation is complete.
- macOS registration, reconnect, periodic, debounce, urgent, upload, hydration, and response work is lifecycle-owned and generation/account guarded; cursor application is monotonic.
- Focused Sync regressions and the final full API/Web/extension gates pass. Signed macOS execution remains blocked only by the dependency/cache environment described above.

## Completed deployment: behavior-preserving structural refactor

- API production `core` no longer imports infrastructure adapters, Prisma client/transaction/input types, while generated business enums remain. The sync repository is a 527-line facade over focused mutation handlers; Focus persistence and Growth reset persistence are composed adapters.
- Web `shared` no longer imports features. `App` composes feature-owned Planning and Focus slots into `Layout`; Growth presentation/settings utilities are shared and `GrowthPage` is split into focused feature-local components.
- macOS `AppModel` and `OfflineStore` retain their complete method inventories while behavior is organized in feature-responsibility extensions. No public declarations were introduced.
- Verification: API typecheck, 45 suites / 179 tests, and build passed; web typecheck, 32 files / 170 tests, build, formatting, and diff checks passed; all macOS production and test Swift files parsed and diff checks passed.
- macOS full Xcode build/test remains environmentally blocked by the previously documented malformed Observation macro plugin response; no refactor-specific diagnostic was observed.
- Pre-existing staged and unstaged Growth work was preserved; no staging, commit, schema, migration, route, contract, or Git-state mutation was performed.

## Completed deployment: macOS frontend parity and interaction fixes

- Habit occurrences are directly clickable by day, Home includes today's scheduled habits, and Growth receipts dismiss after five seconds.
- Task metadata and rewards wrap at narrow widths; the Matrix has collapsed Completed and Won't do groups per quadrant without visibility settings; the editor is compact and adaptive.
- Home level content, Growth navigation/cards/ledger, Statistics ranges/cards/trends, and Learn navigation/grid now follow the inspected web hierarchy with native adaptive layouts.
- Verification: strict macOS Debug build passed; `VisualLayoutTests` passed 4/4, including the new narrow-width reward-wrap regression check.
- Deck import remained intentionally out of scope. Existing unrelated Focus-file whitespace warnings were preserved.

## Active deployment: Growth model improvement

The canonical plan is [`plans/growth-model-improvement.md`](../plans/growth-model-improvement.md). The session uses the Sub-agent route. Existing staged and unstaged work in `api/`, `web/`, and `macos/` remains protected; no staging, reset, commit, or push was performed.

### Verified completed packages

1. **Account XP foundation**
   - Independent `ACCOUNT_XP`, account base XP 75, one account award per activity lifecycle, and fixed-budget Skill XP allocation (maximum three skills).
   - Historical Account XP reconstruction and additive migrations.
   - Web and macOS contracts, optimistic/offline reconciliation, editors, receipts, and account-only overview parity.

2. **Attribute mappings and General archival**
   - General is system-archived and excluded from active choices while historical ledger data remains.
   - Weighted Skill-to-Attribute mappings, immutable mapping snapshots, derived Attribute XP, starter mapping routes, REST and sync support.
   - Web and macOS mapping editors and direct/derived Attribute labels.

3. **Earning-source parity**
   - Task and Habit lifecycle awards/reversals.
   - Focus Account XP uses valid duration: one XP per five minutes, capped at 15 per session; incomplete and abandoned time does not earn Growth.
   - Study Account XP uses reviewed-card count: one XP per two cards, capped at 20 per session and independent of correctness.
   - Direct and sync idempotency is shared for Focus, Habit, and Study; authoritative receipts persist across retries and lost responses.
   - API proof after this package: 41 suites / 162 tests, typecheck, build, Prisma generate/validate.
   - Web proof: 32 files / 165 tests, typecheck, build, and Impeccable detector `[]`.

4. **Habit commitment backend (default off)**
   - `COMMITMENT_FEATURE_ENABLED` gates all policy snapshot/evaluation behavior.
   - Habit-only Gentle and Standard policies, immutable occurrence snapshots, IANA/DST-safe grace and recovery, excuse/recovery reversal, Account-XP-only debt, protected levels, and debt caps.
   - On-time offline actions use `mutation.occurredAt` and are not penalized because of sync delay.
   - Cap-zero breaches, partial policy updates, feature-off behavior, REST/sync parity, migration backfill, and penalty idempotency are covered.
   - Independent proof: 43 suites / 174 tests, typecheck, build, Prisma generate/validate, and `git diff --check` passed.

5. **macOS earning implementation**
   - Stable Habit/Focus/Study keys, partial Habit pending behavior, receipt reconciliation/restart handling, and lifecycle tests are implemented.
   - `GrowthProgressAward` immutable initialization and `GrowthLedgerDTO.metadata` decoding defects were repaired.
   - Strict macOS Debug build succeeded after production fixes. Focused model/OfflineStore typecheck and all-file parse passed.

6. **Lifecycle-aware Growth receipts**
   - Award and reversal receipts now include deterministic `earned:` / `reverted:` keys derived from source and lifecycle ordinal.
   - Retry, reversal, re-earn, zero-Account-XP, and item-only lifecycles retain distinct exactly-once presentation keys.
   - Direct and sync Habit check-in, action, and checklist reversal paths persist and return the authoritative receipt.
   - API proof: 43 suites / 175 tests, typecheck, build, Prisma generate/validate, and focused 2 suites / 38 tests passed.

### Active blockers / interrupted work

- **macOS focused XCTest:** production Debug build succeeds, but the focused test command remains blocked in this environment by a malformed `ObservationMacros.ObservableMacro` plugin response and cascading SwiftUI diagnostics. Tester-owned compile issues were repaired; the new tests have not executed.
- **Web Habit commitment UI:** implementation was assigned but interrupted before evidence or verified edits. Current searches show no web commitment integration.

### Not started

- macOS Habit commitment UI/offline parity.
- Momentum (7-day/28-day adherence and recovery trend).
- Permanent recovery-oriented achievements.
- Balance simulations for light, regular, intensive, specialist, broad, missed-commitment, and returning-user profiles.

## Verification state

- API latest verified commitment gate: 43 suites / 174 tests; typecheck/build/Prisma generate/validate passed.
- Web latest verified earning gate: 32 files / 165 tests; typecheck/build passed; UI detector clean.
- macOS strict Debug build: passed after receipt-model fixes.
- macOS focused XCTest: not executed because of the Observation macro environment failure.

## Next action

1. Re-run the focused macOS receipt/restart tests when the Observation macro environment allows execution.
2. Implement and test the minimal web Habit commitment UI, then macOS parity.
3. Implement Momentum and permanent achievements, followed by deterministic balance simulations.
