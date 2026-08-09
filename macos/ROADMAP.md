# iTu macOS Roadmap

The detailed running-app parity audit is documented in
[PARITY_AUDIT.md](./PARITY_AUDIT.md). Its Phase 0 findings take priority over
new feature work because several existing controls currently display fixed data
or persist a different result than their labels promise.

## Current Plan interaction contract — 2026-08-02

This is the authoritative native behavior for `TaskListView.TaskRow`:

- Primary-clicking anywhere in the task row opens `TaskEditorView`, except for
  the status control and the overflow actions control.
- The status icon is the only primary-click control that changes task status.
- Secondary-clicking the row opens `TaskContextMenuPopoverView` through
  `RightClickDetector`, anchored at the mouse pointer; do not add a competing
  system `.contextMenu` to the row.
- Any change to these click paths must update this contract and include a
  focused interaction verification before being marked complete.
- Hovering the task row, status control, and overflow control uses the macOS
  pointing-hand cursor, matching the web task item's `cursor: pointer` behavior.
- Native auth persists the API-issued refresh token and removes an invalid
  session instead of allowing reconciliation to retry with stale credentials.

Current implementation guardrail: the row contains SwiftUI `Button`s, so a
background AppKit interceptor must return `nil` from `hitTest` and return every
monitored event unchanged. `RightClickDetector` uses a window-local AppKit
`rightMouseDown` monitor scoped to its row bounds, without depending on hover;
it must not steal the status button's physical mouse click. Right-click passes
the original event's window-local point to the popover presenter, which converts
it once into the content view coordinate space; the overflow button retains its
screen-point anchor. The popover presenter may use a zero-size, non-hit-testing
AppKit host only to present `NSPopover` at the captured pointer location. Status
changes are applied to the in-memory task list before persistence so Planned →
In Progress is immediately visible.

## Task Growth details contract — 2026-08-02

- Task Growth Rewards come from `/growth/earning-rules?sourceType=TASK` and are
  cached by task ID in the native offline snapshot.
- Task rows show the same compact reward groups as the web client: XP grouped
  by amount, coin rewards, and item quantities.
- The task editor always includes a Growth rewards section, showing configured
  completion rewards or an explicit no-rewards state. Opening the editor
  refreshes that task's rule while retaining the cached value offline.
- This native parity work is display-only; Growth rule editing remains a
  separate follow-up and must use the existing sync queue before any POST is
  added to the macOS client.

## Growth XP parity correction — 2026-08-02

- [x] Keep total XP and level-relative XP separate in the native Growth
  models, matching the web client’s use of `progressXp`/`requiredXp` for
  progress bars and “to next level” labels.
- [x] Preserve backward-compatible fallbacks for previously cached snapshots.

## Planning sync correction — 2026-08-01

- [x] Decode the paginated `/productivity/tasks` response and load every task
  page instead of silently retaining the cached task snapshot.
- [x] Reconcile the cached task collection against the authoritative server
  task set while preserving pending local mutations.
- [x] Keep assigned and `IN_PROGRESS` tasks visible in the native Plan “All
  Tasks” view so selecting Active/In Progress does not make the task appear to
  disappear.
- [x] Display the same human-readable status labels as the web client.

Verification coverage includes cursor-page decoding and the Plan visibility
regression for an assigned in-progress task.

- [x] Make a normal click on task content open the update modal, while the
  right-click interaction opens the web-style quick-actions modal and the
  explicit status control remains available.

## Continuation checkpoint — 2026-07-31

Resume from the first unchecked item in **Immediate next sequence**. Do not
repeat the completed task or Focus foundation audits unless the web contracts
have changed.

Current verified baseline:

- The native task workflow is truthful and offline-first for creation, exact
  status changes, edits, deletion, subtasks, Home capture, and Matrix presets.
- Pending task edits survive stale pulls.
- Home, Habits, Growth, Learn, and Statistics no longer present fabricated
  account data or sample fallbacks, presenting truthful empty states matching web client behavior.
- Common buttons and primary navigation have disabled, hover, pressed, cursor,
  and Reduce Motion behavior.
- Focus has typed native models, per-account persistence, backward-compatible
  snapshot decoding, server reads, and offline sync mutations for:
  - start;
  - pause and resume;
  - extend by five minutes;
  - complete and abandon;
  - task attach and detach;
  - history start/end/task adjustment.
- Focus active state is shared by the Focus page, Home, menu-bar window, and
  menu-bar icon. It is projected from server timestamps and survives restart.
- Focus history is real account data with date search, collapse/expand,
  progressive earlier-day reveal, short-session combining, hover edit controls,
  validation, and an idle 1–180 minute duration editor.
- The fake native audio player and fabricated Focus history were removed.

Verification baseline:

- `xcodebuild -project iTu.xcodeproj -scheme iTu -configuration Debug
  -destination 'platform=macOS' -derivedDataPath build/DerivedData test`
