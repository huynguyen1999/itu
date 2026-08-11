import Foundation

extension OfflineStore {
    /// Cache server-side Trash rows without replacing active feature data. A
    /// pending local mutation wins over a stale server snapshot, so an offline
    /// delete/restore remains visible across refreshes and restarts.
    @discardableResult
    func cacheTrashItems(_ trash: TrashSnapshotModel) throws -> OfflineSnapshot {
        let mutations = state.mutations
        cacheTrashRows(&state.journalNotes, serverRows: trash.journalEntries, pendingIDs: pendingIDs(in: mutations, kinds: ["journal.delete", "journal.restore"]), deletedAt: { $0.deletedAt })
        cacheTrashRows(&state.budgetTransactions, serverRows: trash.budgetTransactions, pendingIDs: pendingIDs(in: mutations, kinds: ["budgettransaction.delete", "budgettransaction.restore"]), deletedAt: { $0.deletedAt })
        cacheTrashRows(&state.gymWorkouts, serverRows: trash.gymWorkouts, pendingIDs: pendingIDs(in: mutations, kinds: ["gymworkout.delete", "gymworkout.restore"]), deletedAt: { $0.deletedAt })
        cacheTrashRows(&state.gymExercises, serverRows: trash.gymExercises, pendingIDs: pendingIDs(in: mutations, kinds: ["exercisedefinition.delete", "exercisedefinition.restore"]), deletedAt: { $0.deletedAt })
        try persist()
        return state
    }

    private func pendingIDs(in mutations: [SyncMutation], kinds: Set<String>) -> Set<String> {
        Set(mutations.lazy.filter { kinds.contains($0.kind) }.map(\.entityId))
    }

    private func cacheTrashRows<Value: Identifiable>(_ values: inout [Value], serverRows: [Value], pendingIDs: Set<String>, deletedAt: (Value) -> String?) where Value.ID == String {
        let serverIDs = Set(serverRows.map(\.id))
        values.removeAll { value in
            return deletedAt(value) != nil && !serverIDs.contains(value.id) && !pendingIDs.contains(value.id)
        }
        for row in serverRows where deletedAt(row) != nil { upsert(&values, row) }
    }

    @discardableResult
    func saveBudgetCategory(_ value: BudgetCategoryModel, mutation: SyncMutation) throws -> OfflineSnapshot {
        upsert(&state.budgetCategories, value)
        appendMutation(mutation)
        try persist()
        return state
    }

    @discardableResult
    func replaceBudgetCategories(_ values: [BudgetCategoryModel]) throws -> OfflineSnapshot {
        let optimistic = Dictionary(uniqueKeysWithValues: state.budgetCategories.map { ($0.id, $0) })
        let pendingIDs = Set(state.mutations.filter { $0.kind.hasPrefix("moneycategory.") }.map(\.entityId))
        let fetchedIDs = Set(values.map(\.id))
        state.budgetCategories = values + state.budgetCategories.filter { pendingIDs.contains($0.id) && !fetchedIDs.contains($0.id) }
        reapplyPendingBudgetMetadataMutations(optimisticCategoriesByID: optimistic)
        try persist()
        return state
    }

    @discardableResult
    func saveBudgetPeriod(_ value: BudgetPeriodModel, mutation: SyncMutation) throws -> OfflineSnapshot {
        upsert(&state.budgetPeriods, value)
        appendMutation(mutation)
        try persist()
        return state
    }

    @discardableResult
    func saveBudgetTransaction(_ value: BudgetTransactionModel, mutation: SyncMutation) throws -> OfflineSnapshot {
        upsert(&state.budgetTransactions, value)
        appendMutation(mutation)
        try persist()
        return state
    }

    @discardableResult
    func replaceBudgetTransactions(_ values: [BudgetTransactionModel]) throws -> OfflineSnapshot {
        let optimistic = Dictionary(uniqueKeysWithValues: state.budgetTransactions.map { ($0.id, $0) })
        let pendingIDs = Set(state.mutations.filter { $0.kind.hasPrefix("budgettransaction.") }.map(\.entityId))
        let fetchedIDs = Set(values.map(\.id))
        state.budgetTransactions = values + state.budgetTransactions.filter { pendingIDs.contains($0.id) && !fetchedIDs.contains($0.id) }
        reapplyPendingBudgetTransactionMutations(optimisticByID: optimistic)
        try persist()
        return state
    }

    @discardableResult
    func saveExercise(_ value: ExerciseModel, mutation: SyncMutation) throws -> OfflineSnapshot {
        upsert(&state.gymExercises, value)
        appendMutation(mutation)
        try persist()
        return state
    }

    @discardableResult
    func replaceGymExercises(_ values: [ExerciseModel]) throws -> OfflineSnapshot {
        let optimistic = Dictionary(uniqueKeysWithValues: state.gymExercises.map { ($0.id, $0) })
        let pendingIDs = Set(state.mutations.filter { $0.kind == "exercisedefinition.create" || $0.kind == "exercisedefinition.delete" || $0.kind == "exercisedefinition.restore" || $0.kind == "exercisedefinition.update" }.map(\.entityId))
        let fetchedIDs = Set(values.map(\.id))
        state.gymExercises = values + state.gymExercises.filter { pendingIDs.contains($0.id) && !fetchedIDs.contains($0.id) }
        reapplyPendingGymExerciseMutations(optimisticByID: optimistic)
        try persist()
        return state
    }

