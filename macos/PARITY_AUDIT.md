# iTu macOS ↔ Web Parity Audit

Audit date: 2026-07-31

## Implementation progress after the audit

Menu-bar Focus pass (2026-08-04): the menu-bar companion is now Focus-only,
can show remaining time or circular progress, and exposes the complete native
Focus Session lifecycle controls. Local settings can enable a Focus Policy that
hides selected applications and redirects matching tabs in supported browsers
only during an active work phase; pause, break, completion, abandonment, and
sign-out stop enforcement. Policy settings and URL data remain local to macOS.

Verified in source and by the macOS test suite on 2026-07-31:

- Home and Today are separate destinations.
- Exact task status transitions and `completedAt` clearing are persisted.
- Subtasks are created with `parentId`, and root planning views no longer render
  subtasks as top-level tasks.
- Home quick capture now exposes optional notes and priority controls and
  persists both fields.
- Matrix quick creation now writes `important` and `urgentOverride` atomically
  using the same quadrant presets as web; it no longer finds newly created
  tasks by duplicate-prone title.
- Pending optimistic task edits are replayed over stale pull data before the
  offline snapshot is persisted.
- Canceled tasks are grouped with completed / won’t-do tasks.
- Fabricated Home, Habits, Growth, Learn, and Statistics account data has been
  replaced by truthful unavailable states until native repositories exist.
- Presentation-only list/tag creation, fabricated task XP chips, fake custom
  dates, empty move-to-list actions, and no-op section/print actions are no
  longer exposed.
- Shared button and hover styles now honor disabled state and Reduce Motion,
  and the primary rail has hover and pressed feedback.
- Focus now uses the same versioned `focussession.create` and
  `focussession.action` sync mutations as web for start, pause, resume,
  extend, complete, abandon, and task attach/detach.
- Active Focus state and history are persisted in the per-account offline
  snapshot, survive restart, reconcile from sync pulls, and protect pending
  optimistic actions from stale server data.
- The Focus view, Home summary, menu-bar timer, and menu-bar icon now share the
  same timestamp-projected server session instead of separate local counters.
- The native Focus tabs now match web’s three modes, lock while a session
  exists, default Focus to 30 minutes, and expose the web lifecycle controls.
- Fabricated Focus audio playback and previous-day records were removed.
  History/search and today/total summary tiles now render account data; audio
  remains a truthful unavailable state until native playback is implemented.
- The idle timer opens a 1–180 minute duration editor; record days collapse,
  search by date, reveal edit actions on hover, combine sub-two-minute
  sessions, and progressively reveal earlier days.
- Focus record start/end/task edits are optimistic, versioned
  `focussession.adjust` mutations with the same invalid-time guard as web.

Verification evidence:

- `xcodebuild ... test`: 13 tests passed.
- Impeccable mechanical detector: no findings across the changed SwiftUI
  surfaces.
- Real-app screenshot inspection remains pending because the Mac was locked
  when Computer Use attempted to inspect the built application.

Latest parity pass (2026-08-01): Focus settings now persist the web defaults
(30-minute work duration, overtime, finish sound, desktop notification, and
compact audio preferences), older settings snapshots decode safely, and the
active timer renders web-style overtime with amber progress styling. Native
build compilation succeeded; the Xcode test runner could not complete in this
environment because the local macOS test launch service stalled after bundle
preparation.

Conflict parity pass (2026-08-01): the native Conflicts view now offers both
server and local resolution. “Keep mine” rebases the local draft on the
server version and re-enqueues it through the existing sync outbox rather than
discarding the mutation.

Habits parity pass (2026-08-01): native Habits now loads the web habit
occurrence range for the previous seven days, renders a seven-day completion
grid, and routes completion, undo, skip, and fail state through optimistic
`habitoccurrence.*` sync mutations. Occurrence state is persisted in the
account snapshot and is protected from stale pull replacement. Habit target
values and directions are retained in the native model and update payload.
Full web parity remains open for habit groups, schedules, targets UI,
checklists, reminders, archive/restore, detail statistics, and tags.

Verification evidence: full macOS `xcodebuild ... test` passed after this
slice, including `testHabitOccurrenceActionsPersistOptimistically`.

Profile parity pass (2026-08-01): the native Profile view now matches the web
account actions for username/display-name updates, password changes, JSON data
export, and confirmed account deletion. Network failures are surfaced in the
view instead of showing a fabricated success message. Export uses a native
save panel, while deletion remains user-confirmed and was not executed during
the audit.

Growth parity pass (2026-08-01): native Skills now follows the web behavior.
The misleading local-only “Upgrade” action was replaced with an Edit flow for
skill name, description, and icon. Changes use the existing
`growthskill.update` outbox mutation, server skill refreshes preserve the
edited fields, and stale pull data is rebased over pending edits. Skill levels
remain activity-earned rather than being fabricated by a button. Reward-shop
redemption and full Growth settings remain open.

Verification evidence: full macOS `xcodebuild ... test` passed, including
`testGrowthSkillEditPersistsThroughSyncOutbox`.

