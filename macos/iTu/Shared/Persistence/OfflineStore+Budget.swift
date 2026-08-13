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

    @discardableResult
    func permanentlyRemoveBudgetTransaction(id: String) throws -> OfflineSnapshot {
        state.budgetTransactions.removeAll { $0.id == id }
        state.mutations.removeAll { $0.entityId == id && ($0.kind == "budgettransaction.delete" || $0.kind == "budgettransaction.restore") }
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

    private func upsert<Value: Identifiable>(_ values: inout [Value], _ value: Value) where Value.ID: Equatable {
        if let index = values.firstIndex(where: { $0.id == value.id }) { values[index] = value } else { values.append(value) }
    }
    /// Synchronization keeps this facade stable while domain-specific change
    /// application lives beside the corresponding persistence operations.
    func applyBudgetGymChanges(_ changes: [SyncChange]) throws {
        let pending = Set(state.mutations.map { "\($0.kind.split(separator: ".").first ?? ""):\($0.entityId)" })
        applyBudgetChanges(changes, pending: pending)
        applyGymChanges(changes, pending: pending)
        reapplyPendingGranularGymMutations()
    }

    private func applyBudgetChanges(_ changes: [SyncChange], pending: Set<String>) {
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
            }
        }
    }
}