    @discardableResult
    func saveWorkout(_ value: WorkoutModel, mutation: SyncMutation) throws -> OfflineSnapshot {
        upsert(&state.gymWorkouts, value)
        appendMutation(mutation)
        try persist()
        return state
    }

    /// Granular Gym writes keep the parent aggregate optimistic while the
    /// outbox carries a stable child mutation. This is deliberately one actor
    /// transaction so a restart cannot expose a set without its queued change.
    @discardableResult
    func saveWorkoutExercise(_ value: WorkoutExerciseModel, workoutID: String, mutation: SyncMutation) throws -> OfflineSnapshot {
        guard let index = state.gymWorkouts.firstIndex(where: { $0.id == workoutID }) else { throw NSError(domain: "OfflineStore", code: 404) }
        let workout = state.gymWorkouts[index]
        var exercises = workout.exercises ?? []
        upsert(&exercises, value)
        state.gymWorkouts[index] = WorkoutModel(id: workout.id, userId: workout.userId, title: workout.title, status: workout.status, startedAt: workout.startedAt, endedAt: workout.endedAt, durationMinutes: workout.durationMinutes, exercises: exercises.sorted { $0.sortOrder < $1.sortOrder }, version: workout.version, deletedAt: workout.deletedAt, deletedByDeviceId: workout.deletedByDeviceId)
        appendMutation(mutation)
        try persist()
        return state
    }

    @discardableResult
    func saveWorkoutSet(_ value: WorkoutSetModel, workoutID: String, mutation: SyncMutation) throws -> OfflineSnapshot {
        guard let workoutIndex = state.gymWorkouts.firstIndex(where: { $0.id == workoutID }) else { throw NSError(domain: "OfflineStore", code: 404) }
        let workout = state.gymWorkouts[workoutIndex]
        var exercises = workout.exercises ?? []
        guard let exerciseIndex = exercises.firstIndex(where: { $0.id == value.workoutExerciseId }) else { throw NSError(domain: "OfflineStore", code: 404) }
        let exercise = exercises[exerciseIndex]
        var sets = exercise.sets ?? []
        upsert(&sets, value)
        exercises[exerciseIndex] = WorkoutExerciseModel(id: exercise.id, workoutEntryId: exercise.workoutEntryId, exerciseId: exercise.exerciseId, sortOrder: exercise.sortOrder, note: exercise.note, restSeconds: exercise.restSeconds, exercise: exercise.exercise, sets: sets.sorted { $0.sortOrder < $1.sortOrder }, version: exercise.version, deletedAt: exercise.deletedAt)
        state.gymWorkouts[workoutIndex] = WorkoutModel(id: workout.id, userId: workout.userId, title: workout.title, status: workout.status, startedAt: workout.startedAt, endedAt: workout.endedAt, durationMinutes: workout.durationMinutes, exercises: exercises, version: workout.version, deletedAt: workout.deletedAt, deletedByDeviceId: workout.deletedByDeviceId)
        appendMutation(mutation)
        try persist()
        return state
    }

    @discardableResult
    func removeWorkoutExercise(id: String, workoutID: String, mutation: SyncMutation) throws -> OfflineSnapshot {
        guard let index = state.gymWorkouts.firstIndex(where: { $0.id == workoutID }) else { throw NSError(domain: "OfflineStore", code: 404) }
        let workout = state.gymWorkouts[index]
        let exercises = (workout.exercises ?? []).filter { $0.id != id }
        state.gymWorkouts[index] = WorkoutModel(id: workout.id, userId: workout.userId, title: workout.title, status: workout.status, startedAt: workout.startedAt, endedAt: workout.endedAt, durationMinutes: workout.durationMinutes, exercises: exercises, version: workout.version, deletedAt: workout.deletedAt, deletedByDeviceId: workout.deletedByDeviceId)
        appendMutation(mutation)
        try persist()
        return state
    }

    @discardableResult
    func removeWorkoutSet(id: String, workoutID: String, workoutExerciseID: String, mutation: SyncMutation) throws -> OfflineSnapshot {
        guard let workoutIndex = state.gymWorkouts.firstIndex(where: { $0.id == workoutID }) else { throw NSError(domain: "OfflineStore", code: 404) }
        let workout = state.gymWorkouts[workoutIndex]
        var exercises = workout.exercises ?? []
        guard let exerciseIndex = exercises.firstIndex(where: { $0.id == workoutExerciseID }) else { throw NSError(domain: "OfflineStore", code: 404) }
        let exercise = exercises[exerciseIndex]
        exercises[exerciseIndex] = WorkoutExerciseModel(id: exercise.id, workoutEntryId: exercise.workoutEntryId, exerciseId: exercise.exerciseId, sortOrder: exercise.sortOrder, note: exercise.note, restSeconds: exercise.restSeconds, exercise: exercise.exercise, sets: (exercise.sets ?? []).filter { $0.id != id }, version: exercise.version, deletedAt: exercise.deletedAt)
        state.gymWorkouts[workoutIndex] = WorkoutModel(id: workout.id, userId: workout.userId, title: workout.title, status: workout.status, startedAt: workout.startedAt, endedAt: workout.endedAt, durationMinutes: workout.durationMinutes, exercises: exercises, version: workout.version, deletedAt: workout.deletedAt, deletedByDeviceId: workout.deletedByDeviceId)
        appendMutation(mutation)
        try persist()
        return state
    }