- Result on 2026-07-31: **13 tests passed**.

- Coverage includes legacy snapshot migration, Focus restart persistence,
  pending Focus action protection against stale pulls, pause-aware timer
  projection, task persistence/sync behavior, ULID compatibility, and default
  planning layout.
- One unrelated compiler warning remains in `TaskEditorView.swift`: a redundant
  nil-coalescing fallback on non-optional `descriptionMarkdown`.
- Real-app visual/pointer QA is still pending because the Mac was locked during
  the inspection attempt.

Important server constraints already verified:

- Focus writes must continue through the sync outbox
  (`focussession.create`, `focussession.action`, and
  `focussession.adjust`). Do not switch native writes to the direct Focus REST
  actions: those routes currently do not provide the same version,
  idempotency, attach, or conflict guarantees.
- The Focus summary endpoint currently returns
  `totalSessions`, `completedSessions`, `completionRate`, and
  `totalFocusedMinutes`. The native compatibility decoder normalizes that
  response; do not copy the stale web declaration.
- The sync create handler currently stores Focus phase as `WORK` even when a
  break tab is selected. Keep local tab state independent until the server and
  web contracts are corrected together.
- Focus history/summary are currently limited by the repository’s latest-50
  query, despite “Total” labels.

### Immediate next sequence

1. [ ] Unlock the Mac and visually inspect the built Focus page, task popover,
   custom-duration dialog, history hover/edit states, and menu-bar active and
   paused states. Fix clipping, focus order, cursor behavior, and visual drift
   found during real pointer testing.
2. [x] Implement native Focus settings persistence matching web defaults:
   30-minute work duration, overtime enabled, finish sound enabled, desktop
   notification enabled, and compact/full audio preference.
3. [x] Add overtime display: amber full ring and `+MM:SS` projection when
   enabled, with clamped display when disabled.
4. [x] Add notification permission/status handling and one local completion
   notification per session/cycle.
5. [x] Implement real Focus sound catalog/preferences and looping MP3 playback.
   Preserve download/loading/error/disabled states; never simulate playback.
   Uploaded-sound add/rename/delete management remains a separate unchecked
   follow-up.
6. [ ] Add focused tests for overtime, completion-event deduplication,
   notification gating, exact Focus adjust payloads, and cross-device pulled
   active/paused/completed states.
7. [ ] Reconcile or document the web/API Focus summary and phase contract
   defects before treating cross-client totals and break phases as exact.
8. [ ] Continue with task-list/section/tag parity before starting another large
   domain, because planning navigation and task editing already depend on those
   entities.

## Shipped foundation

- [x] Native SwiftUI application and Xcode project.
- [x] Full-window and menu-bar scenes with shared observable state.
- [x] Focus-only menu-bar timer/progress controls and a local, reversible Focus Policy for selected applications and browser URL patterns.
- [x] Per-account atomic offline snapshot and mutation outbox.
- [x] Server-compatible ULID generation.
- [x] Cookie-backed authentication refresh with local cached-user access.
- [x] Push-then-pull synchronization.
- [x] WebSocket invalidation and periodic reconciliation.
- [x] Task creation, status changes, deletion, and conflict persistence.
- [x] Shared, persisted, sync-backed focus timer and quick capture.
- [x] Offline persistence unit tests.
- [x] Native macOS adaptation of the web app’s navigation, color, spacing, task-row, focus, authentication, and menu-bar visual language.

## Next: productivity parity

### Verified parity slice — 2026-08-01

- [x] Align native macOS Focus view with web client (`FocusPage.tsx` & `FocusAudioPlayer.tsx`): dark glassmorphic sound player card, compact audio pill, sentence case mode tabs (`Focus`, `Short break`, `Long break`), ISO8601 date parsing for fractional seconds, date formatting (`Aug 1, 2026 Today`), density bars, and combined short sessions summary.
- [x] Wire task-list selection through the Planning rail and quick capture.
- [x] Add Matrix search, priority filtering, visibility controls, and web-aligned filter popover presentation.
- [x] Make Statistics’ 7-day, 30-day, and all-time selectors affect the chart.
- [x] Honor the configured appearance mode in the main workspace.
- [x] Add Focus overtime and preference controls, plus manual conflict rebasing.
- [x] Load the seven-day Habits occurrence range and render per-day completion
  state with optimistic check-in and undo interactions.
- [x] Route habit occurrence skip/fail/undo actions through the sync outbox.
- [x] Persist habit occurrence state and target values across offline reloads.
- [x] Connect Profile username/display-name editing and password changes to the
  authenticated API.
- [x] Add native JSON export and a confirmed account-deletion flow.
- [x] Replace fabricated Growth skill upgrades with web-aligned skill editing
  through the offline sync outbox.