Home truthfulness pass (2026-08-01): Home now hydrates the authenticated Growth
account level and XP progress, loads live Growth attributes from
`/growth/attributes`, renders the radar from each attribute's current progress,
and derives the review count from the loaded deck due counts. Unavailable
metrics are shown as unavailable rather than as account-looking zeroes or
fabricated values. The updated Growth account and attributes are persisted in
the offline snapshot.

Verification evidence: macOS app and test bundle build succeeded; the full
macOS test suite passed (21 tests) after the Home pass. Runtime inspection of
the latest build confirmed live Home values, Growth navigation, the server
deck library, the New Deck form, and the truthful empty due-review state.

Planning task-list pass (2026-08-01): task lists now persist in the offline
snapshot, hydrate from `/productivity/task-lists`, reconcile through sync pull
changes, and support optimistic create/edit/archive mutations. The planning
rail now exposes a real New List form, list selection, edit actions, and a
right-click archive action; default Inbox cannot be archived.

Verification evidence: the macOS app and test bundle built successfully; the
full macOS test suite passed (22 tests), including
`testTaskListCrudUsesSyncOutboxAndPersistsOptimisticState`. Runtime inspection
confirmed the planning rail’s New List form and disabled empty-name validation.

Planning metadata pass (2026-08-01): native task metadata now loads task tags
and sections from the productivity API, persists the taxonomy and task tag
assignments in the offline snapshot, and sends `sectionId`/`tagIds` in the
existing versioned `task.update` sync mutation. Task editing now exposes a
Section picker and interactive tag chips with selected-state styling.

Verification evidence: the macOS app and test bundle built successfully; the
full macOS test suite passed (23 tests), including
`testTaskMetadataAssignmentPersistsSectionAndTagsInUpdateMutation`. Final
pointer QA was pending because the Mac locked while launching the latest build.

Growth Shop/Ledger pass (2026-08-01): native Growth now loads rewards,
inventory, and ledger entries from the Growth API. Shop and Inventory have
web-aligned segmented controls, search fields, empty states, reward cards, and
hover treatment. Reward redemption now updates coins/inventory optimistically
and enqueues `growthshopreward.redeem` for synchronization; ledger amounts
preserve positive and negative signs.

Verification evidence: the macOS app and test bundle built successfully; the
full macOS test suite passed (24 tests), including
`testGrowthRewardRedemptionUsesSyncOutboxAndUpdatesInventoryOptimistically`.
Runtime inspection confirmed the Shop, Inventory, search, and Ledger states.

Habits management pass (2026-08-01): native habits now retain target type,
target value, unit, build/limit direction, schedule type, weekdays, and archive
state. The New/Edit Habit sheet exposes target and direction controls, habit
cards expose hover and right-click actions, and archive/restore is routed
through the versioned `habit.update` sync mutation.

Verification evidence: the macOS app and test bundle built successfully; the
full macOS test suite passed (25 tests), including
`testHabitManagementPersistsTargetsDirectionScheduleAndArchive`. Runtime
inspection reached the latest Habits view and New Habit control; opening the
editor sheet was pending because the Mac locked during pointer QA.

Learn deck-detail pass (2026-08-01): native Learn now opens a deck detail view,
loads its cards from the server-backed cursor endpoint, supports optimistic
card create/edit/archive through the sync outbox, and exposes review, edit,
archive, hover, and context-menu interactions. Empty decks and due-review
states remain truthful when the account has no cards.

Verification evidence: the macOS app and test bundle built successfully; the
full macOS test suite passed (21 tests), including
`testLearnCardCrudUsesSyncOutboxAndPersistsOptimisticState`. Runtime inspection
confirmed the Learn library, New Deck validation/cancel behavior, and the
truthful empty deck/review state.

## Scope and evidence

This audit compared the running native macOS client with the running React web client, then checked the relevant Swift, TypeScript, sync, and API-call paths to distinguish working features from presentation-only UI.

Launch evidence:

- Web: `yarn dev` launched successfully with Vite at `http://localhost:5174/`.
- macOS: the Debug app built successfully with `xcodebuild` and opened as a native SwiftUI application.
- Both clients opened with cached authenticated sessions. They were different
  test accounts, so account-specific totals were not compared directly; data
  provenance was verified in source instead.
- The web audit covered Home, All Tasks, Today, Inbox, Next 7 Days, Matrix, Focus, Habits, Statistics, all four Growth tabs, Learn decks, deck detail, Review, Learning History, Trash, Settings, and Profile.
- The macOS audit covered Home, Inbox, Today, Completed, Matrix, Focus, Conflicts, Settings, authentication source, and the menu-bar companion source.

The comparison did not submit destructive actions, create test data, alter account settings, or resolve conflicts.

## Executive summary

The native client is a useful task-sync prototype with a polished shell, not a feature-complete desktop version of the web product.

Its strongest real capabilities are:

- native authentication and cached-user startup;
- local-first task persistence and a persistent task mutation outbox;
- task pull/push reconciliation;
- task list, completion, basic editing, and deletion;
- an Eisenhower presentation of locally cached tasks;
- a menu-bar quick-capture surface;
- a native timer that can remain visible outside the browser.

Its largest gaps are:

- entire web domains are absent: Habits, Statistics, Growth, Learn, Trash, Profile, and Notifications;
- task lists, sections, tags, reminders, recurrence, Growth rewards, and working subtasks are absent;
- Focus has a server-backed active lifecycle and read-only history, but still lacks record editing, real audio, notifications, and complete settings parity;
- Home displays substantial fabricated Growth, habit, learning, and focus data;
- several visible controls are no-ops or save different data than their labels promise;
- native sync lacks device registration and complete conflict resolution.

The right implementation strategy is not to copy every React screen literally. First make every currently visible native control truthful and safe, then build shared native repositories for each server domain, then add the missing workspaces in dependency order.

## Page-by-page parity matrix

Legend:

- **Full**: materially equivalent user outcome.
- **Partial**: useful subset exists, with important missing behavior.
- **Prototype**: screen exists but material data or actions are local, hard-coded, or incomplete.
- **Missing**: no native destination.

| Web destination | Web capabilities observed | macOS counterpart | Status | Native gap |
|---|---|---|---|---|
| `/auth` | Email/username login and registration, Google OAuth, terms flow | Authentication window | Partial | No Google OAuth callback/handoff or Google registration flow. |
| `/` Home | Server-backed account level/XP, focus state, reviews, attribute radar, today tasks, habit check-ins | Home | Partial | Tasks, Growth account/attributes, focus projection, and due-card count are live. Study-total, habit summary, and some dashboard aggregates remain unavailable. |
| `/plan` | All tasks, grouping/sorting, view options, rich quick capture, lists/tags/sections | Plan → Inbox | Partial | Basic search/sort/create/edit, task-list selection/create/edit/archive, task Section/tag assignment, and web-aligned Inbox/Today/Upcoming membership filters work. Grouping, reorder parity, tag/section management, reminders, recurrence, and Growth rules remain. |
| `/plan/today` | Today smart list | Planning rail “Today” | Partial | Dedicated native Today planning list exists with quick capture, search, sorting, status actions, and task editing; tags, sections, reminders, recurrence, and full grouping parity remain. |
| `/inbox` | Inbox smart list | Plan → Inbox | Partial | Basic task list works; web list/tag/section tooling is absent. |
| `/upcoming` | Next 7 Days grouped by date | Planning rail “Next 7 Days” | Partial | Native seven-day date grouping, quick capture, status actions, hover actions, and editing exist; full web grouping/filter parity remains. |
| `/matrix` | Search, filter/sort, visibility rules, four quadrants, add/move/reorder tasks | Plan → Eisenhower Matrix | Partial | Four quadrants, add/edit, search, priority filtering, visibility toggles, and persisted sorting now exist; drag/move/reorder parity remains. |
| `/focus` | Server-backed active session, pause/resume/complete/abandon/extend, task attach, editable history, summaries, custom sounds, notifications, global timer | Focus Studio | Partial | Active lifecycle, persistence, editable/searchable/collapsible history, summaries, custom duration, task attachment, Home, menu-bar projection, and functional ambient audio controls are connected. Presets and full settings parity remain. |
| `/habits` | Groups, schedules, targets, build/limit direction, occurrences, check-in/fail/skip, streaks, stats, tags, archive/restore, Growth rewards | Habits | Partial | Occurrences, target/direction/schedule editing, archive mutation, left-click habit details, server-backed streak/success statistics, grouped sections, collapse/expand-all, group creation, and tag assignment now exist; reminders, checklists, and richer schedule editing remain. |
| `/statistics` | Date ranges; task, focus, learning, XP, and attribute analytics | Statistics | Partial | Server study-calendar and Growth statistics now drive 7/30/365-day and Custom ranges with loading/error states, summary tiles, task/focus charts, trend cards, and attribute distribution; chart hover/tooltips and full web trend-card interactions remain. |
| `/growth/attributes` | Account progression and editable attributes | Home attribute card and Growth | Partial | Account progress and attributes are server-backed; visibility and active-cycle configuration remain. |
| `/growth/skills` | Skill creation/editing and progression | Growth | Partial | Server-backed skill loading and edit flow exist; creation, reorder, rewards, and full progression settings remain. |
| `/growth/shop` | Rewards, inventory, categories, redemption | Growth → Shop & Rewards | Partial | Server-backed Shop, Inventory, search, category filters, and sync-backed redemption exist; category management, consume actions, and richer filters remain. |
| `/growth/ledger` | XP/coin transaction history and filters | Growth → Ledger | Partial | Server-backed recent ledger entries and signed XP/coin amounts exist; web filter controls and cursor pagination remain. |
| `/learn/decks` | Deck library, search, create | Learn | Partial | Server-backed deck library, offline-first create, case-insensitive title/description search, clear-search recovery, persistent Learn workspace navigation, hover actions, and reversible archive context action exist; richer deck settings remain. |
| `/learn/decks/:id` | Cards, create/edit/move/delete, images, imports, AI suggestions, insights | Learn review/library | Partial | Native deck detail, optimistic card create/edit/archive, and context-menu actions exist; media, move, import, AI, and insight workflows remain. |
| `/learn/review` | Due-card review session and grading | Learn review | Partial | Server due queue, reverse direction, session start, grading, completion, and local recall-answer entry are supported; answer evaluation, media, and AI feedback remain. |
| `/learn/history` | Session archive, details, saved AI feedback | Learn → Session History | Partial | Server-backed archive, details, metrics, reviews, saved feedback, selection, hover, and context actions exist; pagination beyond 50 and AI feedback generation remain. |
| `/trash` | Recoverable deleted tasks, decks, and cards; restore/permanent delete | Trash | Partial | Native Trash now loads server-backed tasks, decks, and cards with hover/context actions, offline-first deck/card restore, and confirmed permanent deletion; card images and task restore/delete reconciliation remain. |
| `/settings` | Appearance, task defaults, focus defaults, matrix rules, Growth configuration/reset | Native Settings window | Partial | Appearance, task defaults, matrix rules, Focus preferences, server-backed Growth profile/reset/rule editing, and real macOS notification permission controls are native; broader notification/reminder preferences remain. |
| `/profile` | Username/display-name update, password change, export, account deletion | Profile | Partial | Core account actions, read-only email presentation, native export save panel, and confirmed deletion are connected; OAuth handoff and fuller profile presentation remain. |
| Global notifications | Notification inbox, unread/read state, browser notification permission | Notifications | Partial | Server-backed inbox, unread badge, read/all-read, hover, click, actionUrl deep-link routing, mark-read/snooze/dismiss context actions, and macOS permission-aware Focus completion delivery exist; general local delivery for inbox updates remains. |
| Global sync status | Pending mutation details, errors, retries, conflict controls | Rail status + Conflicts | Partial | Conflicts shows pending mutation details with Retry, Keep local, Use server, and right-click actions; the clickable rail popover now exposes counts, sync details, retry-failed, and discard-failed actions. Per-item web badges remain. |
| Menu-bar companion | No direct web equivalent | Menu-bar window | Native-only | Valuable native surface; retain it, but connect Focus and upcoming tasks to server truth. |

