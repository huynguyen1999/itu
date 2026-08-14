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
```

## Measured findings to triage later

- API cycles: none reported by dependency-cruiser.
- Web cycles: 3 warnings — `offlineStore.ts`/`syncQueue.ts`, Planning view
  settings, and Calendar data/timeline.
- API Knip also reports 16 unused exports, 19 unused exported types, 1
  duplicate export, and 3 unlisted `ws` imports; these remain report-only.
- Web Knip reports 11 unused files, 35 unused exports, and 20 unused exported
  types; these remain report-only pending dynamic-entrypoint review.

## Latest continuation validation

The sync, Planning, and OfflineStore extraction slice was validated on
2026-08-14:

| Area | Check | Result |
| --- | --- | --- |
| Web | `yarn test` | Pass — 62 files, 322 tests |
| Web | `yarn typecheck` | Pass |
| Web | `yarn build` | Pass; existing large-chunk warning remains |
| Web | `yarn lint` | Pass — 0 errors, 158 warnings |
| Web | `yarn code:deps` | Pass — 269 modules, 1295 dependencies |
| Web | `yarn code:unused` | No unused files/dependencies; 7 exported API/domain contract type findings remain report-only |
| Root | `node tools/check-architecture.mjs` | Pass; existing grandfathered concentration warnings remain |

The Active Gym workout extraction was validated on 2026-08-14:

| Area | Check | Result |
| --- | --- | --- |
| Web | `ActiveWorkoutPage.tsx` concentration | Reduced from 44.8 KB to 23.7 KB; exercise picking moved to `ExercisePickerDialog.tsx` and exercise/set editing moved to `WorkoutExerciseList.tsx` |
| Web | `yarn test` | Pass — 63 files, 322 tests |
| Web | `yarn typecheck` | Pass |
| Web | `yarn build` | Pass; existing large-chunk warning remains |
| Web | `yarn lint` | Pass — 0 errors, 163 warnings |
| Web | `yarn code:deps` | Pass — 281 modules, 1364 dependencies |
| Web | `yarn code:unused` | Pass; 7 exported API/domain contract type findings remain report-only |
| Root | `node tools/check-architecture.mjs` | Pass; remaining grandfathered concentration warnings are listed above |

The API Growth award calculation extraction was validated on 2026-08-14:

| Area | Check | Result |
| --- | --- | --- |
| API | `growth-awards.ts` concentration | Reduced from 26.9 KB to 23.3 KB; deterministic scaling/allocation moved to `growth-award-calculations.ts` |
| API | focused Growth award tests | Pass — 26 tests |
| API | `yarn test --runInBand` | Pass — 76 suites, 343 tests |
| API | `yarn typecheck` | Pass |
| API | `yarn build` | Pass |
| API | `yarn lint` | Pass — 0 errors, 68 warnings |
| API | `yarn code:deps` | Pass — 258 modules, 1142 dependencies |
| API | `yarn code:unused` | Report-only; 19 exported contract types and 1 duplicate export remain |
| API | `yarn architecture:check` | Pass; remaining grandfathered infrastructure/macOS concentration warnings remain |

The API Growth repository extraction was validated on 2026-08-14:

| Area | Check | Result |
| --- | --- | --- |
| API | `prisma-growth.repository.ts` concentration | Reduced from 34.8 KB to 21.4 KB; reward presets, task defaults, and earning rules moved to `PrismaGrowthRewards` |
| API | focused Growth repository/statistics tests | Pass — 7 tests |
| API | `yarn test --runInBand` | Pass — 76 suites, 343 tests |
| API | `yarn typecheck` | Pass |
| API | `yarn build` | Pass |
| API | `yarn lint` | Pass — 0 errors, 67 warnings |
| API | `yarn code:deps` | Pass — 259 modules, 1146 dependencies |
| API | `yarn code:unused` | Report-only; 19 exported contract types and 1 duplicate export remain |
| Root | `node tools/check-architecture.mjs` | Pass; the Growth repository warning was removed, with other grandfathered infrastructure/macOS warnings remaining |

The shared-shell and Growth reward extraction was validated on 2026-08-14:

| Area | Check | Result |
| --- | --- | --- |
| Web | `Layout.tsx` concentration | Reduced from 33.2 KB to 17.9 KB; sync reconciliation and notifications moved to focused shared UI components |
| Web | `GrowthRewardEditor.tsx` concentration | Reduced from 29.2 KB to 21.3 KB; pure reward calculations moved to `growthRewardMath.ts` and collapsed presentation moved to `GrowthRewardSummary.tsx` |
| Web | focused shell/Growth tests | Pass — 12 tests |
| Web | `yarn test` | Pass — 63 files, 322 tests |
| Web | `yarn typecheck` | Pass |
| Web | `yarn build` | Pass; existing large-chunk warning remains |
| Web | `yarn lint` | Pass — 0 errors, 160 warnings |
| Web | `yarn code:deps` | Pass — 300 modules, 1468 dependencies |
| Web | `yarn code:unused` | Pass; 7 exported API/domain contract type findings remain report-only |
| Root | `node tools/check-architecture.mjs` | Pass; remaining grandfathered API/macOS concentration warnings remain |

The weekly journal review extraction was validated on 2026-08-14:

| Area | Check | Result |
| --- | --- | --- |
| Web | `WeeklyReviewPage.tsx` concentration | Reduced from 31.6 KB to 23.9 KB; weekly ledger calculations and presentation moved to `WeeklyReviewLedger.tsx` |
| Web | weekly review test | Pass — 1 file, 1 test |
| Web | `yarn test` | Pass — 63 files, 322 tests |
| Web | `yarn typecheck` | Pass |
| Web | `yarn build` | Pass; existing large-chunk warning remains |
| Web | `yarn lint` | Pass — 0 errors, 162 warnings |
| Web | `yarn code:deps` | Pass — 294 modules, 1439 dependencies |
| Web | `yarn code:unused` | Pass; 7 exported API/domain contract type findings remain report-only |
| Root | `node tools/check-architecture.mjs` | Pass; remaining grandfathered concentration warnings are listed above |

The Settings composition extraction was validated on 2026-08-14:

| Area | Check | Result |
| --- | --- | --- |
| Web | `SettingsPage.tsx` concentration | Reduced from 35.3 KB to 21.5 KB; usage data and device/permission surfaces moved to focused settings components |
| Web | settings tests | Pass — 1 file, 2 tests |
| Web | `yarn test` | Pass — 63 files, 322 tests |
| Web | `yarn typecheck` | Pass |
| Web | `yarn build` | Pass; existing large-chunk warning remains |
| Web | `yarn lint` | Pass — 0 errors, 162 warnings |
| Web | `yarn code:deps` | Pass — 297 modules, 1450 dependencies |
| Web | `yarn code:unused` | Pass; 7 exported API/domain contract type findings remain report-only |
| Root | `node tools/check-architecture.mjs` | Pass; remaining grandfathered concentration warnings are listed above |

The daily journal review extraction was validated on 2026-08-14:

| Area | Check | Result |
| --- | --- | --- |
| Web | `DailyReviewPage.tsx` concentration | Reduced from 26.1 KB to 13.2 KB; ledger and AI-insights presentation moved to focused journal components |
| Web | daily review tests | Pass — 2 files, 2 tests |
| Web | `yarn test` | Pass — 63 files, 322 tests |
| Web | `yarn typecheck` | Pass |
| Web | `yarn build` | Pass; existing large-chunk warning remains |
| Web | `yarn lint` | Pass — 0 errors, 161 warnings |
| Web | `yarn code:deps` | Pass — 293 modules, 1436 dependencies |
| Web | `yarn code:unused` | Pass; 7 exported API/domain contract type findings remain report-only |
| Root | `node tools/check-architecture.mjs` | Pass; remaining grandfathered concentration warnings are listed above |

The Habits dialog extraction was validated on 2026-08-14:

| Area | Check | Result |
| --- | --- | --- |
| Web | `HabitsPage.tsx` concentration | Reduced from 47.8 KB to 20.6 KB; create/edit dialogs moved to `HabitEditor.tsx` and `HabitDetail.tsx`, with shared tag/metric fields in `HabitFormFields.tsx` |
| Web | `TodayPage` habit-detail compatibility | Existing public `HabitDetail` export remains available through `features/habits` |
| Web | `yarn typecheck` | Pass |
| Web | `yarn test` | Pass — 63 files, 322 tests |
| Web | `yarn build` | Pass; existing large-chunk warning remains |
| Web | `yarn lint` | Pass — 0 errors, 162 warnings |
| Web | `yarn code:deps` | Pass — 288 modules, 1410 dependencies |
| Web | `yarn code:unused` | Pass; 7 exported API/domain contract type findings remain report-only |
| Root | `node tools/check-architecture.mjs` | Pass; remaining grandfathered concentration warnings are listed above |
| macOS | signed `xcodebuild ... build` | Pass |
| macOS | signed `OfflineStoreTests` | Pass |
| macOS | `scripts/code-health.sh` | Pass; SwiftLint and Periphery skipped because tools are not installed |

The Gym exercise-library extraction was validated on 2026-08-14:

| Area | Check | Result |
| --- | --- | --- |
| Web | `ExerciseLibraryPage.tsx` concentration | Reduced from 30.4 KB to 4.5 KB; create/edit fields, image handling, and exercise history moved to focused Gym components |
| Web | `yarn test` | Pass — 63 files, 322 tests |
| Web | `yarn typecheck` | Pass |
| Web | `yarn build` | Pass; existing large-chunk warning remains |
| Web | `yarn lint` | Pass — 0 errors, 160 warnings |
| Web | `yarn code:deps` | Pass — 291 modules, 1429 dependencies |
| Web | `yarn code:unused` | Pass; 7 exported API/domain contract type findings remain report-only |
| Root | `node tools/check-architecture.mjs` | Pass; remaining grandfathered concentration warnings are listed above |

The Task → Focus server-boundary slice was validated on 2026-08-14:

| Area | Check | Result |
| --- | --- | --- |
| API | focused Prisma tests | Pass — 3 suites, 16 tests |
| API | full Jest suite | Pass — 76 suites, 343 tests |
| API | typecheck/build | Pass |
| API | lint | Pass — 0 errors; existing warnings remain |
| Web | typecheck/tests/lint | Pass — 62 files, 322 tests; 0 lint errors and 158 warnings |

The sync queue policy extraction was validated on 2026-08-14:

| Area | Check | Result |
| --- | --- | --- |
| Web | focused sync tests | Pass — 3 files, 61 tests |
| Web | `yarn test` | Pass — 62 files, 322 tests |
| Web | `yarn typecheck` | Pass |
| Web | `yarn build` | Pass; existing large-chunk warning remains |
| Web | `yarn lint` | Pass — 0 errors, 158 warnings |
| Web | `yarn code:deps` | Pass — 269 modules, 1292 dependencies |
| Web | `yarn code:unused` | Pass; 7 exported API/domain contract type findings remain report-only |
| Root | `node tools/check-architecture.mjs` | Pass; existing grandfathered concentration warnings remain |

The Focus records extraction was validated on 2026-08-14:

| Area | Check | Result |
| --- | --- | --- |
| Web | `FocusPage.tsx` concentration | Reduced from 54.7 KB to 42.7 KB; history presentation moved to `FocusRecordsCard.tsx` |
| Web | `yarn test` | Pass — 63 files, 322 tests |
| Web | `yarn typecheck` | Pass |
| Web | `yarn build` | Pass; existing large-chunk warning remains |
| Web | `yarn lint` | Pass — 0 errors, 157 warnings |
| Web | `yarn code:deps` | Pass — 272 modules, 1303 dependencies |
| Web | `yarn code:unused` | Pass; 7 exported API/domain contract type findings remain report-only |
| Root | `node tools/check-architecture.mjs` | Pass; existing grandfathered concentration warnings remain |

The DeckDetail extraction was validated on 2026-08-14:

| Area | Check | Result |
| --- | --- | --- |
| Web | `DeckDetailPage.tsx` concentration | Reduced from 49.5 KB to 14.9 KB; header, AI generation, card workspace, stats, and move dialog moved to focused deck components |
| Web | `yarn test` | Pass — 63 files, 322 tests |
| Web | `yarn typecheck` | Pass |
| Web | `yarn build` | Pass; existing large-chunk warning remains |
| Web | `yarn lint` | Pass — 0 errors, 160 warnings |
| Web | `yarn code:deps` | Pass — 277 modules, 1339 dependencies |
| Web | `yarn code:unused` | Pass; 7 exported API/domain contract type findings remain report-only |
| Root | `node tools/check-architecture.mjs` | Pass; existing grandfathered concentration warnings remain |

The Focus timer extraction was validated on 2026-08-14:

| Area | Check | Result |
| --- | --- | --- |
| Web | `FocusPage.tsx` concentration | Reduced from 54.7 KB to 21.1 KB; timer/audio/task presentation moved to `FocusTimerCard.tsx` and record editing moved to `FocusRecordEditorDialog.tsx` |
| Web | `yarn test` | Pass — 63 files, 322 tests |
| Web | `yarn typecheck` | Pass |
| Web | `yarn build` | Pass; existing large-chunk warning remains |
| Web | `yarn lint` | Pass — 0 errors, 161 warnings |
| Web | `yarn code:deps` | Pass — 279 modules, 1348 dependencies |
| Web | `yarn code:unused` | Pass; 7 exported API/domain contract type findings remain report-only |
| Root | `node tools/check-architecture.mjs` | Pass; remaining grandfathered concentration warnings are listed above |

The task-detail rendering extraction was validated on 2026-08-14:

| Area | Check | Result |
| --- | --- | --- |
| Web | `TaskDetailModal.tsx` concentration | Reduced from 25.7 KB to 20.8 KB; subtask/tag rendering moved to `TaskDetailSections.tsx` |
| Web | `yarn test` | Pass — 63 files, 322 tests |
| Web | `yarn typecheck` | Pass |
| Web | `yarn build` | Pass; existing large-chunk warning remains |
| Web | `yarn lint` | Pass — 0 errors, 157 warnings |
| Web | `yarn code:deps` | Pass — 271 modules, 1298 dependencies |
| Web | `yarn code:unused` | Pass; 7 exported API/domain contract type findings remain report-only |
| Root | `node tools/check-architecture.mjs` | Pass; existing grandfathered concentration warnings remain |

The Growth cache-boundary extraction was validated on 2026-08-14:

| Area | Check | Result |
| --- | --- | --- |
| Web | focused cache tests | Pass — 2 files, 25 tests |
| Web | `yarn test` | Pass — 63 files, 322 tests |
| Web | `yarn typecheck` | Pass |
| Web | `yarn build` | Pass; existing large-chunk warning remains |
| Web | `yarn lint` | Pass — 0 errors, 158 warnings |
| Web | `yarn code:deps` | Pass — 270 modules, 1293 dependencies |
| Web | `yarn code:unused` | Pass; 7 exported API/domain contract type findings remain report-only |
| Root | `node tools/check-architecture.mjs` | Pass; existing grandfathered concentration warnings remain |

The Statistics usage-surface extraction was validated on 2026-08-14:

| Area | Check | Result |
| --- | --- | --- |
| Web | `StatisticsPage.tsx` concentration | Reduced from 53.9 KB to 24.5 KB; app and website usage surfaces moved to focused statistics components and pure display formatting moved to `statistics.ts` |
| Web | focused statistics tests | Pass — 17 tests |
| Web | `yarn test` | Pass — 63 files, 322 tests |
| Web | `yarn typecheck` | Pass |
| Web | `yarn build` | Pass; existing large-chunk warning remains |
| Web | `yarn lint` | Pass — 0 errors, 163 warnings |
| Web | `yarn code:deps` | Pass — 284 modules, 1384 dependencies |
| Web | `yarn code:unused` | Pass; 7 exported API/domain contract type findings remain report-only |
| Root | `node tools/check-architecture.mjs` | Pass; remaining grandfathered concentration warnings are listed above |
