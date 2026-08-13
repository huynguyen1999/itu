import Foundation

extension AppModel {
    @MainActor
    func updateBudgetPreferences(patch: [String: JSONValue]) async -> Bool {
        var value = budgetPreferences
        if let currency = patch["defaultCurrency"]?.stringValue { value.defaultCurrency = currency }
        if let type = patch["defaultTransactionType"]?.stringValue { value.defaultTransactionType = type }
        do { apply(try await offlineStore.saveBudgetPreferences(value, mutation: SyncMutation(id: ULID.generate(), kind: "budgetpreferences.update", entityId: "budgetpreferences", baseVersion: nil, payload: patch, occurredAt: ISO8601DateFormatter().string(from: Date())))); return true } catch { return false }
    }

    @MainActor
    func loadBudgetOverview(period: String? = nil) async {
        do {
            budgetOverview = try await apiClient.getBudgetOverview(period: period)
        } catch {
            // The persisted transaction/category/period snapshot remains visible offline.
            rebuildBudgetOverview(period: period ?? budgetOverview?.period ?? iTuCalendarSupport.monthString())
        }
    }

    @MainActor
    func loadBudgetCategories() async {
        do {
            let fetched = try await apiClient.getBudgetCategories()
            apply(try await offlineStore.replaceBudgetCategories(fetched))
        } catch {
            // Keep the hydrated category list when the API is unavailable.
        }
    }

    @MainActor
    func createBudgetCategory(name: String, type: String, icon: String, color: String) async -> Bool {
        let id = ULID.generate()
        let value = BudgetCategoryModel(id: id, userId: user?.id ?? "", name: name, type: type, icon: icon, color: color, sortOrder: budgetCategories.count, archivedAt: nil, version: 1)
        let mutation = SyncMutation(id: ULID.generate(), kind: "moneycategory.create", entityId: id, baseVersion: nil, payload: ["name": .string(name), "type": .string(type), "icon": .string(icon), "color": .string(color)], occurredAt: ISO8601DateFormatter().string(from: Date()))
        do {
            apply(try await offlineStore.saveBudgetCategory(value, mutation: mutation))
            if let period = budgetOverview?.period { rebuildBudgetOverview(period: period) }
            return true
        } catch {
            return false
        }
    }

    @MainActor
    func updateBudgetCategory(id: String, name: String, type: String, icon: String, color: String) async -> Bool {
        guard let old = budgetCategories.first(where: { $0.id == id }) else { return false }
        let value = BudgetCategoryModel(id: id, userId: old.userId, name: name, type: type, icon: icon, color: color, sortOrder: old.sortOrder, archivedAt: old.archivedAt, version: (old.version ?? 1) + 1)
        let payload: [String: JSONValue] = ["name": .string(name), "type": .string(type), "icon": .string(icon), "color": .string(color)]
        do {
            apply(try await offlineStore.saveBudgetCategory(value, mutation: SyncMutation(id: ULID.generate(), kind: "moneycategory.update", entityId: id, baseVersion: old.version, payload: payload, occurredAt: ISO8601DateFormatter().string(from: Date()))))
            if let period = budgetOverview?.period { rebuildBudgetOverview(period: period) }
            return true
        } catch {
            return false
        }
    }

    @MainActor
    func archiveBudgetCategory(id: String) async -> Bool {
        do {
            guard let old = budgetCategories.first(where: { $0.id == id }) else { return false }
            let value = BudgetCategoryModel(id: old.id, userId: old.userId, name: old.name, type: old.type, icon: old.icon, color: old.color, sortOrder: old.sortOrder, archivedAt: ISO8601DateFormatter().string(from: Date()), version: (old.version ?? 1) + 1)
            apply(try await offlineStore.saveBudgetCategory(value, mutation: SyncMutation(id: ULID.generate(), kind: "moneycategory.delete", entityId: id, baseVersion: old.version, payload: [:], occurredAt: ISO8601DateFormatter().string(from: Date()))))
            if let period = budgetOverview?.period { rebuildBudgetOverview(period: period) }
            return true
        } catch {
            return false
        }
    }

    @MainActor
    func loadBudgetTransactions(period: String? = nil, categoryID: String? = nil, type: String? = nil) async {
        do {
            let fetched = try await apiClient.getBudgetTransactions(period: period, categoryID: categoryID, type: type)
            apply(try await offlineStore.replaceBudgetTransactions(fetched))
        } catch {
            let requestedType = type?.uppercased()
            budgetTransactions = currentSnapshot.budgetTransactions.filter { transaction in
                transaction.deletedAt == nil
                    && (period == nil || budgetTransactionMonth(transaction.transactionAt) == period)
                    && (categoryID == nil || transaction.categoryId == categoryID)
                    && (requestedType == nil || transaction.type.uppercased() == requestedType)
            }
            if budgetOverview == nil, let period { rebuildBudgetOverview(period: period) }
        }
    }

