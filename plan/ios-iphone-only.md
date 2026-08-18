# iTu iPhone-only direction

## Decision

iTu's first Apple mobile client targets iPhone only. iPad is explicitly out of
scope for this cut. Do not add iPad navigation, split-view layouts, iPad target
families, or iPad-specific acceptance criteria while completing the current
iOS work.

This does not change the shared Apple core or the iPhone's native integrations:
Device Activity, HealthKit, WidgetKit, ActivityKit, App Intents, notifications,
and offline-first sync remain in scope.

## Current implementation changes

- The iTu app, tests, widgets, Device Activity monitor, and Device Activity
  report targets use device family `1` (iPhone).
- The app uses one iPhone tab shell: Home, Plan, Focus, Habits, More.
- Learn uses a phone-friendly `NavigationStack`.
- Matrix uses a single-column phone presentation.
- The Screen Time report extension writes hourly app/domain snapshots to the
  App Group; the app normalizes, replaces, and uploads those buckets through
  the existing usage endpoints.
- Journal attachments are durable offline bytes; the iPhone sync lifecycle
  uploads them through the existing multipart endpoint, attaches the returned
  server model to the cached entry, and removes the local queue item only
  after success.
- Journal now has phone-native daily and weekly review editors. They load the
  existing server review context, including app, website, and HealthKit
  measurements, save reflection and measured snapshots through the offline
  Journal outbox, and can request AI insights through the existing endpoint.
- Growth Reset now uses the existing online preview/execute API: the iPhone
  requires a preview, shows affected skills and coins, then requires explicit
  destructive confirmation before execution and state refresh.
- Local iPhone notifications now mirror synced task reminders and the active
  countdown Focus session. Settings exposes permission state and request flow;
  Task Detail can create the first server-backed reminder from the phone, and
  notification taps route into Plan or Focus.
- Task and habit App Intents now route through the same local-first `AppModel`
  mutations as the iPhone UI: create/complete task and complete/increment
  habit. They launch the app when needed and report missing account/entity
  failures to Shortcuts/Siri.
- HealthKit observer imports now have a reliable best-effort background path:
  the `BGAppRefreshTask` handler registers during app initialization, waits for
  the account-scoped import to finish, and cancels it on expiration.
- HealthKit summaries and workouts now use the API's idempotent `/sync` contract;
  the backend persists them, hydrates them into review context, and deduplicates
  summaries/workouts across devices.
- Device Activity report metadata now uses the ExtensionKit declaration and the
  report extension is embedded under `iTu.app/Extensions`; widgets and the
  monitor remain under `PlugIns`.
- The iPhone Calendar screen now has an optional read-only EventKit overlay.
  It requests full calendar access on iOS 17+ (legacy event access below iOS
  17), keeps iTu task timelines independent, and never treats write-only access
  as readable.
- Focus blocking now uses the existing Family Controls authorization and
  `ManagedSettingsStore` to shield account-scoped selected apps, categories,
  and websites only during an active iTu Focus session. Pausing, finishing,
  switching accounts, and logout clear the shields.
- iOS 18 Control Center now exposes a native `Start Focus` control that invokes
  the existing `StartFocusIntent` and therefore shares the app's local-first
  Focus mutation path.
- Completed iTu Gym workouts can now be explicitly exported to Apple Health;
  stable metadata prevents duplicate writes and keeps those workouts out of
  the read/import pipeline.
- The shared `iTuCore` package is consumed by both clients; macOS behavior was
  preserved through the extraction and verified with focused parity tests.

## Delivery order

1. Keep the shared Apple extraction and macOS parity work incremental. The
   current extraction builds and the focused macOS parity suite passes.
2. Finish iPhone authentication, offline persistence, sync, and conflict
   recovery.
3. Validate Today widgets, Focus Live Activity, task/habit App Intents, and
   local notification delivery on a physical iPhone.
4. Finish daily-use iPhone surfaces: Home, Plan, Focus, Habits, Journal, and
   Calendar. Journal attachment upload now follows the same offline-first
   contract as Journal text; remaining work is physical-device acceptance.
5. Finish Screen Time and HealthKit imports as OS-managed pipelines; iTu must
   not use a background polling loop. Screen Time normalization, idempotent
   replacement, iPhone usage upload, and best-effort HealthKit background
   refresh are implemented; physical-device authorization/report validation
   remains.
6. Complete the remaining mobile features with touch-native iPhone UX.
   Growth Reset is now a touch-native online preview/confirmation flow.
7. Add usage and health summaries to daily/weekly review context. The iPhone
   review editor now consumes that context and can generate AI insights; the
   backend contract is verified; the remaining acceptance work is authenticated
   API/AI and physical-device validation.