- [x] Replace Home’s fabricated level, XP, attribute radar, and review values
  with authenticated Growth/attribute data and loaded deck due counts.
- [x] Hydrate Learn decks/cards from the API cursor pages and due queue.
- [x] Route deck creation, review grading, and session completion through the
  offline sync outbox with persisted cards and reverse-review direction.
- [x] Add Learn deck detail with card create/edit/archive interactions,
  including a right-click card context menu and optimistic card mutations.
- [x] Add server-backed task-list create/edit/archive interactions, including a
  New List form, list selection, and a right-click archive action.
- [x] Load task tags and sections and add interactive Section/tag assignment
  controls to the native task editor with versioned offline mutations.
- [x] Load Growth rewards, inventory, and ledger entries; add Shop/Inventory
  search and sync-backed reward redemption.
- [x] Extend Habits management with target/unit, build/limit direction, schedule
  metadata, and archive/restore interactions through `habit.update`.
- [x] Align the native Habits page hierarchy with the web client while retaining
  native sheets and context-menu interactions.
- [x] Add Learn Session History with server-backed session details, review
  breakdowns, saved feedback, selection, hover, and context-menu interactions.
- [x] Back Statistics with server study-calendar and Growth-statistics data;
  refresh 7/30/365-day ranges and expose truthful loading/error states.
- [x] Add Statistics Custom From/To range controls with exact Growth date
  requests and selected-window calendar filtering.
- [x] Add server-backed Notifications inbox with unread badge, read/all-read,
  hover, click, and context-menu interactions.
- [x] Add task scheduled start/end and RRULE recurrence editing with
  versioned offline persistence and stale-pull replay.
- [x] Add task reminder creation to quick capture plus reminder badges and
  Today/Tomorrow/Next Week context-menu actions.
- [x] Add Growth profile settings for account base XP and reward preset with
  server-backed loading, offline persistence, and stale-pull replay.
- [x] Align Growth reset in Settings with the web preview/typed-confirmation
  flow and server-backed idempotent execution.
- [x] Add Growth reward-preset rule editing and Apply to Existing actions for
  Tasks, Habits, Focus, and Deck Reviews through the offline sync outbox.
- [x] Add Learn deck title/description search with no-match and clear-search
  interactions.

- [x] Add task editing for titles, descriptions, due dates, priorities, importance, and estimates.
- [x] Add planning and task-matrix interfaces (List View & Eisenhower Matrix 2x2 grid).
- [x] Redesign Home Overview, Planning, and Focus Studio following the web app’s Botanical Sanctuary visual language.
- [x] Replace fixed Home Growth, habit, learning, and focus metrics with server-backed data or truthful unavailable states.
- [x] Separate the Home destination from the Today planning smart list.
- [x] Fix task status editing so every selected status is persisted exactly.
- [x] Fix subtask creation so `parentId` is persisted and synced.
- [x] Preserve all fields captured by Home quick capture, including notes.
- [x] Replace presentation-only Habits, Growth, Learn, and Statistics sample
  data with truthful unavailable states until repositories exist.
- [x] Remove or hide list/tag, section, print, custom-date, move-to-list, and
  task-XP controls that did not perform their displayed action.
- [x] Make Matrix quick creation atomic with web-equivalent
  `important`/`urgentOverride` presets.
- [x] Preserve pending optimistic task edits when a stale server pull arrives.
- [x] Standardize shared disabled, hover, pressed, cursor, and Reduce Motion
  behavior for the common macOS button styles and primary navigation rail.
- [x] Sync Focus active-session lifecycle, task linking, history, and summaries
  with the server-backed offline outbox.
- [x] Add Focus custom duration plus editable, searchable, collapsible,
  progressively revealed, short-session-combining history interactions.
