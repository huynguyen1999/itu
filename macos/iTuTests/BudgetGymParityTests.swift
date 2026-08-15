import Foundation
import XCTest
@testable import iTu

final class BudgetGymParityTests: XCTestCase {
    func testStatisticsAggregateContractsDecodeEmptyRanges() throws {
        let budgetData = #"{"from":"2026-08-01","to":"2026-08-03","spent":"0.00","expenseCount":0,"previousSpent":"0.00","changeAmount":"0.00","trend":[]}"#.data(using: .utf8)!
        let budget = try JSONDecoder().decode(BudgetStatisticsModel.self, from: budgetData)
        XCTAssertEqual(budget.expenseCount, 0)
        XCTAssertEqual(budget.trend, [])

        let gymData = #"{"range":"CUSTOM","totalWorkouts":0,"totalWorkingSets":0,"totalVolumeKg":0,"totalTrainingMinutes":0,"totalPRs":0,"muscleDistribution":{},"weeklyTrend":[]}"#.data(using: .utf8)!
        let gym = try JSONDecoder().decode(GymAnalyticsModel.self, from: gymData)
        XCTAssertEqual(gym.totalWorkouts, 0)
        XCTAssertEqual(gym.weeklyTrend, [])
    }

    func testExpenseMoneyDecimalStringsDecode() throws {
        let data = #"{"id":"expense-1","userId":"u","amount":"12.30","category":"Food","categoryId":"food","merchant":null,"paymentMethod":"CASH","expenseDate":"2026-08-10","note":null,"version":1}"#.data(using: .utf8)!
        let value = try JSONDecoder().decode(ExpenseModel.self, from: data)
        XCTAssertEqual(value.amount, 12.3, accuracy: 0.001)
    }

    func testBudgetSummaryDecodesDecimalMetricsAndCategoryRows() throws {
        let data = #"{"period":"2026-08","spent":"250000.50","overallLimit":"900000.00","remaining":"649999.50","previousSpent":"300000.00","changeAmount":"-49999.50","changePercentage":"-16.6665","categories":[{"category":{"id":"food","userId":"u","name":"Food","icon":"food","color":"TEAL","sortOrder":0,"archivedAt":null,"version":1},"spent":"250000.50","limit":"400000.00","remaining":"149999.50","percentage":"62.6"}],"recentExpenses":[],"dueRecurring":[]}"#.data(using: .utf8)!
        let value = try JSONDecoder().decode(BudgetSummaryModel.self, from: data)
        XCTAssertEqual(value.spent, 250_000.5, accuracy: 0.001)
        XCTAssertEqual(value.categories.first?.name, "Food")
        XCTAssertEqual(value.categories.first?.remaining ?? 0, 149_999.5, accuracy: 0.001)
    }

    func testMonthlyBudgetDecodesDecimalLimitForHydrationCache() throws {
        let data = #"{"id":"period-2026-08","userId":"u","period":"2026-08","overallLimit":"900000.00","categoryLimits":[],"version":2}"#.data(using: .utf8)!
        let value = try JSONDecoder().decode(MonthlyBudgetModel.self, from: data)
        XCTAssertEqual(value.period, "2026-08")
        XCTAssertEqual(value.overallLimit ?? 0, 900_000, accuracy: 0.001)
    }

    func testBudgetReportDecodesCategoryBreakdownAndTopCategoryCounts() throws {
        let data = #"{"period":"2026-08","spendingOverTime":[],"categoryBreakdown":[{"categoryId":"food","category":"Food","amount":"12.30","percentage":100}],"monthlyOutflow":[],"previousMonthComparison":{"current":"12.30","previous":"0.00","difference":"12.30","percentage":null},"topMerchants":[],"topCategories":[{"categoryId":"food","category":"Food","amount":"12.30","count":2}]}"#.data(using: .utf8)!
        let value = try JSONDecoder().decode(BudgetReportModel.self, from: data)
        XCTAssertEqual(value.categoryBreakdown.first?.percentage, 100)
        XCTAssertEqual(value.topCategories.first?.count, 2)
    }

    func testPendingExpenseSurvivesRestartAndStaleReplacement() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("iTu-budget-parity-\(UUID().uuidString)", isDirectory: true)
        let local = ExpenseModel(
            id: "expense-local", userId: "u", amount: 125, category: "Food", categoryId: "food", merchant: nil,
            paymentMethod: "CASH", expenseDate: "2026-08-10", note: nil,
            version: 1, createdAt: nil, updatedAt: nil
        )
        let mutation = SyncMutation(
            id: "mutation-local", kind: "expense.create", entityId: local.id,
            baseVersion: nil, payload: ["amount": .string("125")],
            occurredAt: "2026-08-10T00:00:00Z"
        )
        let store = OfflineStore(accountID: "budget-parity", baseURL: root)
        _ = try await store.load()
        _ = try await store.saveExpense(local, mutation: mutation)

