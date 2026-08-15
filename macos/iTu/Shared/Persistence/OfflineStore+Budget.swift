import Foundation

extension OfflineStore {
    @discardableResult
    func cacheTrashItems(_ trash: TrashSnapshotModel) throws -> OfflineSnapshot {
        let mutations = state.mutations
        cacheTrashRows(&state.journalNotes, serverRows: trash.journalEntries, pendingIDs: pendingIDs(in: mutations, kinds: ["journal.delete", "journal.restore"]), deletedAt: { $0.deletedAt })
        cacheTrashRows(&state.expenses, serverRows: trash.expenses, pendingIDs: pendingIDs(in: mutations, kinds: ["expense.delete", "expense.restore"]), deletedAt: { $0.deletedAt })
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
        values.removeAll { deletedAt($0) != nil && !serverIDs.contains($0.id) && !pendingIDs.contains($0.id) }
        for row in serverRows where deletedAt(row) != nil { upsert(&values, row) }
    }

    @discardableResult
    func saveBudgetCategory(_ value: ExpenseCategoryModel, mutation: SyncMutation? = nil) throws -> OfflineSnapshot {
        upsert(&state.expenseCategories, value)
        if let mutation { appendMutation(mutation) }
        try persist(); return state
    }

    @discardableResult
    func replaceBudgetCategories(_ values: [ExpenseCategoryModel], mutation: SyncMutation? = nil) throws -> OfflineSnapshot {
        let pending = Set(state.mutations.filter { $0.kind.hasPrefix("expensecategory.") }.map(\.entityId))
        let pendingValues = state.expenseCategories.filter { pending.contains($0.id) }
        state.expenseCategories = values.filter { !pending.contains($0.id) } + pendingValues
        if let mutation { appendMutation(mutation) }
        try persist(); return state
    }

    @discardableResult
    func saveMonthlyBudget(_ value: MonthlyBudgetModel, mutation: SyncMutation? = nil) throws -> OfflineSnapshot {
        upsert(&state.monthlyBudgets, value)
        if let mutation { appendMutation(mutation) }
        try persist(); return state
    }

    @discardableResult
    func replaceMonthlyBudgets(_ values: [MonthlyBudgetModel]) throws -> OfflineSnapshot {
        let pending = Set(state.mutations.filter { $0.kind.hasPrefix("monthlybudget.") || $0.kind.hasPrefix("categorybudget.") }.map(\.entityId))
        let pendingValues = state.monthlyBudgets.filter { pending.contains($0.id) }
        state.monthlyBudgets = values.filter { !pending.contains($0.id) } + pendingValues
        try persist(); return state
    }

    @discardableResult
    func saveExpense(_ value: ExpenseModel, mutation: SyncMutation? = nil) throws -> OfflineSnapshot {
        upsert(&state.expenses, value)
        if let mutation { appendMutation(mutation) }
        try persist(); return state
    }

    @discardableResult
    func replaceExpenses(_ values: [ExpenseModel]) throws -> OfflineSnapshot {
        let pending = Set(state.mutations.filter { $0.kind.hasPrefix("expense.") }.map(\.entityId))
        let pendingValues = state.expenses.filter { pending.contains($0.id) }
        state.expenses = values.filter { !pending.contains($0.id) } + pendingValues
        try persist(); return state
    }

    @discardableResult
    func saveRecurringExpense(_ value: RecurringExpenseModel, mutation: SyncMutation? = nil) throws -> OfflineSnapshot {
        upsert(&state.recurringExpenses, value)
        if let mutation { appendMutation(mutation) }
        try persist(); return state
    }

    @discardableResult
    func replaceRecurringExpenses(_ values: [RecurringExpenseModel]) throws -> OfflineSnapshot {
        let pending = Set(state.mutations.filter { $0.kind.hasPrefix("recurringexpense.") }.map(\.entityId))
        let pendingValues = state.recurringExpenses.filter { pending.contains($0.id) }
        state.recurringExpenses = values.filter { !pending.contains($0.id) } + pendingValues
        try persist(); return state
    }