    @discardableResult
    func replaceGymWorkouts(_ values: [WorkoutModel]) throws -> OfflineSnapshot {
        let optimistic = Dictionary(uniqueKeysWithValues: state.gymWorkouts.map { ($0.id, $0) })
        let pendingIDs = Set(state.mutations.filter {
            $0.kind == "workout.create" || $0.kind == "workout.update" || $0.kind == "workout.finish"
                || $0.kind == "gymworkout.create" || $0.kind == "gymworkout.update"
                || $0.kind == "gymworkout.delete" || $0.kind == "gymworkout.restore"
        }.map(\.entityId))
        let pendingWorkoutIDs = pendingIDs.union(pendingGranularGymWorkoutIDs(optimisticByID: optimistic))
        let fetchedIDs = Set(values.map(\.id))
        state.gymWorkouts = values + state.gymWorkouts.filter { pendingWorkoutIDs.contains($0.id) && !fetchedIDs.contains($0.id) }
        reapplyPendingGymWorkoutMutations(optimisticByID: optimistic)
        reapplyPendingGranularGymMutations(optimisticByID: optimistic)
        try persist()
        return state
    }

    /// Replays local budget transaction writes over a stale server response.
    /// The optimistic row is retained for pending creates so a refresh cannot
    /// erase a transaction that has not reached the server yet.
    internal func reapplyPendingBudgetTransactionMutations(optimisticByID: [String: BudgetTransactionModel] = [:]) {
        for mutation in state.mutations where mutation.kind.hasPrefix("budgettransaction.") {
            let current = state.budgetTransactions.first(where: { $0.id == mutation.entityId })
            guard let base = (mutation.kind == "budgettransaction.create" ? optimisticByID[mutation.entityId] : nil) ?? current ?? optimisticByID[mutation.entityId] else { continue }
            let payload = mutation.payload
            let amount = payload["amount"]?.stringValue.flatMap(Double.init).flatMap { $0.isFinite ? $0 : nil } ?? base.amount
            let value = BudgetTransactionModel(
                id: base.id,
                userId: base.userId,
                type: payload["type"]?.stringValue ?? base.type,
                amount: amount,
                currency: payload["currency"]?.stringValue ?? base.currency,
                category: payload["category"]?.stringValue ?? base.category,
                categoryId: payload["categoryId"]?.stringValue ?? base.categoryId,
                merchant: payload["merchant"]?.stringValue ?? base.merchant,
                paymentMethod: payload["paymentMethod"]?.stringValue ?? base.paymentMethod,
                transactionAt: payload["transactionAt"]?.stringValue ?? base.transactionAt,
                note: payload["note"]?.stringValue ?? base.note,
                version: max(base.version ?? 1, (mutation.baseVersion ?? base.version ?? 1) + 1),
                createdAt: base.createdAt,
                updatedAt: mutation.occurredAt,
                deletedAt: mutation.kind == "budgettransaction.delete" ? (payload["deletedAt"]?.stringValue ?? base.deletedAt ?? mutation.occurredAt) : mutation.kind == "budgettransaction.restore" ? nil : base.deletedAt,
                deletedByDeviceId: mutation.kind == "budgettransaction.restore" ? nil : base.deletedByDeviceId
            )
            upsert(&state.budgetTransactions, value)
        }
    }

