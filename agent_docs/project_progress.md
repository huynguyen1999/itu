# Project Progress

## Active deployment: deep Sync modules and cross-client reliability parity

- Web and macOS keep their existing feature-facing interfaces while synchronization lifecycle, retry, conflict, device, WebSocket, and reconciliation behavior moves behind one deep platform module.
- Web remains the behavioral reference; macOS gains matching foreground-session reliability and a separate atomic Account hydration module. Direct feature reads and server wire contracts remain unchanged.
- Canonical JSON contract fixtures cover queued mutations, push/pull responses, conflicts, invalidations, and Growth outcomes across API, Web, and macOS tests.
- Work is split into disjoint Web and macOS executor packages. The main agent owns shared fixtures, integration, durable documentation, and final proof. Existing staged and unstaged work in all repositories must remain preserved.
- Acceptance requires focused Sync and hydration coverage plus the applicable API, Web, and macOS verification gates. The known local Observation macro plugin failure must be reported honestly if it still blocks macOS tests.

### Current implementation state and blockers

- API canonical fixture and DTO proof are implemented. API typecheck, 45 suites / 180 tests, and build pass.
- Web Sync orchestration is deepened behind one interface and the full Web gate passed before the final repair. Focused verification now passes 55 tests plus typecheck, but independent review still rejects stale-session safety in Growth-mapping cleanup, cross-tab responses, and authentication changes during asynchronous response listeners.
- macOS foreground Sync reliability, centralized outbox scheduling, atomic Account hydration, pending-mutation replay, session generation, device registration, retry scheduling, cursor invalidation, and status-only rebase are implemented. Swift parsing passes and test regressions were added. Xcode compilation is blocked only by the existing malformed Observation macro response after the latest repair.
- Independent macOS review still rejects lifecycle cancellation: an untracked device-registration task and urgent/debounce closures can race with stop or User Account switching and start old-session work.
- Both executor/tester repair loops reached the three-iteration workflow limit. Further production repair requires an explicit continuation decision. Web/macOS fixture copies, final integration verification, and durable completion documentation remain pending.

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