    @MainActor
    func updateBudgetPeriod(period: String, overallLimit: String) async -> Bool {
        let id = budgetPeriods.first(where: { $0.period == period })?.id ?? period
        let old = budgetPeriods.first(where: { $0.period == period })
        guard let parsedLimit = Double(overallLimit.trimmingCharacters(in: .whitespacesAndNewlines)), parsedLimit.isFinite, parsedLimit >= 0 else { return false }
        let value = BudgetPeriodModel(id: id, userId: user?.id ?? "", period: period, currency: budgetPreferences.defaultCurrency, overallLimit: parsedLimit, categoryBudgets: old?.categoryBudgets ?? [], version: (old?.version ?? 1) + 1)
        do {
            apply(try await offlineStore.saveBudgetPeriod(value, mutation: SyncMutation(id: ULID.generate(), kind: "moneybudgetperiod.update", entityId: period, baseVersion: old?.version, payload: ["period": .string(period), "overallLimit": .string(overallLimit)], occurredAt: ISO8601DateFormatter().string(from: Date()))))
            rebuildBudgetOverview(period: period)
            return true
        } catch { return false }
    }

    @MainActor
    func updateBudgetCategoryLimit(period: String, categoryID: String, limit: String) async -> Bool {
        let old = budgetPeriods.first(where: { $0.period == period })
        guard let parsedLimit = Double(limit.trimmingCharacters(in: .whitespacesAndNewlines)), parsedLimit.isFinite, parsedLimit >= 0 else { return false }
        let categoryBudgets = (old?.categoryBudgets ?? []).filter { $0.categoryId != categoryID } + [BudgetCategoryBudgetModel(id: "\(period):\(categoryID)", budgetPeriodId: old?.id ?? period, categoryId: categoryID, limit: parsedLimit, category: budgetCategories.first(where: { $0.id == categoryID }), version: 1)]
        let value = BudgetPeriodModel(id: old?.id ?? period, userId: user?.id ?? "", period: period, currency: old?.currency ?? budgetPreferences.defaultCurrency, overallLimit: old?.overallLimit ?? 0, categoryBudgets: categoryBudgets, version: (old?.version ?? 1) + 1)
        do {
            apply(try await offlineStore.saveBudgetPeriod(value, mutation: SyncMutation(id: ULID.generate(), kind: "moneycategorybudget.upsert", entityId: "\(period):\(categoryID)", baseVersion: old?.version, payload: ["period": .string(period), "categoryId": .string(categoryID), "limit": .string(limit)], occurredAt: ISO8601DateFormatter().string(from: Date()))))
            rebuildBudgetOverview(period: period)
            return true
        } catch { return false }
    }

    @MainActor
    func createBudgetTransaction(amount: String, categoryID: String, type: String = "EXPENSE", merchant: String? = nil, paymentMethod: String = "CASH", transactionAt: String? = nil, note: String? = nil) async -> Bool {
        guard let parsedAmount = Double(amount), parsedAmount.isFinite, parsedAmount > 0, let category = budgetCategories.first(where: { $0.id == categoryID }) else { return false }
        let id = ULID.generate(); let at = transactionAt ?? ISO8601DateFormatter().string(from: Date()); let value = BudgetTransactionModel(id: id, userId: user?.id ?? "", type: type, amount: parsedAmount, currency: budgetPreferences.defaultCurrency, category: category.name, categoryId: categoryID, merchant: merchant, paymentMethod: paymentMethod, transactionAt: at, note: note, version: 1, createdAt: at, updatedAt: at, deletedAt: nil)
        var payload: [String: JSONValue] = ["amount": .string(amount), "currency": .string(value.currency), "type": .string(type), "categoryId": .string(categoryID), "paymentMethod": .string(paymentMethod), "transactionAt": .string(at)]
        payload["merchant"] = merchant.map(JSONValue.string) ?? .null; payload["note"] = note.map(JSONValue.string) ?? .null
        do {
            apply(try await offlineStore.saveBudgetTransaction(value, mutation: SyncMutation(id: ULID.generate(), kind: "budgettransaction.create", entityId: id, baseVersion: nil, payload: payload, occurredAt: at)))
            rebuildBudgetOverview(period: budgetOverview?.period ?? iTuCalendarSupport.monthString())
            return true
        } catch { return false }
    }