    @discardableResult
    func permanentlyRemoveExpense(id: String) throws -> OfflineSnapshot {
        state.expenses.removeAll { $0.id == id }
        state.mutations.removeAll { $0.entityId == id && ($0.kind == "expense.delete" || $0.kind == "expense.restore") }
        try persist(); return state
    }

    @discardableResult
    func saveBudgetPreferences(_ value: BudgetPreferencesModel, mutation: SyncMutation) throws -> OfflineSnapshot {
        state.budgetPreferences = value; appendMutation(mutation); try persist(); return state
    }

    func applyBudgetGymChanges(_ changes: [SyncChange]) throws {
        let pending = Set(state.mutations.map { "\($0.kind.split(separator: ".").first ?? ""):\($0.entityId)" })
        for change in changes {
            let prefix = change.entityType.lowercased()
            guard !pending.contains("\(prefix):\(change.entityId)") else { continue }
            switch prefix {
            case "expensecategory":
                if change.deleted { state.expenseCategories.removeAll { $0.id == change.entityId } }
                else if let data = change.data, let value = try? decoder.decode(ExpenseCategoryModel.self, from: encoder.encode(data)) { upsert(&state.expenseCategories, value) }
            case "monthlybudget":
                if change.deleted { state.monthlyBudgets.removeAll { $0.id == change.entityId } }
                else if let data = change.data, let value = try? decoder.decode(MonthlyBudgetModel.self, from: encoder.encode(data)) { upsert(&state.monthlyBudgets, value) }
            case "categorybudget":
                guard let data = change.data else { continue }
                let object = (try? JSONSerialization.jsonObject(with: encoder.encode(data))) as? [String: Any]
                guard let monthlyBudgetID = object?["monthlyBudgetId"] as? String, let categoryID = object?["categoryId"] as? String else { continue }
                guard let monthlyIndex = state.monthlyBudgets.firstIndex(where: { $0.id == monthlyBudgetID }) else { continue }
                var monthly = state.monthlyBudgets[monthlyIndex]
                if change.deleted {
                    monthly = MonthlyBudgetModel(id: monthly.id, userId: monthly.userId, period: monthly.period, overallLimit: monthly.overallLimit, categoryLimits: monthly.categoryLimits.filter { $0.categoryId != categoryID }, version: monthly.version)
                } else if let value = try? decoder.decode(CategoryBudgetLimitModel.self, from: encoder.encode(data)) {
                    var limits = monthly.categoryLimits.filter { $0.categoryId != value.categoryId }
                    limits.append(value)
                    monthly = MonthlyBudgetModel(id: monthly.id, userId: monthly.userId, period: monthly.period, overallLimit: monthly.overallLimit, categoryLimits: limits, version: monthly.version)
                }
                state.monthlyBudgets[monthlyIndex] = monthly
            case "expense":
                if change.deleted { state.expenses.removeAll { $0.id == change.entityId } }
                else if let data = change.data, let value = try? decoder.decode(ExpenseModel.self, from: encoder.encode(data)) { upsert(&state.expenses, value) }
            case "recurringexpense":
                if change.deleted { state.recurringExpenses.removeAll { $0.id == change.entityId } }
                else if let data = change.data, let value = try? decoder.decode(RecurringExpenseModel.self, from: encoder.encode(data)) { upsert(&state.recurringExpenses, value) }
            case "exercisedefinition", "gymroutine", "gymroutineexercise", "gymworkout", "workout", "workout-exercise", "workoutexercise", "workout-set", "workoutset":
                applyGymChanges([change], pending: pending)
            default: continue
            }
        }
        try persist()
    }

    private func upsert<Value: Identifiable>(_ values: inout [Value], _ value: Value) where Value.ID: Equatable {
        if let index = values.firstIndex(where: { $0.id == value.id }) { values[index] = value } else { values.append(value) }
    }
}