## Acceptance criteria

- The iPhone app, widget extension, Device Activity extension, and iPhone tests
  build with no iPad device-family setting.
- Navigation is usable from the iPhone tab shell and nested `NavigationStack`
  flows.
- Core mutations remain immediate and recoverable offline.
- Journal attachment bytes survive offline/relaunch and are removed only after
  a successful server upload.
- Widgets and Live Activities consume real iTu state and shared action logic.
- Screen Time and HealthKit imports are incremental and idempotent.
- Daily and weekly reviews can be authored offline and retain their measured
  summary snapshots.
- Review AI insights are requested only online and reconcile into the cached
  review entry.
- Growth Reset never executes offline or without a server preview and explicit
  destructive confirmation.
- Task reminders and countdown Focus completion are scheduled through
  `UserNotifications` from current synced state; iTu does not run a background
  polling loop.
- Local notification taps route to the relevant iPhone workspace.
- Screen Time app/domain data is sourced by the Device Activity report
  extension, not a continuously running iTu process.
- HealthKit background refresh does not mark its task complete until the
  account-scoped import finishes or is cancelled by expiration.
- macOS behavior remains unchanged; the shared-core build and focused
  JournalParity, OfflineStore, and SyncCoordinator tests pass.
- No iPad-specific target, split-view shell, or iPad acceptance test is added.

## Deferred

Reintroduce iPad only as a separate product decision with its own navigation,
layout, target-family, and physical-device acceptance plan. It should not be
smuggled back in through adaptive UI while this iPhone-only scope is active.

## Follow-up: task and habit App Intents

### Completed

- Added `CreateTaskIntent` and `CompleteTaskIntent` with task-ID parameters.
- Added `CompleteHabitIntent` and `IncrementHabitIntent` with habit-ID
  parameters.
- Routed all four actions through `IOSAppProcessRegistry` into the existing
  `AppModel` and `OfflineStore` mutation paths.
- Added a focused XCTest covering task creation/completion, habit increments,
  and persisted habit outbox mutations.

### Verification

- iPhone simulator `build-for-testing` passed, including App Intents metadata
  processing.
- Focused simulator test
  `testTaskAndHabitIntentsUseLocalFirstMutations` passed.
- `git diff --check` passed.

### Unfinished

- Validate Shortcuts/Siri discovery and execution on a provisioned physical
  iPhone, including behavior after the app process has been terminated.

## Follow-up: HealthKit background refresh reliability

### Completed

- Registered the `BGAppRefreshTask` identifier from `iTuApp.init()` before the
  first scene is created.
- Changed the background handler to await `AppModel`'s account-scoped HealthKit
  import before calling `setTaskCompleted`.
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
- Removed duplicate Swift 6 imported-protocol conformance warnings from the
  iPhone and macOS sync adapters.
- Removed the duplicate legacy Device Activity report extension metadata and
  split the app embedding phase so the report is placed in `Extensions`.

### Verification

- `swift test` passed: 46 tests.
- API `prisma validate`, typecheck, build, and full Jest suite passed: 83
  suites, 406 tests.
- iPhone simulator `build-for-testing` passed; the built app contains the
  report at `iTu.app/Extensions/iTuDeviceActivityReport.appex`.

### Unfinished

- Authenticated backend/AI flows and Screen Time, HealthKit, notifications,
  Live Activities, and App Intents still require a provisioned physical iPhone.

## Follow-up: macOS parity after shared-core extraction

### Completed

- Built the macOS app with the extracted `iTuCore` package and normal Apple
  Development signing.
- Ran the focused JournalParity, OfflineStore, and SyncCoordinator XCTest
  targets successfully.
- The isolated `UsageTrackingTests` target also passed all 26 cases.

### Unfinished

- Full physical-iPhone validation remains blocked by the connected device's
  developer disk image and unavailable development profiles.
- Authenticated backend/AI acceptance remains a deployment/environment check,
  not a local compile or unit-test gap.
- The broader macOS suite is not a clean parallel gate in this environment:
  its result bundle recorded 330/331 passing in serial mode, with the one
  stale-account inverted expectation passing in isolation. The UsageTracking
  failures only occur when the full suite runs its shared macOS test process
  concurrently; no production tracker change was made for that test harness
  interference.

## Follow-up: iPhone cold-start actions and simulator acceptance

### Completed

- Added Calendar to the iPhone `More` workspace list so the documented
  navigation is complete.
- Restored the cached account and offline snapshot before Focus App Intents
  mutate state in a cold app process launched by a Live Activity action.
- Fixed daily and weekly review persistence to use the generated journal note
  identifier instead of creating a second identifier.