    internal func reapplyPendingBudgetMetadataMutations(
        optimisticCategoriesByID: [String: BudgetCategoryModel] = [:],
        optimisticPeriodsByID: [String: BudgetPeriodModel] = [:]
    ) {
        for mutation in state.mutations {
            switch mutation.kind {
            case "moneycategory.create", "moneycategory.update":
                let current = state.budgetCategories.first(where: { $0.id == mutation.entityId })
                guard let base = (mutation.kind == "moneycategory.create" ? optimisticCategoriesByID[mutation.entityId] : nil) ?? current ?? optimisticCategoriesByID[mutation.entityId] else { continue }
                let payload = mutation.payload
                let value = BudgetCategoryModel(
                    id: base.id,
                    userId: base.userId,
                    name: payload["name"]?.stringValue ?? base.name,
                    type: payload["type"]?.stringValue ?? base.type,
                    icon: payload["icon"]?.stringValue ?? base.icon,
                    color: payload["color"]?.stringValue ?? base.color,
                    sortOrder: base.sortOrder,
                    archivedAt: payload["archivedAt"]?.stringValue ?? base.archivedAt,
                    version: max(base.version ?? 1, (mutation.baseVersion ?? base.version ?? 1) + 1)
                )
                upsert(&state.budgetCategories, value)
            case "moneycategory.delete":
                state.budgetCategories.removeAll { $0.id == mutation.entityId }
            case "moneybudgetperiod.update":
                let current = state.budgetPeriods.first(where: { $0.id == mutation.entityId || $0.period == mutation.entityId })
                guard let base = current ?? optimisticPeriodsByID[mutation.entityId] else { continue }
                let limit = mutation.payload["overallLimit"]?.stringValue.flatMap(Double.init) ?? base.overallLimit
                let value = BudgetPeriodModel(
                    id: base.id, userId: base.userId, period: base.period,
                    currency: base.currency, overallLimit: limit.isFinite && limit >= 0 ? limit : base.overallLimit,
                    categoryBudgets: base.categoryBudgets,
                    version: max(base.version ?? 1, (mutation.baseVersion ?? base.version ?? 1) + 1)
                )
                upsert(&state.budgetPeriods, value)
            case "moneycategorybudget.upsert":
                guard let period = mutation.payload["period"]?.stringValue,
                      let categoryID = mutation.payload["categoryId"]?.stringValue else { continue }
                guard let index = state.budgetPeriods.firstIndex(where: { $0.period == period || $0.id == period }) else { continue }
                let old = state.budgetPeriods[index]
                let limit = mutation.payload["limit"]?.stringValue.flatMap(Double.init) ?? old.categoryBudgets.first(where: { $0.categoryId == categoryID })?.limit ?? 0
                guard limit.isFinite, limit >= 0 else { continue }
                let categoryBudget = BudgetCategoryBudgetModel(
                    id: "\(period):\(categoryID)", budgetPeriodId: old.id, categoryId: categoryID,
                    limit: limit, category: state.budgetCategories.first(where: { $0.id == categoryID }), version: 1
                )
                let budgets = old.categoryBudgets.filter { $0.categoryId != categoryID } + [categoryBudget]
                state.budgetPeriods[index] = BudgetPeriodModel(id: old.id, userId: old.userId, period: old.period, currency: old.currency, overallLimit: old.overallLimit, categoryBudgets: budgets, version: old.version)
            default:
                continue
            }
        }
    }

    internal func reapplyPendingGymExerciseMutations(optimisticByID: [String: ExerciseModel] = [:]) {
        let kinds = ["exercisedefinition.create", "exercisedefinition.update", "exercisedefinition.delete", "exercisedefinition.restore"]
        for mutation in state.mutations where kinds.contains(mutation.kind) {
            let current = state.gymExercises.first(where: { $0.id == mutation.entityId })
            guard let base = (mutation.kind == "exercisedefinition.create" ? optimisticByID[mutation.entityId] : nil) ?? current ?? optimisticByID[mutation.entityId] else { continue }
            let payload = mutation.payload
            let value = ExerciseModel(
                id: base.id,
                userId: base.userId,
                name: payload["name"]?.stringValue ?? base.name,
                normalizedName: (payload["name"]?.stringValue ?? base.name).lowercased(),
                description: payload["description"]?.stringValue ?? base.description,
                imageStorageKey: base.imageStorageKey,
                imageUrl: base.imageUrl,
                metricType: payload["metricType"]?.stringValue ?? base.metricType,
                equipment: payload["equipment"]?.stringValue ?? base.equipment,
                primaryMuscleGroup: payload["primaryMuscleGroup"]?.stringValue ?? base.primaryMuscleGroup,
                secondaryMuscleGroups: base.secondaryMuscleGroups,
                defaultWeightUnit: payload["defaultWeightUnit"]?.stringValue ?? base.defaultWeightUnit,
                defaultRestSeconds: payload["defaultRestSeconds"]?.numberValue.map(Int.init) ?? base.defaultRestSeconds,
                archivedAt: mutation.kind == "exercisedefinition.delete" ? (payload["deletedAt"]?.stringValue ?? base.archivedAt ?? mutation.occurredAt) : mutation.kind == "exercisedefinition.restore" ? nil : payload["archivedAt"]?.stringValue ?? base.archivedAt,
                deletedAt: mutation.kind == "exercisedefinition.delete" ? (payload["deletedAt"]?.stringValue ?? base.deletedAt ?? mutation.occurredAt) : mutation.kind == "exercisedefinition.restore" ? nil : base.deletedAt,
                version: max(base.version ?? 1, (mutation.baseVersion ?? base.version ?? 1) + 1),
                deletedByDeviceId: mutation.kind == "exercisedefinition.restore" ? nil : base.deletedByDeviceId
            )
            upsert(&state.gymExercises, value)
        }
    }