- [x] Add Focus preset management, overtime settings, notifications, and complete settings parity.
- [x] Implement real ambient audio playback (`AudioPlayerManager` with AVFoundation) and sound selection.
- [x] Add Next 7 Days (`UpcomingView`), task ordering, undo, and recoverable task trash (`TrashView`).
- [x] Add habits (`HabitsView`), habit occurrences, check-ins, and habit statistics.
- [x] Add decks, cards, and spaced repetition flashcard review sessions (`LearnView`).
- [x] Add growth (Attributes, Skills, Shop/Rewards, Ledger), analytics charts (`StatisticsView`), trash, and profile account management (`ProfileView`).
- [x] Add manual “keep mine” conflict rebasing.
- [x] Route notification `actionUrl` clicks to native destinations while preserving an unknown-path fallback.
- [x] Add permission-aware macOS notification controls and one-shot Focus completion delivery.
- [x] Add server-backed deck/card Trash sections with restore and confirmed permanent-delete interactions.
- [x] Render server-returned trashed tasks in native Trash and support restore/permanent-delete actions when the task is not cached locally.
- [x] Add pending mutation recovery actions to the native Conflicts surface.
- [x] Add persistent Learn workspace navigation for decks, review, and history.
- [x] Add persisted Matrix sorting choices for due date, priority, title, and manual order.
- [x] Add pre-reveal recall answer entry to native Learn review.
- [x] Connect Focus ambient audio playback, track selection, and volume controls.
- [x] Add notification reminder snooze and dismiss context actions.
- [x] Add reversible deck archive from the Learn card context menu.
- [x] Add left-click Habit details with server-backed streak and success statistics.
- [x] Match Profile's read-only account email field and explanation.
- [x] Load habit time blocks, assign them in the editor, and group habits in collapsible sections.
- [x] Add Habits collapse/expand-all and server-backed habit-group management controls.
- [x] Add Statistics trend cards and attribute experience distribution from server data.
- [x] Add Growth shop category filters and filtered empty-state behavior.
- [x] Add clickable rail sync status with recovery popover actions.
- [x] Add server-backed Habit tag decoding, tag-chip selection, and offline mutation payloads.
- [x] Align native Inbox, Today, Upcoming, and Completed task membership with the web filters.

## Backend enablement

- [x] Add `MACOS` to `SyncDevicePlatform` with an additive Prisma migration.
- [ ] Register macOS devices before WebSocket connection and add APNs tokens after the backend accepts the platform.
- [ ] Add a native Google OAuth callback and handoff.
- [ ] Replace access tokens in WebSocket query strings with short-lived connection tickets.

## Native integrations

- [ ] Notifications and reminders.
- [x] Optional Launch at Login.
- [x] Local foreground-application usage tracking.
- [x] Edge-first URL-level website usage tracking from the Chromium extension to the backend through a rotatable DSN key.
- [x] User-controlled retention and deletion of usage history.
- [ ] Browser-extension-based website blocking.
- [ ] Evaluate Network Extension filtering after distribution entitlement approval.
- [ ] Treat Endpoint Security application blocking as a separately entitled project.

### Foreground usage deployment — 2026-08-09

Tracking is explicit opt-in and off by default. It continues while the frontmost
application is idle and excludes locked, sleeping, or screen-off intervals; local per-app daily
totals are stored and synced as device/day/app summaries through authenticated
dedicated usage endpoints. macOS Statistics and Settings expose totals, top
apps, trends, pause, 7–365-day retention, and confirmed range/all deletion.

Verification: signed Debug build and the full test suite passed, including
focused `UsageTrackingTests` (9/9); the former Observation macro environment
blocker did not recur.

### Chromium Browser Integration core — 2026-08-09

The dependency-free Manifest V3 extension sends cumulative URL-level summaries
directly to the backend through a rotatable, hash-only DSN credential. Normal and
InPrivate activity is grouped by hostname in Statistics with URL drill-down; privileged schemes are excluded. The
extension no longer requests or uses native messaging; the native host target
remains only for compatibility. Extension tests (6/6), API tests (53 suites/216 tests), web tests (35 files/179
tests), and production builds pass. Migration deployment and live Edge acceptance
remain.

### Budget, Gym, and Journal parity deployment handoff — 2026-08-10

The implementation slice is complete; deployment verification remains open.
This is not a production-deployment claim.

- [x] Keep Budget Transactions and Gym Workouts in standalone storage and
  application boundaries rather than Journal persistence.
- [x] Support Gym `IN_PROGRESS`/`COMPLETED`, active-to-completed transitions,
  and direct historical completed creation while another Workout is active.
- [x] Match Web and macOS offline-first outbox/SYNC behavior for Budget, Gym,
  and retained Journal Notes/Weekly Reviews, including restart/reconnect
  reconciliation and visible conflicts.
- [x] Retain Journal Tags, Templates, Attachments, Revisions, Trash, and
  read-only Budget/Gym summary snapshots; remove Journal Expense/Workout
  contracts.
- [x] Queue optional Gym images without deleting the prior image before a
  replacement upload succeeds.
- [x] Render macOS Website Usage Summaries from server data plus pending local
  deltas.
- [x] Pass API and Web full typecheck, test, and production-build gates.
- [x] Pass all touched native Swift source parsing and diff checks; earlier
  signed native suites also passed. The post-repair signed gate remains open.

Remaining verification and environment work:

- [ ] Rerun the signed macOS focused/full gates after the final repair. The
  attempted rerun is blocked before compilation by GitHub DNS/package-cache
  permissions, not a reported source failure.
- [ ] Apply the separation migration in an approved local environment; the
  permission request was rejected, so it is not applied here.
- [ ] Complete manual two-device offline/reconnect and conflict acceptance;
  this acceptance has not yet been run.
- [x] Apply the guarded Journal development-data/media reset locally (7 entries,
  11 revisions, no media); do not run it against production data.