## Detailed findings

### 1. Navigation and information architecture

The web shell exposes nine primary workspaces grouped as Productivity, Tracking, and Knowledge. The native primary rail exposes only Home, Plan, Focus, Conflicts, and Settings.

Native planning navigation currently advertises more capability than it owns:

- “New list” only selects Inbox; it does not create a list.
- “New tag” is a label, not an interactive control.
- The hard-coded “Inbox” list row is not backed by the task-list domain.
- Native “Today” shares the `.today` enum value with Home and renders the dashboard instead of a task-list view.
- Matrix is a mode nested inside Plan while web treats it as a first-class workspace. Either structure is valid, but deep-link/state restoration should make the destination stable.

Recommendation:

- Keep the native three-column planning layout.
- Separate `AppDestination.home` from planning filters such as `PlanningSmartList.today`.
- Generate list, section, and tag navigation from server-backed repositories.
- Hide unfinished creation controls until they perform the named action.

### 2. Home dashboard data provenance

Home now receives account level/XP and attribute progress from the Growth API,
uses the persisted Focus projection, derives due cards from loaded decks, and
renders an explicit unavailable marker where the native model does not yet own
the web metric (such as study-total and habit aggregates). This removes the
previous account-looking constants from the view.

Remaining work:

- Add the dashboard summary repository for study totals, streaks, and habit
  aggregates rather than inferring them from partial local collections.
- Add attribute visibility persistence and the web Growth profile settings.
- Keep every unsupported aggregate visibly unavailable instead of replacing it
  with a zero or sample value.

### 3. Core task correctness issues

These should be fixed before adding new domains.

#### Status picker does not honor the selected status

`TaskEditorView.save()` calls `toggleCompletion()` whenever the selected status differs. `toggleCompletion()` only switches between Inbox and Completed. Selecting Planned, In Progress, Canceled, or Archived therefore writes the wrong status.

Required fix:

- expose `setTaskStatus(task:status:)`;
- persist the exact selected enum and corresponding `completedAt` rules;
- add tests for every status transition.

#### “Add subtask” creates a top-level task

The editor creates a task, searches it by title, and edits ordinary fields. It never writes `parentId`. Duplicate titles can also select the wrong task.

Required fix:

- extend task creation to accept `parentId`;
- use the returned entity ID directly;
- enqueue `parentId` in `task.create`;
- test offline creation, synchronization, and reload.

#### Home quick-capture notes are discarded

The expanded Home composer captures `quickDescription`, but `addTask()` only sends title, priority, and due date.

Required fix:

- use one shared native task draft/creation path for Home, Plan, Matrix, and menu bar;
- explicitly support or omit fields per surface.

#### Missing task-domain fields and actions

Compared with web, native lacks:

- task-list assignment and movement;
- sections;
- tags;
- reminders;
- recurrence;
- scheduled start/end;
- task Growth reward rules;
- drag/reorder;
- undo;
- recoverable trash/restore;
- rich Markdown preview;
- complete context actions and date shortcuts.

### 4. Focus is not feature parity

The native timer is an in-memory `FocusTimer`. It does not call the focus endpoints and is lost when the process exits.

Presentation-only or fixed Focus elements include:

- ambient “play” only toggles a Boolean; no audio is played;
- fixed sounds are names only;
- streak is always `3 days`;
- best record is always `90m`;
- session history always shows “Deep Work Session, 09:30 AM–10:15 AM, 45m”;
- short/long break settings are fixed display text;
- there is no server-backed active session or cross-device ownership.

Web additionally supports:

- active-session recovery;
- pause/resume/complete/abandon/extend;
- task attachment after start;
- persisted and editable history;
- summary metrics;
- custom uploaded sounds with caching/preferences;
- finish chime and notifications;
- global compact timer;
- overtime behavior and more complete user settings.

Recommendation:

- replace `FocusTimer` as the source of truth with a `FocusSessionRepository`;
- keep a local clock projection for smooth rendering, but reconcile it with server timestamps/version;
- persist the active session locally for offline restart;
- implement real `AVAudioPlayer` playback and `UNUserNotificationCenter`;
- remove fixed history/stats until repositories provide data.

### 5. Offline and sync parity

What exists:

- per-account atomic snapshot;
- task mutation outbox;
- client-generated ULIDs for mutations/entities;
- push then pull;
- cursor persistence;
- periodic 15-second reconciliation;
- WebSocket invalidation;
- conflict persistence;
- server-version conflict discard.

What is missing or materially weaker than web:

- device registration before WebSocket connection;
- a `MACOS` backend device platform and APNs token registration;
- lease/coalescing equivalents are not necessary for one process, but mutation compaction would still reduce redundant task edits;
- mutation retry metadata, classified backoff, and retry UI;
- automatic safe rebase;
- manual “keep mine” rebase;
- pending mutation inspection;
- server mutation outcomes such as Growth receipts;
- sync handlers/repositories for every non-task domain;
- WebSocket connection tickets instead of an access token in the query string.

The macOS `deviceId` is currently a UUID stored in `UserDefaults`, while entity/mutation IDs use ULIDs. Align device identity with the backend contract and register it explicitly.

### 6. Settings, profile, authentication, and notifications

Native Settings is an engineering/debug panel rather than the web control center:

- API base URL;
- sign out;
- pending/conflict counts.

Missing settings include:

- light/dark/system appearance;
- task defaults;
- focus defaults;
- matrix urgency/visibility rules;
- Growth curves, presets, reward defaults, onboarding/reset;
- notification preferences;
- launch at login;
- native sound and reminder settings.

Missing account functions:

- username/display-name editing;
- password change;
- personal data export;
- account deletion;
- avatar handling.

Authentication is otherwise a useful email/username subset, but Google OAuth is absent.

### 7. Conflict handling

The native Conflicts screen is valuable and should remain, but it only supports “Keep server version.” Web exposes both server and local resolution paths through `keepServer()` and `keepMine()`, plus retrying pending changes.

Required parity:

- show local and server values per changed field;
- keep server;
- keep mine by rebasing on the latest version;
- edit a merged value where appropriate;
- retry failed/pending mutations;
- retain an audit-friendly resolution result.

### 8. Native-only value worth keeping

Not everything should mirror web. These native capabilities are appropriate differentiators:

- menu-bar quick capture;
- menu-bar focus controls and status;
- native windowing and keyboard behavior;
- offline availability without a browser tab;
- future local notifications, Launch at Login, Shortcuts/App Intents, and system integrations.

The menu-bar surface should reuse the same repositories and session state as the main window. It should not become a second implementation of task and focus business logic.

## Redundant, misleading, or premature native UI

Remove, hide, or connect these before expanding visual polish:

| Native UI | Current behavior | Decision |
|---|---|---|
| Home account level/XP | Fixed values | Replace with server data or unavailable state. |
| Home review metrics | Fixed `8` and `14` | Remove until Learn repository exists. |
| Home attributes | Fixed levels/XP; local visibility menu | Remove until Growth repository exists. |
| Home habit journal | Four fixed habits; ephemeral toggles | Remove until Habits repository exists. |
| Focus ambient playback | Toggles an icon/slider only | Implement audio or label as preview and disable. |
| Focus streak/best/history | Fixed values and session row | Remove until Focus history exists. |
| Planning “New list” | Selects Inbox | Hide until task-list create exists. |
| Planning “New tag” | Non-interactive label | Hide until tag create exists. |
| Home and planning Today | Same destination semantics are conflated | Split Home destination from Today smart list. |
| Repeated manual sync buttons | Rail and list header perform the same sync | Keep rail status; make page action context-specific or remove. |
| Settings API URL | Useful for development, risky as primary user setting | Move to an Advanced/Developer section for non-debug builds. |

## Recommended implementation sequence

### Phase 0 — Truthfulness and task safety

Goal: no visible control lies or writes the wrong data.

1. Remove/disable all fixed Home and Focus metrics.
2. Separate Home from Today routing.
3. Fix exact status transitions.
4. Fix subtask creation with `parentId`.
5. Stop discarding Home quick-capture notes.
6. Replace title-based created-task lookup with returned IDs.
7. Add focused tests for offline create/edit/status/subtask/delete flows.
8. Update stale macOS repository guidance that still calls the folder “reserved.”

Acceptance:

- every displayed metric comes from a repository or is clearly unavailable;
- every task editor field round-trips after restart and sync;
- no no-op creation controls remain visible.

### Phase 1 — Shared native data foundation

Goal: support feature work without duplicating networking and local-first behavior.