    /// Replays pending Gym workout mutations over a stale server response.
    /// Nested exercises remain attached to optimistic creates while field-level
    /// updates merge into the latest server aggregate.
    internal func reapplyPendingGymWorkoutMutations(optimisticByID: [String: WorkoutModel] = [:]) {
        let kinds = ["workout.create", "workout.update", "workout.finish", "gymworkout.create", "gymworkout.update", "gymworkout.delete", "gymworkout.restore"]
        for mutation in state.mutations where kinds.contains(mutation.kind) {
            let current = state.gymWorkouts.first(where: { $0.id == mutation.entityId })
            guard var base = (mutation.kind == "workout.create" || mutation.kind == "gymworkout.create" ? optimisticByID[mutation.entityId] : nil) ?? current ?? optimisticByID[mutation.entityId] else { continue }
            let payload = mutation.payload
            let status = mutation.kind == "workout.finish" ? "COMPLETED" : base.status
            let value = WorkoutModel(
                id: base.id,
                userId: base.userId,
                title: payload["title"]?.stringValue ?? base.title,
                status: status,
                startedAt: payload["startedAt"]?.stringValue ?? base.startedAt,
                endedAt: payload["endedAt"]?.stringValue ?? base.endedAt,
                durationMinutes: payload["durationMinutes"]?.numberValue.map(Int.init) ?? base.durationMinutes,
                exercises: base.exercises,
                version: max(base.version ?? 1, (mutation.baseVersion ?? base.version ?? 1) + 1),
                deletedAt: mutation.kind == "gymworkout.delete" ? (payload["deletedAt"]?.stringValue ?? base.deletedAt ?? mutation.occurredAt) : mutation.kind == "gymworkout.restore" ? nil : base.deletedAt,
                deletedByDeviceId: mutation.kind == "gymworkout.restore" ? nil : base.deletedByDeviceId
            )
            base = value
            upsert(&state.gymWorkouts, base)
        }
    }

    /// Replays child mutations after a reconnect or restart. The server's
    /// workout list can predate a pending child write, so the optimistic
    /// nested row must survive replacement of its parent aggregate.
    internal func reapplyPendingGranularGymMutations(optimisticByID: [String: WorkoutModel] = [:]) {
        for mutation in state.mutations where isGranularGymMutation(mutation.kind) {
            guard let workoutID = granularGymWorkoutID(for: mutation, optimisticByID: optimisticByID),
                  let workoutIndex = state.gymWorkouts.firstIndex(where: { $0.id == workoutID }) else { continue }

            let workout = state.gymWorkouts[workoutIndex]
            var exercises = workout.exercises ?? []
            if mutation.kind.hasPrefix("workout-exercise.") || mutation.kind.hasPrefix("workoutexercise.") || mutation.kind.hasPrefix("workout_exercise.") {
                let existingIndex = exercises.firstIndex { $0.id == mutation.entityId }
                let fallback = optimisticByID[workoutID]?.exercises?.first { $0.id == mutation.entityId }
                if mutation.kind.hasSuffix(".delete") {
                    exercises.removeAll { $0.id == mutation.entityId }
                } else if mutation.kind.hasSuffix(".create") {
                    guard let value = fallback ?? granularExerciseValue(mutation) else { continue }
                    if let existingIndex { exercises[existingIndex] = value } else { exercises.append(value) }
                } else if let base = (existingIndex.map { exercises[$0] } ?? fallback) {
                    let payload = mutation.payload
                    let value = WorkoutExerciseModel(
                        id: base.id,
                        workoutEntryId: base.workoutEntryId,
                        exerciseId: payload["exerciseId"]?.stringValue ?? base.exerciseId,
                        sortOrder: payload["sortOrder"]?.numberValue.map(Int.init) ?? base.sortOrder,
                        note: patchedString(payload, key: "note", current: base.note),
                        restSeconds: payload["restSeconds"]?.numberValue.map(Int.init) ?? base.restSeconds,
                        exercise: base.exercise,
                        sets: base.sets,
                        version: max(base.version ?? 1, (mutation.baseVersion ?? base.version ?? 1) + 1),
                        deletedAt: base.deletedAt
                    )
                    if let existingIndex { exercises[existingIndex] = value } else { exercises.append(value) }
                }
                state.gymWorkouts[workoutIndex] = WorkoutModel(id: workout.id, userId: workout.userId, title: workout.title, status: workout.status, startedAt: workout.startedAt, endedAt: workout.endedAt, durationMinutes: workout.durationMinutes, exercises: exercises.sorted { $0.sortOrder < $1.sortOrder }, version: workout.version, deletedAt: workout.deletedAt, deletedByDeviceId: workout.deletedByDeviceId)
                continue
            }

            guard let workoutExerciseID = mutation.payload["workoutExerciseId"]?.stringValue ?? exercises.first(where: { $0.sets?.contains(where: { $0.id == mutation.entityId }) == true })?.id,
                  let exerciseIndex = exercises.firstIndex(where: { $0.id == workoutExerciseID }) else { continue }
            let exercise = exercises[exerciseIndex]
            var sets = exercise.sets ?? []
            let existingIndex = sets.firstIndex { $0.id == mutation.entityId }
            let fallback = optimisticByID[workoutID]?.exercises?.first(where: { $0.id == workoutExerciseID })?.sets?.first(where: { $0.id == mutation.entityId })
            if mutation.kind.hasSuffix(".delete") {
                sets.removeAll { $0.id == mutation.entityId }
            } else if mutation.kind.hasSuffix(".create") {
                guard let value = fallback ?? granularSetValue(mutation) else { continue }
                if let existingIndex { sets[existingIndex] = value } else { sets.append(value) }
            } else if let base = (existingIndex.map { sets[$0] } ?? fallback) {
                let payload = mutation.payload
                let value = WorkoutSetModel(
                    id: base.id,
                    workoutExerciseId: base.workoutExerciseId,
                    sortOrder: payload["sortOrder"]?.numberValue.map(Int.init) ?? base.sortOrder,
                    type: payload["type"]?.stringValue ?? base.type,
                    reps: patchedInt(payload, key: "reps", current: base.reps),
                    weight: patchedDouble(payload, key: "weight", current: base.weight),
                    durationSeconds: patchedInt(payload, key: "durationSeconds", current: base.durationSeconds),
                    distanceMeters: patchedDouble(payload, key: "distanceMeters", current: base.distanceMeters),
                    rpe: patchedDouble(payload, key: "rpe", current: base.rpe),
                    completedAt: patchedString(payload, key: "completedAt", current: base.completedAt),
                    version: max(base.version ?? 1, (mutation.baseVersion ?? base.version ?? 1) + 1),
                    deletedAt: base.deletedAt
                )
                if let existingIndex { sets[existingIndex] = value } else { sets.append(value) }
            }
            exercises[exerciseIndex] = WorkoutExerciseModel(id: exercise.id, workoutEntryId: exercise.workoutEntryId, exerciseId: exercise.exerciseId, sortOrder: exercise.sortOrder, note: exercise.note, restSeconds: exercise.restSeconds, exercise: exercise.exercise, sets: sets.sorted { $0.sortOrder < $1.sortOrder }, version: exercise.version, deletedAt: exercise.deletedAt)
            state.gymWorkouts[workoutIndex] = WorkoutModel(id: workout.id, userId: workout.userId, title: workout.title, status: workout.status, startedAt: workout.startedAt, endedAt: workout.endedAt, durationMinutes: workout.durationMinutes, exercises: exercises, version: workout.version, deletedAt: workout.deletedAt, deletedByDeviceId: workout.deletedByDeviceId)
        }
    }