- Updated the task mutation test to assert the intentional outbox coalescing
  of consecutive updates for one entity.

### Verification

- Focused iPhone simulator tests passed for cold-start Focus actions, review
  persistence, and task mutation coalescing.
- Full iPhone simulator XCTest suite passed: 54/54 tests.
- Shared `iTuCore` package tests passed: 46 tests.
- API Prisma validation, typecheck, build, and full Jest suite passed: 83
  suites, 406 tests.
- Focused macOS JournalParity, OfflineStore, and SyncCoordinator tests passed;
  isolated UsageTracking passed all 26 tests.
- `git diff --check` passed and the iPhone source/configuration scan found no
  iPad navigation or device-family support.

### Unfinished

- Physical-device validation still requires Xcode to mount a usable developer
  disk image on the connected iPhone; the normally signed device build reached
  the paired iPhone 13 running iOS 26.3.1 and stopped with that exact error
  (exit 70) under Xcode 26.3.
- A generic physical-device build independently confirms that the app and all
  three extensions still need development provisioning profiles. After the
  device image and Apple account provisioning are available, install and run
  the app, widgets, monitor, and report extension on the phone.
- The local API/AI path still needs an explicitly authorized authenticated
  account and real provider configuration; simulator and mocked transport
  gates are complete, but that live acceptance is not claimed here.

## Follow-up: optional EventKit calendar overlay

### Completed

- Added a read-only EventKit service under `ios/iTu/Platform/Calendar`.
- Uses `requestFullAccessToEvents()` on iOS 17+ and the legacy event-access
  request on older supported iOS versions.
- Added both current and legacy calendar usage descriptions to the app
  property list.
- Shows Apple Calendar events alongside the existing local iTu task timeline;
  it does not write to or replace iTu task data.
- Explicitly handles denied, restricted, and write-only permission states.

### Verification

- iPhone simulator build-for-testing passed with the EventKit framework linked.
- Full iPhone simulator XCTest suite passed: 55/55 tests.
- Added a regression test proving write-only EventKit access cannot be used for
  event reads.
- `git diff --check` passed.

### Unfinished

- Real calendar permission prompts and event attribution still require the
  provisioned physical iPhone acceptance run.

## Follow-up: Screen Time Focus blocking

### Completed

- Added `IOSFocusBlockingService` with account-scoped persisted
  `FamilyActivitySelection` values in the iPhone App Group.
- Added the native Family Activity Picker to Settings for selecting apps,
  categories, and web domains.
- Applied `ManagedSettingsStore` shields from the existing `AppModel.apply`
  Focus state path; no polling or resident background process was added.
- Shields apply only to `.active` Focus sessions and clear on pause, finish,
  account switch, and logout.
- Write-only or unapproved Screen Time state cannot expose a blocking picker.

### Verification

- iPhone build-for-testing passed with the Family Controls and Managed Settings
  integration.
- Full iPhone simulator XCTest suite passed: 57/57 tests.
- Added regressions for active-session-only behavior and selection changes while
  a Focus session is active.
- `git diff --check` passed.

### Unfinished

- Real Family Activity Picker selection and shield enforcement still require
  the provisioned physical iPhone acceptance run.

## Follow-up: iOS 18 Control Center Focus control

### Completed

- Added a `ControlWidget` to the existing iTu widget extension for iOS 18+.
- The control invokes the existing `StartFocusIntent`; no separate Focus
  mutation or background process was introduced.
- Kept the control conditionally available so the iPhone target remains
  compatible with earlier supported iOS versions.

### Verification

- iPhone build-for-testing passed with the Control Center widget included.
- Full iPhone simulator XCTest run passed with the available iPhone
  destination.
- `git diff --check` passed.

### Unfinished

- Control Center registration and actual action execution still require
  installation on a provisioned physical iPhone.

## Follow-up: opt-in HealthKit Gym workout write-back

### Completed

- HealthKit authorization now includes workout sharing in addition to the
  existing summary/workout read access.
- Added an explicit `Save to Apple Health` action to completed Gym history.
- Saved workouts use `HKWorkoutActivityType.traditionalStrengthTraining` and
  the iTu workout ID as stable metadata for idempotent retries.
- HealthKit import recognizes iTu-owned metadata and excludes those workouts
  from external activity summaries.
- Added the HealthKit update usage description; export remains user-triggered.

### Verification

- iPhone build-for-testing passed after the write-back integration.
- Full iPhone simulator XCTest run passed with the available iPhone
  destination.
- `git diff --check` passed.

### Unfinished

- HealthKit permission, save, duplicate retry, and Apple Health presentation
  still require a provisioned physical iPhone.