1. Add typed repositories for task lists, sections, tags, reminders, notifications, focus, habits, Growth, and Learn.
2. Define a versioned native offline database schema and migrations. The current single JSON snapshot is acceptable for tasks but will become fragile across all domains.
3. Centralize mutation creation, retry policy, backoff, conflict storage, and mutation outcomes.
4. Register native devices before WebSocket connection.
5. Add background-safe refresh boundaries and connectivity state.
6. Add a reusable native Markdown editor/preview and media cache.

Acceptance:

- each repository has offline read/write tests and sync-contract fixtures;
- entities remain account-scoped;
- no feature view constructs raw sync payloads.

### Phase 2 — Complete productivity parity

Goal: make macOS fully usable for task planning.

1. Task lists: create, edit, archive, delete, reorder.
2. Sections and list navigation.
3. Tags and tag filtering.
4. Reminders and recurrence.
5. Next 7 Days.
6. Task drag/reorder and matrix movement.
7. Trash/restore for tasks.
8. Task Growth reward editor.
9. Undo and keyboard shortcuts.
10. Menu-bar capture using the shared task draft.

Acceptance:

- a task created or edited offline on macOS appears correctly on web after sync, including list, section, tags, reminder, recurrence, parent, ordering, and status;
- the same is true in the reverse direction.

### Phase 3 — Server-backed Focus and native notifications

Goal: one focus session across web and Mac.

1. Active session repository and lifecycle actions.
2. Restart recovery and cross-device ownership.
3. Task attach/detach.
4. Real history, summaries, editing, merge/search.
5. User defaults and presets.
6. Real audio playback, custom sound cache, and volume/preferences.
7. local completion notifications.
8. Global/menu-bar timer backed by the same session.

Acceptance:

- starting on one client is reflected on the other;
- pause/resume/complete/abandon/extend are version-safe;
- quitting and reopening macOS restores the correct active session.

### Phase 4 — Habits, Growth, and Statistics

Goal: replace the fabricated dashboard with live progress.

1. Habit groups, schedules, targets, occurrences, actions, streaks, and stats.
2. Growth attributes, skills, rules, receipts, rewards, inventory, ledger, onboarding, and reset.
3. Statistics date ranges and charts.
4. Rebuild Home from these repositories.

Acceptance:

- native Home matches web totals for the same account and date range;
- offline habit actions and Growth receipts reconcile exactly once.

### Phase 5 — Learn

Goal: complete the knowledge workspace.

1. Deck library and deck detail.
2. Card CRUD, movement, images, and import.
3. Due queue and review grading.
4. Session history and details.
5. AI suggestion/feedback streaming where supported.
6. Learning statistics and Home metrics.

Acceptance:

- deck/card/review state remains consistent across clients;
- media has explicit download/cache states;
- interrupted review sessions recover safely.

### Phase 6 — Account, system, and native integration

Goal: complete desktop ownership and platform value.

1. Profile edit, password change, export, and account deletion.
2. Notification inbox/read state and APNs.
3. Google OAuth callback.
4. Appearance and complete settings.
5. Launch at Login.
6. Shortcuts/App Intents for capture and focus.
7. Optional usage tracking/blocking only after explicit privacy, retention, and entitlement design.

## Suggested native architecture boundaries

Preserve SwiftUI and the existing shared model, but split the growing responsibilities:

- `AppRouter`: destinations and workspace/sidebar state.
- `SessionRepository`: authentication, cached profile, refresh, logout.
- `SyncEngine`: outbox, pull cursor, retries, conflicts, mutation outcomes.
- domain repositories: Tasks, Focus, Habits, Growth, Learn, Notifications, Profile.
- `OfflineDatabase`: versioned account-scoped persistence.
- feature view models: presentation state only; no raw request/payload construction.

The web app remains the behavioral reference, while the API contracts—not React component structure—should be the source of truth.

## Verification checklist for each parity slice

For every new native domain:

1. create/edit/delete or lifecycle actions work while offline;
2. the app survives termination and restores local state;
3. queued changes sync once when connectivity returns;
4. web reflects the result;
5. web-originated changes pull into macOS;
6. stale-version conflicts expose safe resolution;
7. account switching cannot leak cached data;
8. UI never displays fabricated values;
9. accessibility labels and keyboard navigation cover every action;
10. unit, integration, and visual tests pass.
## Latest parity pass — 2026-08-01

- Native Planning now exposes server-backed task lists in the planning rail and
  preserves the selected list when creating tasks.
- Native Matrix now supports web-aligned search, priority filtering, and the
  completed / won't-do visibility controls.
- Focus settings now include the web-aligned default duration, overtime,
  completion sound, desktop notification, and compact-audio preferences; the
  timer renders overtime explicitly when enabled.
- Conflict resolution now supports both “Keep server version” and “Keep mine”;
  keeping local edits rebases them onto the latest server version before the
  mutation is retried.
- Statistics now changes its daily completion window for 7 Days, 30 Days, and
  All Time instead of always rendering seven days.
- The main workspace no longer forces light appearance, and Planning’s layout
  control now labels the second mode “Matrix” to match the web client.
- Verification: macOS build succeeded; focused OfflineStore tests passed.

### Learn parity pass (2026-08-01)

- Deck list responses now decode the API cursor-page contract, including study
  counts, server icon/color values, and persisted versions.
- Native Learn hydrates cards from the server and uses the server due queue for
  review, including reverse review directions.