    @MainActor
    func updateBudgetTransaction(id: String, patch: [String: JSONValue]) async -> Bool {
        guard let old = budgetTransactions.first(where: { $0.id == id }) else { return false }
        let amount = patch["amount"]?.stringValue.flatMap(Double.init) ?? old.amount
        guard amount.isFinite, amount > 0 else { return false }
        let categoryID = patch["categoryId"]?.stringValue ?? old.categoryId
        let category = categoryID.flatMap { categoryID in budgetCategories.first(where: { $0.id == categoryID }) }
        let categoryName = category?.name ?? patch["category"]?.stringValue ?? old.category
        let merchant = patch["merchant"].map { $0.stringValue } ?? old.merchant
        let note = patch["note"].map { $0.stringValue } ?? old.note
        let value = BudgetTransactionModel(id: old.id, userId: old.userId, type: patch["type"]?.stringValue ?? old.type, amount: amount, currency: patch["currency"]?.stringValue ?? old.currency, category: categoryName, categoryId: categoryID, merchant: merchant, paymentMethod: patch["paymentMethod"]?.stringValue ?? old.paymentMethod, transactionAt: patch["transactionAt"]?.stringValue ?? old.transactionAt, note: note, version: (old.version ?? 1) + 1, createdAt: old.createdAt, updatedAt: ISO8601DateFormatter().string(from: Date()), deletedAt: old.deletedAt)
        do {
            apply(try await offlineStore.saveBudgetTransaction(value, mutation: SyncMutation(id: ULID.generate(), kind: "budgettransaction.update", entityId: id, baseVersion: old.version, payload: patch, occurredAt: ISO8601DateFormatter().string(from: Date()))))
            rebuildBudgetOverview(period: budgetOverview?.period ?? iTuCalendarSupport.monthString())
            return true
        } catch { return false }
    }

    @MainActor
    func deleteBudgetTransaction(id: String) async -> Bool {
        guard let old = currentSnapshot.budgetTransactions.first(where: { $0.id == id }), old.deletedAt == nil else { return false }
        let now = ISO8601DateFormatter().string(from: Date())
        let value = BudgetTransactionModel(id: old.id, userId: old.userId, type: old.type, amount: old.amount, currency: old.currency, category: old.category, categoryId: old.categoryId, merchant: old.merchant, paymentMethod: old.paymentMethod, transactionAt: old.transactionAt, note: old.note, version: (old.version ?? 1) + 1, createdAt: old.createdAt, updatedAt: now, deletedAt: now, deletedByDeviceId: old.deletedByDeviceId)
        let mutation = SyncMutation(id: ULID.generate(), kind: "budgettransaction.delete", entityId: id, baseVersion: old.version, payload: ["deletedAt": .string(now)], occurredAt: now)
        do {
            apply(try await offlineStore.saveBudgetTransaction(value, mutation: mutation))
            syncPhase = .pending
            rebuildBudgetOverview(period: budgetOverview?.period ?? iTuCalendarSupport.monthString())
            return true
        } catch { return false }
    }

    @MainActor
    func rebuildBudgetOverview(period: String) {
        guard let periodModel = budgetPeriods.first(where: { $0.period == period }) else { return }
        let transactions = budgetTransactions.filter { budgetTransactionMonth($0.transactionAt) == period && $0.deletedAt == nil }
        let income = transactions.filter { $0.type.uppercased() == "INCOME" }.reduce(0) { $0 + $1.amount }
        let spentByCategory = transactions.filter { $0.type.uppercased() != "INCOME" }.reduce(into: [String: Double]()) { result, transaction in
            guard let categoryID = transaction.categoryId else { return }
            result[categoryID, default: 0] += transaction.amount
        }
        let spent = spentByCategory.values.reduce(0, +)
        let categoryStats = budgetCategories.filter { $0.archivedAt == nil }.map { category in
            let budget = periodModel.categoryBudgets.first(where: { $0.categoryId == category.id })?.limit ?? 0
            let categorySpent = spentByCategory[category.id] ?? 0
            let remaining = max(0, budget - categorySpent)
            let percentage = budget > 0 ? min(100, (categorySpent / budget) * 100) : 0
            return BudgetCategoryStatModel(category: category, budget: budget, spent: categorySpent, remaining: remaining, percentage: percentage)
        }
        let overallBudget = periodModel.overallLimit
        let overview = BudgetOverviewModel(period: period, currency: periodModel.currency, income: income, spent: spent, overallBudget: overallBudget, remainingBudget: max(0, overallBudget - spent), categories: categoryStats)
        if budgetOverview != overview { budgetOverview = overview }
    }

    private func budgetTransactionMonth(_ value: String) -> String {
        if let date = ISO8601DateFormatter().date(from: value) { return iTuCalendarSupport.monthString(date) }
        return String(value.prefix(7))
    }
}

private extension BudgetOverviewModel {
    init(period: String, currency: String, income: Double, spent: Double, overallBudget: Double, remainingBudget: Double, categories: [BudgetCategoryStatModel]) {
        self.period = period
        self.currency = currency
        self.income = income
        self.spent = spent
        self.overallBudget = overallBudget
        self.remainingBudget = remainingBudget
        self.categories = categories
    }
}

private extension BudgetCategoryStatModel {
    init(category: BudgetCategoryModel, budget: Double, spent: Double, remaining: Double, percentage: Double) {
        self.category = category
        self.budget = budget
        self.spent = spent
        self.remaining = remaining
        self.percentage = percentage
    }
}
