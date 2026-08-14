# Plan rendering performance baseline

This is the repeatable measurement sheet for the macOS Plan stress case. The
fixture generator lives in `macos/iTuTests/PlanningPerformanceFixtures.swift`
and includes active and completed/canceled tasks with due dates, reminders,
priorities, descriptions, and Growth metadata coverage.

## Fixtures

| Fixture | Active | Completed/canceled | Groups |
| --- | ---: | ---: | --- |
| Small | 20 | 0 | all expanded |
| Medium | 50 | 0 | all expanded |
| Large | 100 | 0 | all expanded |
| Stress | 200 | 0 | all expanded |
| Mixed | 100 | 100 | all expanded |
| Full mixed | 200 | 200 | all expanded |

Run the same fixtures on the same machine and configuration. Rendering
measurements require a Release/optimized signed build and Instruments; no
runtime values are recorded here until that capture is performed.

## Instrumentation

`AppPerformanceSignposts` emits these Plan events/counters:

- `PlanningViewBody`
- `TaskListViewBody`
- `PlanProjectionBuild`
- `PlanRowPresentationBuild`
- `TaskRow.body`
- `TaskRow.appear`
- `TaskRow.disappear`
- `PlanPaginationAppend`
- `PlanPaginationApply`
- `MainActorSnapshotApply`

The DEBUG logger flushes the corresponding `plan.*` counters every five
seconds. Use signpost intervals plus Animation Hitches and Time Profiler for
navigation, first usable frame, scrolling, and pagination.

## Measurement sheet

| Fixture | Navigation median | First usable frame | Initial mounted rows | Initial row bodies | 10s scroll CPU/hitches | Pagination stall |
| --- | --- | --- | --- | --- | --- | --- |
| 20 active | Not captured | Not captured | Not captured | Not captured | Not captured | Not captured |
| 50 active | Not captured | Not captured | Not captured | Not captured | Not captured | Not captured |
| 100 active | Not captured | Not captured | Not captured | Not captured | Not captured | Not captured |
| 200 active | Not captured | Not captured | Not captured | Not captured | Not captured | Not captured |
| 100 + 100 | Not captured | Not captured | Not captured | Not captured | Not captured | Not captured |
| 200 + 200 | Not captured | Not captured | Not captured | Not captured | Not captured | Not captured |

## Acceptance thresholds

- 200 expanded active tasks: initial mounted rows stay viewport-bounded and
  below the 60-row investigation threshold.
- 50 → 200 active tasks: initial row work stays approximately bounded.
- Continuous scrolling: no repeated task-rendering MainActor stalls over
  50 ms and no sustained hitching.
- Pagination: no perceptible large freeze or task-rendering MainActor stall
  over 50 ms.

The focused projection/presenter tests verify deterministic fixture coverage,
stable flattened IDs, collapse behavior, and metadata/reward preparation.
