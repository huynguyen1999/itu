import Foundation

extension OfflineStore {
    @discardableResult
    func saveBudgetCategory(_ value: BudgetCategoryModel, mutation: SyncMutation) throws -> OfflineSnapshot {
        upsert(&state.budgetCategories, value)
        appendMutation(mutation)
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
    func saveExercise(_ value: ExerciseModel, mutation: SyncMutation) throws -> OfflineSnapshot {
        upsert(&state.gymExercises, value)
        appendMutation(mutation)
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
                if change.deleted { state.budgetTransactions.removeAll { $0.id == change.entityId }; continue }
                if let data = change.data, let value = try? decoder.decode(BudgetTransactionModel.self, from: encoder.encode(data)) { upsert(&state.budgetTransactions, value) }
            } else if prefix == "exercisedefinition" {
                if change.deleted { state.gymExercises.removeAll { $0.id == change.entityId }; continue }
                if let data = change.data, let value = try? decoder.decode(ExerciseModel.self, from: encoder.encode(data)) { upsert(&state.gymExercises, value) }
            } else if prefix == "gymworkout" {
                if change.deleted { state.gymWorkouts.removeAll { $0.id == change.entityId }; continue }
                if let data = change.data, let value = try? decoder.decode(WorkoutModel.self, from: encoder.encode(data)) { upsert(&state.gymWorkouts, value) }
            }
        }
    }
}