    private func isGranularGymMutation(_ kind: String) -> Bool {
        kind.hasPrefix("workout-exercise.") || kind.hasPrefix("workoutexercise.") || kind.hasPrefix("workout_exercise.")
            || kind.hasPrefix("workout-set.") || kind.hasPrefix("workoutset.") || kind.hasPrefix("workout_set.")
    }

    internal func pendingGranularGymWorkoutIDs(optimisticByID: [String: WorkoutModel]) -> Set<String> {
        Set(state.mutations.filter { isGranularGymMutation($0.kind) }.compactMap { granularGymWorkoutID(for: $0, optimisticByID: optimisticByID) })
    }

    private func granularGymWorkoutID(for mutation: SyncMutation, optimisticByID: [String: WorkoutModel]) -> String? {
        if let workoutID = mutation.payload["workoutId"]?.stringValue { return workoutID }
        let exerciseID = mutation.payload["workoutExerciseId"]?.stringValue
        let allWorkouts = state.gymWorkouts + Array(optimisticByID.values)
        return allWorkouts.first(where: { workout in
            workout.exercises?.contains(where: { exercise in
                exercise.id == (exerciseID ?? mutation.entityId) || exercise.sets?.contains(where: { $0.id == mutation.entityId }) == true
            }) == true
        })?.id
    }

    private func granularExerciseValue(_ mutation: SyncMutation) -> WorkoutExerciseModel? {
        guard let exerciseID = mutation.payload["exerciseId"]?.stringValue else { return nil }
        return WorkoutExerciseModel(id: mutation.entityId, workoutEntryId: mutation.payload["workoutId"]?.stringValue ?? "", exerciseId: exerciseID, sortOrder: mutation.payload["sortOrder"]?.numberValue.map(Int.init) ?? 0, note: mutation.payload["note"]?.stringValue, restSeconds: mutation.payload["restSeconds"]?.numberValue.map(Int.init), exercise: nil, sets: [])
    }

    private func granularSetValue(_ mutation: SyncMutation) -> WorkoutSetModel? {
        guard let workoutExerciseID = mutation.payload["workoutExerciseId"]?.stringValue else { return nil }
        return WorkoutSetModel(id: mutation.entityId, workoutExerciseId: workoutExerciseID, sortOrder: mutation.payload["sortOrder"]?.numberValue.map(Int.init) ?? 0, type: mutation.payload["type"]?.stringValue ?? "NORMAL", reps: mutation.payload["reps"]?.numberValue.map(Int.init), weight: mutation.payload["weight"]?.numberValue, durationSeconds: mutation.payload["durationSeconds"]?.numberValue.map(Int.init), distanceMeters: mutation.payload["distanceMeters"]?.numberValue, rpe: mutation.payload["rpe"]?.numberValue, completedAt: mutation.payload["completedAt"]?.stringValue)
    }

    private func patchedString(_ payload: [String: JSONValue], key: String, current: String?) -> String? {
        guard let value = payload[key] else { return current }
        return value.stringValue
    }

    private func patchedInt(_ payload: [String: JSONValue], key: String, current: Int?) -> Int? {
        guard let value = payload[key] else { return current }
        return value.numberValue.map(Int.init)
    }