        let restarted = OfflineStore(accountID: "budget-parity", baseURL: root)
        _ = try await restarted.load()
        let stale = ExpenseModel(
            id: local.id, userId: local.userId, amount: 1, category: local.category, categoryId: local.categoryId,
            merchant: local.merchant, paymentMethod: local.paymentMethod,
            expenseDate: local.expenseDate, note: local.note, version: 1,
            createdAt: local.createdAt, updatedAt: local.updatedAt
        )
        let snapshot = try await restarted.replaceExpenses([stale])
        XCTAssertEqual(snapshot.expenses.first?.amount, 125)
        XCTAssertEqual(snapshot.mutations.last?.kind, "expense.create")
    }

    @MainActor
    func testBudgetLimitValidationRejectsNegativeAndNonfiniteValues() async {
        let model = AppModel()
        let negative = await model.updateMonthlyBudget(period: "2026-08", overallLimit: "-1")
        let nonfinite = await model.updateMonthlyBudget(period: "2026-08", overallLimit: "nan")
        let categoryNonfinite = await model.updateBudgetCategoryLimit(period: "2026-08", categoryID: "food", limit: "infinity")
        XCTAssertFalse(negative)
        XCTAssertFalse(nonfinite)
        XCTAssertFalse(categoryNonfinite)
    }

    func testRestTimerStartsAndStopsLocally() {
        var timer = GymRestTimer()
        timer.start(seconds: 120)
        XCTAssertTrue(timer.isRunning)
        timer.adjust(by: 15)
        XCTAssertGreaterThan(timer.remaining, 120 - 1)
        timer.adjust(by: -200)
        XCTAssertFalse(timer.isRunning)
        timer.stop()
        XCTAssertFalse(timer.isRunning)
    }

    func testGymPreferencesHideRPEByDefault() {
        XCTAssertFalse(GymPreferencesModel().showRpe)
    }

    @MainActor
    func testReopenQueuesUpdateInsteadOfCompleteMutation() async {
        let set = WorkoutSetModel(id: "set-reopen", workoutExerciseId: "exercise-reopen", sortOrder: 0, type: "NORMAL", reps: 8, weight: 20, durationSeconds: nil, distanceMeters: nil, rpe: nil, completedAt: "2026-08-11T00:00:00Z")
        let exercise = WorkoutExerciseModel(id: "exercise-reopen", workoutEntryId: "workout-reopen", exerciseId: "press", sortOrder: 0, note: nil, restSeconds: 60, exercise: nil, sets: [set])
        let workout = WorkoutModel(id: "workout-reopen", userId: "u", title: "Press", status: "IN_PROGRESS", startedAt: "2026-08-11T00:00:00Z", endedAt: nil, durationMinutes: nil, exercises: [exercise], version: 1, deletedAt: nil)
        let model = AppModel()
        model.gymWorkouts = [workout]
        _ = try? await model.offlineStore.load()
        _ = try? await model.offlineStore.saveWorkout(
            workout,
            mutation: SyncMutation(
                id: "workout-reopen-seed",
                kind: "workout.create",
                entityId: workout.id,
                baseVersion: nil,
                payload: ["status": .string(workout.status)],
                occurredAt: workout.startedAt ?? "2026-08-11T00:00:00Z"
            )
        )
        let reopened = await model.updateGymSet(workoutID: workout.id, workoutExerciseID: exercise.id, setID: set.id, patch: ["completedAt": .null], complete: false)
        XCTAssertTrue(reopened)
        let mutation = await model.offlineStore.snapshot().mutations.last(where: { $0.entityId == set.id })
        XCTAssertEqual(mutation?.kind, "workout-set.update")
        XCTAssertEqual(mutation?.payload["completedAt"], .null)
    }

    @MainActor
    func testFinishKeepsCompletedSetsAndDropsDraftSetsAndExercises() async {
        let workoutID = "workout-finish-(UUID().uuidString)"
        let completedSet = WorkoutSetModel(id: "set-completed-(workoutID)", workoutExerciseId: "exercise-completed-(workoutID)", sortOrder: 0, type: "NORMAL", reps: 8, weight: 20, durationSeconds: nil, distanceMeters: nil, rpe: nil, completedAt: "2026-08-11T00:30:00Z")
        let draftSet = WorkoutSetModel(id: "set-draft-(workoutID)", workoutExerciseId: "exercise-completed-(workoutID)", sortOrder: 1, type: "NORMAL", reps: nil, weight: nil, durationSeconds: nil, distanceMeters: nil, rpe: nil, completedAt: nil)
        let completedExercise = WorkoutExerciseModel(id: "exercise-completed-(workoutID)", workoutEntryId: workoutID, exerciseId: "press", sortOrder: 0, note: nil, restSeconds: 60, exercise: nil, sets: [completedSet, draftSet])
        let emptyExercise = WorkoutExerciseModel(id: "exercise-empty-(workoutID)", workoutEntryId: workoutID, exerciseId: "row", sortOrder: 1, note: nil, restSeconds: 60, exercise: nil, sets: [WorkoutSetModel(id: "set-empty-(workoutID)", workoutExerciseId: "exercise-empty-(workoutID)", sortOrder: 0, type: "NORMAL", reps: nil, weight: nil, durationSeconds: nil, distanceMeters: nil, rpe: nil, completedAt: nil)])
        let workout = WorkoutModel(id: workoutID, userId: "u", title: "Press", status: "IN_PROGRESS", startedAt: "2026-08-11T00:00:00Z", endedAt: nil, durationMinutes: nil, exercises: [completedExercise, emptyExercise], version: 1, deletedAt: nil)
        let model = AppModel()
        model.gymWorkouts = [workout]
        _ = try? await model.offlineStore.load()
        _ = try? await model.offlineStore.saveWorkout(workout, mutation: SyncMutation(id: "workout-finish-create", kind: "workout.create", entityId: workout.id, baseVersion: nil, payload: ["title": .string(workout.title), "startedAt": .string(workout.startedAt!)], occurredAt: workout.startedAt!))

        let completed = await model.completeGymWorkout(id: workout.id)
        XCTAssertTrue(completed)
        let finished = model.gymWorkouts.first(where: { $0.id == workoutID })
        XCTAssertEqual(finished?.status, "COMPLETED")
        XCTAssertEqual(finished?.exercises?.count, 1)
        XCTAssertEqual(finished?.exercises?.first?.sets?.count, 1)
        let mutation = await model.offlineStore.snapshot().mutations.last
        XCTAssertEqual(mutation?.kind, "workout.finish")
    }

    func testGymStatsContractDecodesServerFieldNames() throws {
        let data = #"{"heaviestWeight":"100.5","bestVolumeSet":"804.0","estimated1RM":"127.3","totalSets":3,"lastPerformedAt":"2026-08-10T00:00:00Z","recentSets":[{"id":"set-1","workoutExerciseId":"exercise-1","sortOrder":0,"type":"NORMAL","reps":8,"weight":"100.5","durationSeconds":null,"distanceMeters":null,"rpe":"8.5","completedAt":"2026-08-10T00:00:00Z","version":2,"deletedAt":null}]}"#.data(using: .utf8)!
        let value = try JSONDecoder().decode(ExerciseStatsModel.self, from: data)
        XCTAssertEqual(value.bestWeight ?? 0, 100.5, accuracy: 0.001)
        XCTAssertEqual(value.estimated1RM ?? 0, 127.3, accuracy: 0.001)
        XCTAssertEqual(value.totalSets, 3)
        XCTAssertEqual(value.recentSets.first?.completedAt, "2026-08-10T00:00:00Z")
        XCTAssertNil(value.bestReps)
        XCTAssertEqual(value.volumeTrend, [])
        XCTAssertNil(value.exercise)
    }

    func testGymWorkoutDecodeAcceptsInProgressAndWorkoutIdAlias() throws {
        let data = #"{"id":"workout-1","userId":"u","title":"Morning","status":"IN_PROGRESS","startedAt":"2026-08-10T00:00:00Z","endedAt":null,"durationMinutes":null,"version":1,"deletedAt":null,"exercises":[{"id":"exercise-1","workoutId":"workout-1","exerciseId":"push-ups","sortOrder":0,"note":null,"restSeconds":60,"exercise":null,"sets":[]}] }"#.data(using: .utf8)!
        let value = try JSONDecoder().decode(WorkoutModel.self, from: data)
        XCTAssertEqual(value.status, "IN_PROGRESS")
        XCTAssertEqual(value.exercises?.first?.workoutEntryId, "workout-1")
    }

    func testPendingGymChildrenSurviveStaleWorkoutReplacement() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("iTu-gym-parity-\(UUID().uuidString)", isDirectory: true)
        let workoutID = "workout-local"
        let exerciseID = "workout-exercise-local"
        let setID = "workout-set-local"
        let workout = WorkoutModel(id: workoutID, userId: "u", title: "Morning", status: "IN_PROGRESS", startedAt: "2026-08-10T00:00:00Z", endedAt: nil, durationMinutes: nil, exercises: [], version: 1, deletedAt: nil)
        let exercise = WorkoutExerciseModel(id: exerciseID, workoutEntryId: workoutID, exerciseId: "push-ups", sortOrder: 0, note: nil, restSeconds: 60, exercise: nil, sets: [])
        let set = WorkoutSetModel(id: setID, workoutExerciseId: exerciseID, sortOrder: 0, type: "NORMAL", reps: 12, weight: nil, durationSeconds: nil, distanceMeters: nil, rpe: 8, completedAt: nil)
        let store = OfflineStore(accountID: "gym-parity", baseURL: root)
        _ = try await store.load()
        _ = try await store.saveWorkout(workout, mutation: SyncMutation(id: "workout-mutation", kind: "workout.create", entityId: workoutID, baseVersion: nil, payload: ["status": .string("IN_PROGRESS")], occurredAt: workout.startedAt ?? "2026-08-10T00:00:00Z"))
        _ = try await store.saveWorkoutExercise(exercise, workoutID: workoutID, mutation: SyncMutation(id: "exercise-mutation", kind: "workout-exercise.create", entityId: exerciseID, baseVersion: nil, payload: ["workoutId": .string(workoutID), "exerciseId": .string("push-ups")], occurredAt: workout.startedAt ?? "2026-08-10T00:00:00Z"))
        _ = try await store.saveWorkoutSet(set, workoutID: workoutID, mutation: SyncMutation(id: "set-mutation", kind: "workout-set.create", entityId: setID, baseVersion: nil, payload: ["workoutExerciseId": .string(exerciseID), "reps": .number(12)], occurredAt: workout.startedAt ?? "2026-08-10T00:00:00Z"))

        let restarted = OfflineStore(accountID: "gym-parity", baseURL: root)
        _ = try await restarted.load()
        let stale = WorkoutModel(id: workoutID, userId: "u", title: "Morning", status: "IN_PROGRESS", startedAt: workout.startedAt, endedAt: nil, durationMinutes: nil, exercises: [], version: 1, deletedAt: nil)
        let snapshot = try await restarted.replaceGymWorkouts([stale])
        let restoredSet = snapshot.gymWorkouts.first?.exercises?.first?.sets?.first
        XCTAssertEqual(restoredSet?.id, setID)
        XCTAssertEqual(restoredSet?.reps, 12)
    }

    func testPendingGymRoutineChildrenSurviveStaleRoutineReplacement() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("iTu-gym-routine-parity-\(UUID().uuidString)", isDirectory: true)
        let exercise = ExerciseModel(id: "press", userId: "u", name: "Press", normalizedName: "press", description: nil, imageStorageKey: nil, imageUrl: nil, metricType: "WEIGHT_REPS", equipment: nil, primaryMuscleGroup: "Chest", secondaryMuscleGroups: nil, defaultWeightUnit: "KG", defaultRestSeconds: 60, archivedAt: nil, deletedAt: nil, version: 1)
        let routine = RoutineModel(id: "routine-local", userId: "u", name: "Push", exercises: [RoutineExerciseModel(id: "routine-exercise-local", routineId: "routine-local", exerciseId: exercise.id, sortOrder: 0, setCount: 4, exercise: exercise)])
        let store = OfflineStore(accountID: "gym-routine-parity", baseURL: root)
        _ = try await store.load()
        _ = try await store.saveGymRoutine(routine, mutations: [
            SyncMutation(id: "routine-create", kind: "gymroutine.create", entityId: routine.id, baseVersion: nil, payload: ["name": .string("Push")], occurredAt: "2026-08-10T00:00:00Z"),
            SyncMutation(id: "routine-exercise-create", kind: "gymroutineexercise.create", entityId: "routine-exercise-local", baseVersion: nil, payload: ["routineId": .string(routine.id), "exerciseId": .string(exercise.id), "setCount": .number(4)], occurredAt: "2026-08-10T00:00:00Z")
        ])

        let restarted = OfflineStore(accountID: "gym-routine-parity", baseURL: root)
        _ = try await restarted.load()
        let stale = RoutineModel(id: routine.id, userId: "u", name: "Push", exercises: [])
        let snapshot = try await restarted.replaceGymRoutines([stale])
        XCTAssertEqual(snapshot.gymRoutines.first?.exercises?.first?.id, "routine-exercise-local")
        XCTAssertEqual(snapshot.gymRoutines.first?.exercises?.first?.setCount, 4)
    }

    func testGymUpdateCompactionPreservesPerFieldEditClocks() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("iTu-gym-clocks-\(UUID().uuidString)", isDirectory: true)
        let store = OfflineStore(accountID: "gym-clocks", baseURL: root)
        _ = try await store.load()
        await store.appendMutation(SyncMutation(
            id: "workout-update-1", kind: "workout.update", entityId: "workout-1",
            baseVersion: 1, baseValues: ["title": .string("Old")],
            payload: ["title": .string("Push")],
            fieldEditedAt: ["title": "2026-08-11T01:00:00Z"],
            occurredAt: "2026-08-11T01:00:00Z"
        ))
        await store.appendMutation(SyncMutation(
            id: "workout-update-2", kind: "workout.update", entityId: "workout-1",
            baseVersion: 2, baseValues: ["startedAt": .string("2026-08-11T00:00:00Z")],
            payload: ["startedAt": .string("2026-08-11T01:01:00Z")],
            fieldEditedAt: ["startedAt": "2026-08-11T01:01:00Z"],
            occurredAt: "2026-08-11T01:01:00Z"
        ))
        let mutation = await store.snapshot().mutations.first
        XCTAssertEqual(mutation?.payload["title"]?.stringValue, "Push")
        XCTAssertEqual(mutation?.payload["startedAt"]?.stringValue, "2026-08-11T01:01:00Z")
        XCTAssertEqual(mutation?.fieldEditedAt?["title"], "2026-08-11T01:00:00Z")
        XCTAssertEqual(mutation?.fieldEditedAt?["startedAt"], "2026-08-11T01:01:00Z")
    }

    func testPendingWorkoutUpdateCannotCompleteWorkoutLocally() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("iTu-gym-status-(UUID().uuidString)", isDirectory: true)
        let store = OfflineStore(accountID: "gym-status", baseURL: root)
        _ = try await store.load()
        await store.appendMutation(SyncMutation(
            id: "workout-status-update", kind: "workout.update", entityId: "workout-status",
            baseVersion: 1, payload: ["status": .string("COMPLETED")], occurredAt: "2026-08-11T01:00:00Z"
        ))

        let workout = WorkoutModel(
            id: "workout-status", userId: "u", title: "Morning", status: "IN_PROGRESS",
            startedAt: "2026-08-11T00:00:00Z", endedAt: nil, durationMinutes: nil,
            exercises: [], version: 1, deletedAt: nil
        )
        let snapshot = try await store.replaceGymWorkouts([workout])
        XCTAssertEqual(snapshot.gymWorkouts.first?.status, "IN_PROGRESS")
    }

    func testRemoteGymChildDeletesRemoveNestedValues() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("iTu-gym-child-delete-\(UUID().uuidString)", isDirectory: true)
        let workout = WorkoutModel(
            id: "workout-1", userId: "u", title: "Day", status: "COMPLETED",
            startedAt: "2026-08-10T00:00:00Z", endedAt: "2026-08-10T01:00:00Z", durationMinutes: 60,
            exercises: [WorkoutExerciseModel(
                id: "exercise-1", workoutEntryId: "workout-1", exerciseId: "push-ups", sortOrder: 0,
                note: nil, restSeconds: 60, exercise: nil,
                sets: [WorkoutSetModel(id: "set-1", workoutExerciseId: "exercise-1", sortOrder: 0, type: "NORMAL", reps: 10, weight: nil, durationSeconds: nil, distanceMeters: nil, rpe: nil, completedAt: "2026-08-10T00:30:00Z")]
            )], version: 2, deletedAt: nil
        )
        let store = OfflineStore(accountID: "gym-child-delete", baseURL: root)
        _ = try await store.load()
        _ = try await store.saveWorkout(workout, mutation: SyncMutation(id: "workout-create", kind: "workout.create", entityId: workout.id, baseVersion: nil, payload: [:], occurredAt: workout.startedAt!))
        _ = try await store.applyBudgetGymChanges([SyncChange(cursor: nil, entityType: "workout-set", entityId: "set-1", deleted: true, data: nil, complete: true)])
        let afterSetDelete = await store.snapshot()
        XCTAssertTrue(afterSetDelete.gymWorkouts.first?.exercises?.first?.sets?.isEmpty == true)
        _ = try await store.applyBudgetGymChanges([SyncChange(cursor: nil, entityType: "workout-exercise", entityId: "exercise-1", deleted: true, data: nil, complete: true)])
        let afterExerciseDelete = await store.snapshot()
        XCTAssertTrue(afterExerciseDelete.gymWorkouts.first?.exercises?.isEmpty == true)
    }
}