- New decks are created optimistically through `deck.create` instead of being
  appended only to in-memory state.
- Review start, Again/Hard/Good/Easy grading, and session completion enqueue
  the same `session.start`, `review.create`, and `session.complete` mutations
  used by the web client.
- Cards and pending Learn state are persisted in the account-scoped offline
  snapshot and remain available across relaunches.
- Verification: macOS app build succeeded; test bundle compilation succeeded;
  runtime test execution was interrupted by the local macOS test runner while
  waiting for Launch Services workers.

Learn deck-detail pass (2026-08-01): native Learn now opens a server-backed
deck detail view, loads all cards, and supports prompt/answer create and edit
flows. Archive is available through both the visible trash button and the
card's right-click context menu. Card create/update/delete are optimistic
`card.create`, `card.update`, and `card.delete` mutations with version-aware
replay over stale pulls, and deck card counts update locally immediately.

Learn history pass (2026-08-01): native Learn now exposes Session History from
the deck library, loads the web-compatible cursor-page history contract, and
opens server-backed session details with remembered/correct/rating metrics,
review prompt/answer pairs, user answers, saved feedback, selection, hover,
and right-click actions. The history/detail DTO mapping is covered by a
focused decoding test. Pagination beyond the initial 50 sessions and the web
client's AI feedback generation flow remain follow-up work.

Statistics parity pass (2026-08-01): native Statistics now loads the web
study-calendar and Growth-statistics contracts, refreshes when the 7/30/365-day
range changes, uses server activity for task/focus/review/card metrics, and
shows explicit loading/error states instead of silently presenting local or
zero-valued substitutes. Calendar and Growth trend decoding are covered by a
focused test. Custom date ranges, attribute distribution detail, and the web
trend-card interaction model remain follow-up work.

Statistics custom-range pass (2026-08-01): the native Statistics range picker
now includes Custom with native From/To date pickers, validation against the
last year, and an Apply Range action. Calendar data is filtered to the selected
dates while Growth statistics are requested for the exact UTC range.

Notifications parity pass (2026-08-01): native now has a server-backed
Notifications inbox in the primary rail, unread count badge, empty state,
refresh-on-open behavior, mark-one-read and mark-all-read actions, hover
feedback, and a right-click mark-as-read action. Notification contract
decoding is covered by a focused test. Deep-link navigation from `actionUrl`
and local notification delivery remain follow-up work.

Task scheduling parity pass (2026-08-01): native task editing now exposes
scheduled start/end times and an RRULE recurrence field, persists them
optimistically through the existing versioned `task.update` mutation, replays
them over stale pulls, and preserves them after reload. The editor retains the
existing due date, list/section/tag, status, priority, and estimate controls.
Native reminder creation/snooze/dismiss delivery remains follow-up work.

Task reminder pass (2026-08-01): native quick capture now offers a reminder
picker, newly created tasks can attach reminders through the productivity API,
task rows render active reminder badges, and the task right-click menu offers
Today/Tomorrow/Next Week reminder actions. Reminder response decoding is
covered alongside notification contract tests. Reminder snooze/dismiss and
editing an already-attached reminder remain follow-up work.

Growth profile/settings pass (2026-08-01): native Growth and Settings now load
the server profile contract, expose account base XP and reward preset editing,
and persist changes optimistically through `growthprofile.update`. Pending edits
are reapplied after stale server pulls and survive offline reload. Settings now
also mirrors the web reset flow with scope selection, server impact preview,
typed RESET confirmation, idempotent execution, and truthful loading/error
states. The controls use the shared hover, cursor, click, and disabled-button
behavior. Active-cycle management and full reward-rule editing remain follow-up
work. Verification: the full macOS test suite passed (30 tests) and the
Impeccable detector reported no findings on the changed UI surface.

Growth reward-rule pass (2026-08-01): native Settings now loads the web reward
preset settings for Tasks, Habits, Focus, and Deck Reviews. Each source exposes
coin reward, skill XP, scaling mode, and optional cap editing, with Save Preset
and Apply to Existing actions using the offline `growthrewardpreset.update` and
`growthpreset.apply` mutations. Snapshot reload and mutation coverage are
included in the macOS test suite; the shared UI detector reported no findings.

Learn search pass (2026-08-01): the native deck library now filters by title or
description as the user types, shows a distinct no-match state, and exposes
clear-search actions matching the web library. Existing deck/card hover and
context-menu interactions remain intact.

Notifications deep-link pass (2026-08-01): native notification left-clicks now
mark the item read and route supported actionUrl paths into the matching native
Home, Planning, Focus, Habits, Statistics, Growth, Learn, Trash, Profile, or
Settings destination. Unknown paths safely remain in the notification inbox.
Routing is covered by a focused macOS test. Local notification delivery remains
follow-up work.

Notification permission and Focus delivery pass (2026-08-01): Settings now
reads the real macOS notification authorization state, offers Enable Desktop
Alerts for the undetermined state, and links blocked users to System Settings.
Active countdown sessions deliver one native completion notification when they
cross zero, respecting the existing desktop-notification preference and avoiding
duplicate delivery after timer ticks or reloads. General inbox notification
delivery remains follow-up work.