    private func patchedDouble(_ payload: [String: JSONValue], key: String, current: Double?) -> Double? {
        guard let value = payload[key] else { return current }
        return value.numberValue
    }

    @discardableResult
    func permanentlyRemoveBudgetTransaction(id: String) throws -> OfflineSnapshot {
        state.budgetTransactions.removeAll { $0.id == id }
        state.mutations.removeAll { $0.entityId == id && ($0.kind == "budgettransaction.delete" || $0.kind == "budgettransaction.restore") }
        try persist()
        return state
    }

    @discardableResult
    func permanentlyRemoveGymWorkout(id: String) throws -> OfflineSnapshot {
        state.gymWorkouts.removeAll { $0.id == id }
        state.mutations.removeAll { $0.entityId == id && ($0.kind == "gymworkout.delete" || $0.kind == "gymworkout.restore") }
        try persist()
        return state
    }

    @discardableResult
    func permanentlyRemoveGymExercise(id: String) throws -> OfflineSnapshot {
        state.gymExercises.removeAll { $0.id == id }
        state.mutations.removeAll { $0.entityId == id && ($0.kind == "exercisedefinition.delete" || $0.kind == "exercisedefinition.restore") }
        try persist()
        return state
    }

    @discardableResult
    func saveBudgetPreferences(_ value: BudgetPreferencesModel, mutation: SyncMutation) throws -> OfflineSnapshot {
        state.budgetPreferences = value
        appendMutation(mutation)
        try persist()
        return state
    }

    @discardableResult
    func saveGymPreferences(_ value: GymPreferencesModel, mutation: SyncMutation) throws -> OfflineSnapshot {
        state.gymPreferences = value
        appendMutation(mutation)
        try persist()
        return state
    }

    @discardableResult
    func queueGymExerciseImage(id: String, data: Data) throws -> OfflineSnapshot {
        state.pendingGymExerciseImages[id] = data
        try persist()
        return state
    }

    @discardableResult
    func removeGymExerciseImage(id: String) throws -> OfflineSnapshot {
        state.pendingGymExerciseImages.removeValue(forKey: id)
        try persist()
        return state
    }

    private func upsert<Value: Identifiable>(_ values: inout [Value], _ value: Value) where Value.ID: Equatable {
        if let index = values.firstIndex(where: { $0.id == value.id }) { values[index] = value } else { values.append(value) }
    }

