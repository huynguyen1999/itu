# Code Health Baseline

Date: 2026-08-14
Commit: `34266d23d204052a123e8756dca9d36db0eb31dc`

## Checks

| Area | Check | Result |
| --- | --- | --- |
| API | `yarn typecheck` | Pass |
| API | `yarn test --runInBand` | Pass — 74 suites, 332 tests |
| API | `yarn build` | Pass |
| API | `yarn lint` | Baseline failure — ESLint 9 cannot find `eslint.config.*` |
| API | `yarn architecture:check` | Pass; large-file warnings listed below |
| Web | `yarn typecheck` | Pass |
| Web | `yarn test` | Pass — 59 files, 313 tests |
| Web | `yarn build` | Pass; Vite reports existing chunks over 500 KB |
| Web | `yarn lint` | Baseline failure — ESLint 9 cannot find `eslint.config.*` |
| Extension | `yarn test` | Pass — 11 tests |
| macOS | signed `xcodebuild ... build` | Pass |
| macOS | signed `xcodebuild ... test` | Pass |

The first restricted macOS attempt could not write Xcode/SwiftPM caches; the
same required commands passed with the approved cache-access escalation. No
source behavior was changed for the baseline.

## Current guardrail validation

The first implementation slice adds flat ESLint configs, report-only Knip
scripts, dependency-cruiser boundary checks, a large-file ratchet, and a
public Calendar feature entrypoint. Current API validation after the Usage
validation extraction:

| Check | Result |
| --- | --- |
| `yarn lint` | Pass — 71 warnings, 0 errors |
| `yarn typecheck` | Pass |
| `yarn test --runInBand` | Pass — 75 suites, 336 tests |
| `yarn build` | Pass |
| `yarn architecture:check` | Pass; existing large-file and cross-feature warnings remain |
| `yarn code:deps` | Pass — 253 modules, 1116 dependencies; no violations |
| `yarn code:unused` | Report-only; 2 unused files, 1 unused dependency, 1 unused dev-dependency group, 3 unlisted `ws` imports |

Web validation also passes with 60 test files and 314 tests, 0 ESLint errors
(161 warnings), and 3 existing dependency-cruiser cycle warnings. The baseline
large-file allowlist is now enforced as a ratchet: new files over 24 KB fail,
and grandfathered files may grow only within the configured allowance.

## Large production files (>24 KB)

The existing architecture checker reports these as warnings:

```text
api/src/core/application/use-cases/growth-awards.ts
api/src/core/application/use-cases/usage.service.ts
api/src/infrastructure/persistence/prisma/prisma-growth.repository.ts
api/src/infrastructure/persistence/prisma/prisma-journal.repository.ts
api/src/infrastructure/persistence/prisma/prisma-productivity-habits.ts
api/src/infrastructure/persistence/prisma/prisma-productivity.repository.ts
api/src/infrastructure/persistence/prisma/prisma-sync-budget-gym.ts
api/src/infrastructure/persistence/prisma/prisma-sync-focus-habits.ts
api/src/infrastructure/persistence/prisma/prisma-sync-growth-mutations.ts
macos/iTu/App/AppModel.swift
macos/iTu/Features/Budget/BudgetView.swift
macos/iTu/Features/Companion/CompanionView.swift
macos/iTu/Features/Focus/FocusView.swift
macos/iTu/Features/Growth/GrowthView.swift
macos/iTu/Features/Gym/GymView.swift
macos/iTu/Features/Habits/HabitsView.swift
macos/iTu/Features/Home/HomeOverviewView.swift
macos/iTu/Features/Journal/JournalView.swift
macos/iTu/Features/Learn/LearnView.swift
macos/iTu/Features/MenuBar/MenuBarView.swift
macos/iTu/Features/Settings/SettingsView.swift
macos/iTu/Features/Shell/MainView.swift
macos/iTu/Features/Statistics/StatisticsView.swift
macos/iTu/Features/Tasks/EisenhowerMatrixView.swift
macos/iTu/Features/Tasks/TaskEditorView.swift
macos/iTu/Features/Tasks/TaskListView.swift
macos/iTu/Shared/API/APIClient.swift
macos/iTu/Shared/Persistence/OfflineStore+Gym.swift
macos/iTu/Shared/Persistence/OfflineStore+Hydration.swift
web/src/features/calendar/components/CalendarTimeline.tsx
web/src/features/decks/DeckDetailPage.tsx
web/src/features/focus/FocusPage.tsx
web/src/features/gym/active/ActiveWorkoutPage.tsx
web/src/features/gym/exercises/ExerciseLibraryPage.tsx
web/src/features/habits/HabitsPage.tsx
web/src/features/planning/MatrixPage.tsx
web/src/features/planning/PlanningPage.tsx
web/src/features/planning/components/TaskDetailModal.tsx
web/src/features/settings/SettingsPage.tsx
web/src/features/statistics/StatisticsPage.tsx
web/src/shared/sync/SyncProvider.tsx
web/src/shared/sync/syncCache.ts
web/src/shared/sync/syncQueue.ts
web/src/shared/ui/GrowthRewardEditor.tsx
web/src/shared/ui/Layout.tsx
```

## Measured findings to triage later

- API cycles: none reported by dependency-cruiser.
- Web cycles: 3 warnings — `offlineStore.ts`/`syncQueue.ts`, Planning view
  settings, and Calendar data/timeline.
- API Knip also reports 16 unused exports, 19 unused exported types, 1
  duplicate export, and 3 unlisted `ws` imports; these remain report-only.
- Web Knip reports 11 unused files, 35 unused exports, and 20 unused exported
  types; these remain report-only pending dynamic-entrypoint review.