Trash deck/card pass (2026-08-01): native Trash now fetches the web
`/trash` contract and presents separate task, deck, and card sections with
server-backed loading/error/empty states. Deck and card Restore actions update
the local library immediately and enqueue the existing `deck.restore` and
`card.restore` sync mutations; right-click menus mirror the primary actions.
Permanent deck/card deletion is confirmation-gated and uses the same destructive
REST endpoints as web. Card-image recovery and task reconciliation after
permanent deletion remain follow-up work. Verification: the full macOS suite
passed (34 tests) and the changed Trash surface had no detector findings.

Sync recovery pass (2026-08-01): native Conflicts now includes the pending
mutation outbox, error labels, Retry, Keep local, and Use server actions, with
matching context-menu actions. These use the existing offline snapshot and
sync protocol; the rail still needs the web-style popover and bulk failed-
mutation discard action. The Xcode run compiled the changed targets and the
offline-store tests passed, but the full run was interrupted when the locked
desktop stalled during visual layout execution.

Learn workspace navigation pass (2026-08-01): native Learn now keeps a
persistent sidebar matching the web workspace, with Decks & cards, Review, and
Learning history destinations. Each item has selected, hover, pointer, and
click states; Review opens the first deck with due cards (or the first deck).
The changed Learn surface passed the UI detector and the macOS target compiled
successfully.

Matrix sorting pass (2026-08-01): native Matrix now persists and applies the
web-supported Manual order, Due date, Priority, and Title sort choices from its
filter popover. The changed Matrix surface passed the UI detector and the
macOS target compiled successfully.

Review answer-entry pass (2026-08-01): native review now provides a recall
answer editor before reveal, matching the web interaction and clearing it when
the card is graded. The changed Learn surface passed the UI detector and the
macOS target compiled successfully.

Focus audio pass (2026-08-01): native Focus now connects its existing audio
engine to the view, replacing the unavailable placeholder with working
play/stop, sound-track selection, and volume controls. The changed Focus
surface passed the UI detector and the macOS target compiled successfully.

Notification reminder-actions pass (2026-08-01): native notification context
menus now expose Snooze 1 Hour and Dismiss Reminder when a notification carries
a reminder ID, using the same server endpoints as web. The changed surface
passed the UI detector and the macOS target compiled successfully.

Deck archive pass (2026-08-01): native deck cards now expose a reversible
Archive Deck action through the right-click menu. The action removes the deck
and its cached cards optimistically, queues the existing `deck.delete` sync
mutation, and leaves recovery to Trash. The changed Learn surface passed the
UI detector and the macOS target compiled successfully.

Habit detail pass (2026-08-01): native habit identity areas are now primary
left-click targets that open a web-style detail sheet with server-backed
current/best streak, success rate, focused minutes, and completed/failed/skipped
counts. Existing hover, check-in, edit, archive, and context-menu actions remain.
The changed Habits surface passed the UI detector and the macOS target compiled
successfully.

Profile email pass (2026-08-01): native Profile now presents the account email
as a disabled field with the same immutable-email explanation as web. The
changed Profile surface passed the UI detector and the macOS target compiled
successfully.

Habit time-block pass (2026-08-01): native habits now load the server's habit
time blocks, persist assignments through the existing offline mutation path,
offer time-block selection in the editor, and render collapsible grouped
sections with hover, pointer, and click behavior matching the web list. The
changed Habits surface passed the macOS build; reminders, checklists, tags, and
 checklists, reminders, tags, and richer time-block editing remain open parity work.

Habit group-controls pass (2026-08-01): native Habits now includes the web
header's collapse/expand-all control and a Habit Groups sheet that lists the
server groups and creates new groups through the productivity API. The changed
surface passed the UI detector and the macOS target compiled successfully.

Statistics trend pass (2026-08-01): native Statistics now includes the web
trend-card trio and attribute experience distribution chart/list using the
existing server Growth and study-calendar DTOs, with truthful empty, loading,
and error states. The changed surface passed the UI detector and the macOS
target compiled successfully; native chart hover tooltips remain follow-up
parity work.

Growth shop-filter pass (2026-08-01): native Shop & Rewards now exposes
category pills derived from server reward data, applies category and text
filters together, and shows a truthful no-results state. Existing hover,
redeem, inventory, and sync behavior remains intact. The changed surface passed
the UI detector and the macOS target compiled successfully.

Sync popover pass (2026-08-01): the native rail sync status is now a clickable
popover with pending/conflict counts, navigation to sync details, retry-failed,
and discard-failed actions. The changed surface passed the UI detector and the
macOS target compiled successfully.

Habit tags pass (2026-08-01): native Habit models now decode server tag
assignments, the editor exposes the same tag-chip selection pattern used by
task editing, and create/update mutations carry `tagIds` through the existing
offline sync repository. The changed surface passed the UI detector and the
macOS target compiled successfully.

Task visibility parity pass (2026-08-01): native task projections now follow
the web Inbox rule (root tasks only, no list/project, terminal or unscheduled
Inbox status), use `scheduledStartAt ?? dueAt` for Today and Next 7 Days, and
include canceled items in completed views. This removes the source-level count
and membership mismatch visible between the two task screenshots. The isolated
macOS build succeeded after the change.