    func applyBudgetGymChanges(_ changes: [SyncChange]) throws {
        let pending = Set(state.mutations.map { "\($0.kind.split(separator: ".").first ?? ""):\($0.entityId)" })
        for change in changes {
            let prefix = change.entityType.lowercased()
            let key = "\(prefix):\(change.entityId)"
            guard !pending.contains(key) else { continue }
            if prefix == "moneycategory" {
                if change.deleted { state.budgetCategories.removeAll { $0.id == change.entityId }; continue }
                if let data = change.data, let value = try? decoder.decode(BudgetCategoryModel.self, from: encoder.encode(data)) { upsert(&state.budgetCategories, value) }
            } else if prefix == "moneybudgetperiod" {
                if change.deleted { state.budgetPeriods.removeAll { $0.id == change.entityId }; continue }
                if let data = change.data, let value = try? decoder.decode(BudgetPeriodModel.self, from: encoder.encode(data)) { upsert(&state.budgetPeriods, value) }
            } else if prefix == "moneycategorybudget" {
                guard !change.deleted, let data = change.data,
                      let value = try? decoder.decode(BudgetCategoryBudgetModel.self, from: encoder.encode(data)) else { continue }
                let periodID = value.budgetPeriodId
                if let index = state.budgetPeriods.firstIndex(where: { $0.id == periodID }) {
                    let old = state.budgetPeriods[index]
                    let budgets = old.categoryBudgets.filter { $0.id != value.id } + [value]
                    state.budgetPeriods[index] = BudgetPeriodModel(id: old.id, userId: old.userId, period: old.period, currency: old.currency, overallLimit: old.overallLimit, categoryBudgets: budgets, version: old.version)
                }
            } else if prefix == "budgettransaction" {
                if change.deleted {
                    // A server DELETE can be the transport representation of
                    // a soft-delete. Keep a local tombstone until explicit
                    // permanent deletion succeeds.
                    if state.budgetTransactions.first(where: { $0.id == change.entityId })?.deletedAt == nil {
                        state.budgetTransactions.removeAll { $0.id == change.entityId }
                    }
                    continue
                }
                if let data = change.data, let value = try? decoder.decode(BudgetTransactionModel.self, from: encoder.encode(data)) { upsert(&state.budgetTransactions, value) }
            } else if prefix == "exercisedefinition" {
                if change.deleted {
                    if state.gymExercises.first(where: { $0.id == change.entityId })?.deletedAt == nil {
                        state.gymExercises.removeAll { $0.id == change.entityId }
                    }
                    continue
                }
                if let data = change.data, let value = try? decoder.decode(ExerciseModel.self, from: encoder.encode(data)) { upsert(&state.gymExercises, value) }
            } else if prefix == "gymworkout" {
                if change.deleted {
                    if state.gymWorkouts.first(where: { $0.id == change.entityId })?.deletedAt == nil {
                        state.gymWorkouts.removeAll { $0.id == change.entityId }
                    }
                    continue
                }
                if let data = change.data, let value = try? decoder.decode(WorkoutModel.self, from: encoder.encode(data)) { upsert(&state.gymWorkouts, value) }
            } else if prefix == "workout" {
                if change.deleted { state.gymWorkouts.removeAll { $0.id == change.entityId }; continue }
                if let data = change.data, let value = try? decoder.decode(WorkoutModel.self, from: encoder.encode(data)) { upsert(&state.gymWorkouts, value) }
            } else if prefix == "workout-exercise" || prefix == "workoutexercise" {
                if change.deleted {
                    for workoutIndex in state.gymWorkouts.indices {
                        let workout = state.gymWorkouts[workoutIndex]
                        guard let exercises = workout.exercises,
                              exercises.contains(where: { $0.id == change.entityId }) else { continue }
                        let remaining = exercises.filter { $0.id != change.entityId }
                        state.gymWorkouts[workoutIndex] = WorkoutModel(id: workout.id, userId: workout.userId, title: workout.title, status: workout.status, startedAt: workout.startedAt, endedAt: workout.endedAt, durationMinutes: workout.durationMinutes, exercises: remaining, version: workout.version, deletedAt: workout.deletedAt, deletedByDeviceId: workout.deletedByDeviceId)
                    }
                    continue
                }
                guard let data = change.data,
                      let value = try? decoder.decode(WorkoutExerciseModel.self, from: encoder.encode(data)) else { continue }
                let workoutID = value.workoutEntryId
                guard let workoutIndex = state.gymWorkouts.firstIndex(where: { $0.id == workoutID }) else { continue }
                let workout = state.gymWorkouts[workoutIndex]
                var exercises = workout.exercises ?? []
                upsert(&exercises, value)
                state.gymWorkouts[workoutIndex] = WorkoutModel(id: workout.id, userId: workout.userId, title: workout.title, status: workout.status, startedAt: workout.startedAt, endedAt: workout.endedAt, durationMinutes: workout.durationMinutes, exercises: exercises.sorted { $0.sortOrder < $1.sortOrder }, version: workout.version, deletedAt: workout.deletedAt, deletedByDeviceId: workout.deletedByDeviceId)
            } else if prefix == "workout-set" || prefix == "workoutset" {
                if change.deleted {
                    for workoutIndex in state.gymWorkouts.indices {
                        let workout = state.gymWorkouts[workoutIndex]
                        guard var exercises = workout.exercises else { continue }
                        var changed = false
                        for exerciseIndex in exercises.indices {
                            let exercise = exercises[exerciseIndex]
                            guard let sets = exercise.sets, sets.contains(where: { $0.id == change.entityId }) else { continue }
                            let remaining = sets.filter { $0.id != change.entityId }
                            exercises[exerciseIndex] = WorkoutExerciseModel(id: exercise.id, workoutEntryId: exercise.workoutEntryId, exerciseId: exercise.exerciseId, sortOrder: exercise.sortOrder, note: exercise.note, restSeconds: exercise.restSeconds, exercise: exercise.exercise, sets: remaining, version: exercise.version, deletedAt: exercise.deletedAt)
                            changed = true
                        }
                        if changed {
                            state.gymWorkouts[workoutIndex] = WorkoutModel(id: workout.id, userId: workout.userId, title: workout.title, status: workout.status, startedAt: workout.startedAt, endedAt: workout.endedAt, durationMinutes: workout.durationMinutes, exercises: exercises, version: workout.version, deletedAt: workout.deletedAt, deletedByDeviceId: workout.deletedByDeviceId)
                        }
                    }
                    continue
                }
                guard let data = change.data,
                      let value = try? decoder.decode(WorkoutSetModel.self, from: encoder.encode(data)) else { continue }
                for workoutIndex in state.gymWorkouts.indices {
                    let workout = state.gymWorkouts[workoutIndex]
                    guard var exercises = workout.exercises, let exerciseIndex = exercises.firstIndex(where: { $0.id == value.workoutExerciseId }) else { continue }
                    let exercise = exercises[exerciseIndex]
                    var sets = exercise.sets ?? []
                    upsert(&sets, value)
                    exercises[exerciseIndex] = WorkoutExerciseModel(id: exercise.id, workoutEntryId: exercise.workoutEntryId, exerciseId: exercise.exerciseId, sortOrder: exercise.sortOrder, note: exercise.note, restSeconds: exercise.restSeconds, exercise: exercise.exercise, sets: sets.sorted { $0.sortOrder < $1.sortOrder }, version: exercise.version, deletedAt: exercise.deletedAt)
                    state.gymWorkouts[workoutIndex] = WorkoutModel(id: workout.id, userId: workout.userId, title: workout.title, status: workout.status, startedAt: workout.startedAt, endedAt: workout.endedAt, durationMinutes: workout.durationMinutes, exercises: exercises, version: workout.version, deletedAt: workout.deletedAt, deletedByDeviceId: workout.deletedByDeviceId)
                    break
                }
            }
        }
        reapplyPendingGranularGymMutations()
    }
}
