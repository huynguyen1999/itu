import Foundation

extension AppModel {
    @MainActor
    func updateBudgetPreferences(patch: [String: JSONValue]) async -> Bool {
        var value = budgetPreferences
        if let currency = patch["defaultCurrency"]?.stringValue { value.defaultCurrency = currency }
        do {
            apply(try await offlineStore.saveBudgetPreferences(value, mutation: mutation(kind: "budgetpreferences.update", entityId: "budgetpreferences", payload: patch)))
            return true
        } catch { return false }
    }

    @MainActor
    func loadBudgetSummary(period: String = iTuCalendarSupport.monthString()) async {
        do { budgetSummary = try await apiClient.getBudgetSummary(period: period) }
        catch { rebuildBudgetSummary(period: period) }
    }

    @MainActor
    func loadBudgetCategories() async {
        guard let values = try? await apiClient.getBudgetCategories() else { return }
        apply(try? await offlineStore.replaceBudgetCategories(values))
    }

    @MainActor
    func loadMonthlyBudget(period: String) async {
        if let value = try? await apiClient.getMonthlyBudget(period: period) {
            apply(try? await offlineStore.saveMonthlyBudget(value))
        }
    }

    @MainActor
    func loadBudgetExpenses(period: String? = nil, categoryID: String? = nil, search: String? = nil, paymentMethod: String? = nil) async {
        if let values = try? await apiClient.getBudgetExpenses(period: period, categoryID: categoryID, paymentMethod: paymentMethod, search: search) {
            apply(try? await offlineStore.replaceExpenses(values))
        }
    }

    @MainActor
    func loadBudgetReport(period: String = iTuCalendarSupport.monthString()) async {
        budgetReport = try? await apiClient.getBudgetReport(period: period)
    }

    @MainActor
    func loadRecurringExpenses() async {
        if let values = try? await apiClient.getRecurringExpenses() {
            apply(try? await offlineStore.replaceRecurringExpenses(values))
        }
    }

    @MainActor
    func createBudgetCategory(name: String, icon: String? = nil, color: String? = nil) async -> Bool {
        let id = ULID.generate()
        let value = ExpenseCategoryModel(id: id, userId: user?.id ?? "", name: name, icon: icon, color: color, sortOrder: expenseCategories.count, archivedAt: nil, version: 1)
        do { apply(try await offlineStore.saveBudgetCategory(value, mutation: mutation(kind: "expensecategory.create", entityId: id, payload: ["name": .string(name), "icon": icon.map(JSONValue.string) ?? .null, "color": color.map(JSONValue.string) ?? .null, "sortOrder": .number(Double(value.sortOrder))]))); return true } catch { return false }
    }

    @MainActor
    func updateBudgetCategory(id: String, name: String, icon: String? = nil, color: String? = nil) async -> Bool {
        guard let old = expenseCategories.first(where: { $0.id == id }) else { return false }
        let value = ExpenseCategoryModel(id: old.id, userId: old.userId, name: name, icon: icon, color: color, sortOrder: old.sortOrder, archivedAt: old.archivedAt, version: (old.version ?? 1) + 1)
        do { apply(try await offlineStore.saveBudgetCategory(value, mutation: mutation(kind: "expensecategory.update", entityId: id, baseVersion: old.version, payload: ["name": .string(name), "icon": icon.map(JSONValue.string) ?? .null, "color": color.map(JSONValue.string) ?? .null]))); return true } catch { return false }
    }

    @MainActor
    func archiveBudgetCategory(id: String) async -> Bool {
        guard let old = expenseCategories.first(where: { $0.id == id }) else { return false }
        let value = ExpenseCategoryModel(id: old.id, userId: old.userId, name: old.name, icon: old.icon, color: old.color, sortOrder: old.sortOrder, archivedAt: ISO8601DateFormatter().string(from: Date()), version: (old.version ?? 1) + 1)
        do { apply(try await offlineStore.saveBudgetCategory(value, mutation: mutation(kind: "expensecategory.archive", entityId: id, baseVersion: old.version, payload: ["archivedAt": .string(value.archivedAt ?? "")]))); return true } catch { return false }
    }

    @MainActor
    func reorderBudgetCategories(_ ids: [String]) async -> Bool {
        let order = Dictionary(uniqueKeysWithValues: ids.enumerated().map { ($1, $0) })
        let updated = expenseCategories.map { category in
            ExpenseCategoryModel(id: category.id, userId: category.userId, name: category.name, icon: category.icon, color: category.color, sortOrder: order[category.id] ?? category.sortOrder, archivedAt: category.archivedAt, version: category.version)
        }
        do { apply(try await offlineStore.replaceBudgetCategories(updated, mutation: mutation(kind: "expensecategory.reorder", entityId: "expensecategories", payload: ["categoryIds": .array(ids.map(JSONValue.string))]))); return true } catch { return false }
    }

    @MainActor
    func createBudgetExpense(amount: String, categoryID: String, merchant: String?, paymentMethod: String, expenseDate: String, note: String?) async -> Bool {
        guard let category = expenseCategories.first(where: { $0.id == categoryID }), let parsed = Double(amount), parsed.isFinite, parsed > 0 else { return false }
        let id = ULID.generate(); let now = ISO8601DateFormatter().string(from: Date())
        let value = ExpenseModel(id: id, userId: user?.id ?? "", amount: parsed, category: category.name, categoryId: categoryID, merchant: merchant, paymentMethod: paymentMethod, expenseDate: expenseDate, note: note, version: 1, createdAt: now, updatedAt: now)
        let payload: [String: JSONValue] = ["amount": .string(amount), "categoryId": .string(categoryID), "merchant": merchant.map(JSONValue.string) ?? .null, "paymentMethod": .string(paymentMethod), "expenseDate": .string(expenseDate), "note": note.map(JSONValue.string) ?? .null]
        do {
            apply(try await offlineStore.saveExpense(value, mutation: mutation(kind: "expense.create", entityId: id, payload: payload)))
            rebuildBudgetSummary(period: String(expenseDate.prefix(7)))
            return true
        } catch { return false }
    }

    @MainActor
    func updateBudgetExpense(id: String, patch: [String: JSONValue]) async -> Bool {
        guard let old = expenses.first(where: { $0.id == id }), let amount = patch["amount"]?.stringValue.flatMap(Double.init) ?? Optional(old.amount), amount > 0,
              let categoryID = patch["categoryId"]?.stringValue ?? Optional(old.categoryId), let category = expenseCategories.first(where: { $0.id == categoryID }) else { return false }
        let now = ISO8601DateFormatter().string(from: Date())
        let value = ExpenseModel(id: old.id, userId: old.userId, amount: amount, category: category.name, categoryId: categoryID, merchant: patch["merchant"]?.stringValue ?? old.merchant, paymentMethod: patch["paymentMethod"]?.stringValue ?? old.paymentMethod, expenseDate: patch["expenseDate"]?.stringValue ?? old.expenseDate, note: patch["note"]?.stringValue ?? old.note, recurringExpenseId: old.recurringExpenseId, recurringOccurrenceDate: old.recurringOccurrenceDate, version: (old.version ?? 1) + 1, createdAt: old.createdAt, updatedAt: now, deletedAt: old.deletedAt, deletedByDeviceId: old.deletedByDeviceId)
        do { apply(try await offlineStore.saveExpense(value, mutation: mutation(kind: "expense.update", entityId: id, baseVersion: old.version, payload: patch))); rebuildBudgetSummary(period: String(value.expenseDate.prefix(7))); return true } catch { return false }
    }

    @MainActor
    func deleteBudgetExpense(id: String) async -> Bool {
        guard let old = expenses.first(where: { $0.id == id }), old.deletedAt == nil else { return false }
        let now = ISO8601DateFormatter().string(from: Date())
        let value = ExpenseModel(id: old.id, userId: old.userId, amount: old.amount, category: old.category, categoryId: old.categoryId, merchant: old.merchant, paymentMethod: old.paymentMethod, expenseDate: old.expenseDate, note: old.note, recurringExpenseId: old.recurringExpenseId, recurringOccurrenceDate: old.recurringOccurrenceDate, version: (old.version ?? 1) + 1, createdAt: old.createdAt, updatedAt: now, deletedAt: now, deletedByDeviceId: old.deletedByDeviceId)
        do { apply(try await offlineStore.saveExpense(value, mutation: mutation(kind: "expense.delete", entityId: id, baseVersion: old.version, payload: ["deletedAt": .string(now)]))); rebuildBudgetSummary(period: String(old.expenseDate.prefix(7))); return true } catch { return false }
    }

    @MainActor
    func restoreBudgetExpense(id: String) async -> Bool {
        guard let old = currentSnapshot.expenses.first(where: { $0.id == id }) else { return false }
        let now = ISO8601DateFormatter().string(from: Date())
        let value = ExpenseModel(id: old.id, userId: old.userId, amount: old.amount, category: old.category, categoryId: old.categoryId, merchant: old.merchant, paymentMethod: old.paymentMethod, expenseDate: old.expenseDate, note: old.note, recurringExpenseId: old.recurringExpenseId, recurringOccurrenceDate: old.recurringOccurrenceDate, version: (old.version ?? 1) + 1, createdAt: old.createdAt, updatedAt: now, deletedAt: nil, deletedByDeviceId: nil)
        do { apply(try await offlineStore.saveExpense(value, mutation: mutation(kind: "expense.restore", entityId: id, baseVersion: old.version))); return true } catch { return false }
    }

    @MainActor
    func updateMonthlyBudget(period: String, overallLimit: String?) async -> Bool {
        guard overallLimit == nil || (Double(overallLimit ?? "") ?? -1) >= 0 else { return false }
        let old = monthlyBudgets.first(where: { $0.period == period })
        let value = MonthlyBudgetModel(id: old?.id ?? ULID.generate(), userId: old?.userId ?? user?.id ?? "", period: period, overallLimit: overallLimit.flatMap(Double.init), categoryLimits: old?.categoryLimits ?? [], version: (old?.version ?? 1) + 1)
        do { apply(try await offlineStore.saveMonthlyBudget(value, mutation: mutation(kind: "monthlybudget.update", entityId: value.id, baseVersion: old?.version, payload: ["period": .string(period), "overallLimit": overallLimit.map(JSONValue.string) ?? .null]))); rebuildBudgetSummary(period: period); return true } catch { return false }
    }

    @MainActor
    func updateBudgetCategoryLimit(period: String, categoryID: String, limit: String) async -> Bool {
        guard let parsed = Double(limit), parsed.isFinite, parsed >= 0 else { return false }
        let monthly = monthlyBudgets.first(where: { $0.period == period }) ?? MonthlyBudgetModel(id: ULID.generate(), userId: user?.id ?? "", period: period, overallLimit: nil)
        let limitValue = CategoryBudgetLimitModel(id: "\(monthly.id):\(categoryID)", monthlyBudgetId: monthly.id, categoryId: categoryID, limit: parsed)
        let updated = MonthlyBudgetModel(id: monthly.id, userId: monthly.userId, period: monthly.period, overallLimit: monthly.overallLimit, categoryLimits: monthly.categoryLimits.filter { $0.categoryId != categoryID } + [limitValue], version: monthly.version)
        do {
            if monthlyBudgets.first(where: { $0.period == period }) == nil {
                _ = try await offlineStore.saveMonthlyBudget(updated, mutation: mutation(kind: "monthlybudget.update", entityId: monthly.id, payload: ["period": .string(period), "overallLimit": .null]))
            }
            apply(try await offlineStore.saveMonthlyBudget(updated, mutation: mutation(kind: "categorybudget.upsert", entityId: limitValue.id, payload: ["period": .string(period), "categoryId": .string(categoryID), "limit": .string(limit)])))
            rebuildBudgetSummary(period: period); return true
        } catch { return false }
    }

    @MainActor
    func deleteBudgetCategoryLimit(period: String, categoryID: String) async -> Bool {
        guard let monthly = monthlyBudgets.first(where: { $0.period == period }) else { return false }
        let updated = MonthlyBudgetModel(id: monthly.id, userId: monthly.userId, period: monthly.period, overallLimit: monthly.overallLimit, categoryLimits: monthly.categoryLimits.filter { $0.categoryId != categoryID }, version: monthly.version)
        do { apply(try await offlineStore.saveMonthlyBudget(updated, mutation: mutation(kind: "categorybudget.delete", entityId: "\(monthly.id):\(categoryID)", payload: ["period": .string(period), "categoryId": .string(categoryID)]))); rebuildBudgetSummary(period: period); return true } catch { return false }
    }

    @MainActor
    func createRecurringExpense(name: String?, categoryID: String, amount: String, merchant: String?, paymentMethod: String, note: String?, frequency: String, startDate: String) async -> Bool {
        guard let category = expenseCategories.first(where: { $0.id == categoryID }), let parsed = Double(amount), parsed.isFinite, parsed > 0 else { return false }
        let id = ULID.generate()
        let value = RecurringExpenseModel(id: id, userId: user?.id ?? "", name: name, categoryId: categoryID, category: category.name, amount: parsed, merchant: merchant, paymentMethod: paymentMethod, note: note, frequency: frequency, startDate: startDate, nextDueDate: startDate, isActive: true, archivedAt: nil, version: 1)
        let payload: [String: JSONValue] = ["name": name.map(JSONValue.string) ?? .null, "categoryId": .string(categoryID), "amount": .string(amount), "merchant": merchant.map(JSONValue.string) ?? .null, "paymentMethod": .string(paymentMethod), "note": note.map(JSONValue.string) ?? .null, "frequency": .string(frequency), "startDate": .string(startDate)]
        do { apply(try await offlineStore.saveRecurringExpense(value, mutation: mutation(kind: "recurringexpense.create", entityId: id, payload: payload))); return true } catch { return false }
    }

    @MainActor
    func updateRecurringExpense(id: String, patch: [String: JSONValue]) async -> Bool {
        guard let old = recurringExpenses.first(where: { $0.id == id }), let categoryID = patch["categoryId"]?.stringValue ?? Optional(old.categoryId), let category = expenseCategories.first(where: { $0.id == categoryID }) else { return false }
        let value = RecurringExpenseModel(id: old.id, userId: old.userId, name: patch["name"]?.stringValue ?? old.name, categoryId: categoryID, category: category.name, amount: patch["amount"]?.stringValue.flatMap(Double.init) ?? old.amount, merchant: patch["merchant"]?.stringValue ?? old.merchant, paymentMethod: patch["paymentMethod"]?.stringValue ?? old.paymentMethod, note: patch["note"]?.stringValue ?? old.note, frequency: patch["frequency"]?.stringValue ?? old.frequency, startDate: patch["startDate"]?.stringValue ?? old.startDate, nextDueDate: patch["nextDueDate"]?.stringValue ?? old.nextDueDate, isActive: patch["isActive"]?.boolValue ?? old.isActive, archivedAt: old.archivedAt, version: (old.version ?? 1) + 1)
        do { apply(try await offlineStore.saveRecurringExpense(value, mutation: mutation(kind: "recurringexpense.update", entityId: id, baseVersion: old.version, payload: patch))); return true } catch { return false }
    }

    @MainActor
    func confirmRecurringExpense(id: String) async -> Bool {
        guard let old = recurringExpenses.first(where: { $0.id == id && $0.isActive && $0.archivedAt == nil }), let category = expenseCategories.first(where: { $0.id == old.categoryId }) else { return false }
        let occurrenceDate = String(old.nextDueDate.prefix(10))
        let now = ISO8601DateFormatter().string(from: Date())
        let expense = ExpenseModel(id: ULID.generate(), userId: old.userId, amount: old.amount, category: category.name, categoryId: old.categoryId, merchant: old.merchant, paymentMethod: old.paymentMethod, expenseDate: occurrenceDate, note: old.note, recurringExpenseId: old.id, recurringOccurrenceDate: occurrenceDate, version: 1, createdAt: now, updatedAt: now)
        let updated = RecurringExpenseModel(id: old.id, userId: old.userId, name: old.name, categoryId: old.categoryId, category: old.category, amount: old.amount, merchant: old.merchant, paymentMethod: old.paymentMethod, note: old.note, frequency: old.frequency, startDate: old.startDate, nextDueDate: nextRecurringDate(current: occurrenceDate, frequency: old.frequency, anchor: String(old.startDate.prefix(10))), isActive: old.isActive, archivedAt: old.archivedAt, version: (old.version ?? 1) + 1)
        do { apply(try await offlineStore.saveExpense(expense)); apply(try await offlineStore.saveRecurringExpense(updated, mutation: mutation(kind: "recurringexpense.confirm", entityId: id, baseVersion: old.version, payload: ["occurrenceDate": .string(occurrenceDate), "expenseId": .string(expense.id)]))); rebuildBudgetSummary(period: String(occurrenceDate.prefix(7))); return true } catch { return false }
    }

    @MainActor
    func skipRecurringExpense(id: String) async -> Bool {
        guard let old = recurringExpenses.first(where: { $0.id == id && $0.isActive && $0.archivedAt == nil }) else { return false }
        let occurrenceDate = String(old.nextDueDate.prefix(10))
        let value = RecurringExpenseModel(id: old.id, userId: old.userId, name: old.name, categoryId: old.categoryId, category: old.category, amount: old.amount, merchant: old.merchant, paymentMethod: old.paymentMethod, note: old.note, frequency: old.frequency, startDate: old.startDate, nextDueDate: nextRecurringDate(current: occurrenceDate, frequency: old.frequency, anchor: String(old.startDate.prefix(10))), isActive: old.isActive, archivedAt: old.archivedAt, version: (old.version ?? 1) + 1)
        do { apply(try await offlineStore.saveRecurringExpense(value, mutation: mutation(kind: "recurringexpense.skip", entityId: id, baseVersion: old.version, payload: ["occurrenceDate": .string(occurrenceDate)]))); return true } catch { return false }
    }

    @MainActor
    func archiveRecurringExpense(id: String) async -> Bool {
        guard let old = recurringExpenses.first(where: { $0.id == id }) else { return false }
        let value = RecurringExpenseModel(id: old.id, userId: old.userId, name: old.name, categoryId: old.categoryId, category: old.category, amount: old.amount, merchant: old.merchant, paymentMethod: old.paymentMethod, note: old.note, frequency: old.frequency, startDate: old.startDate, nextDueDate: old.nextDueDate, isActive: false, archivedAt: ISO8601DateFormatter().string(from: Date()), version: (old.version ?? 1) + 1)
        do { apply(try await offlineStore.saveRecurringExpense(value, mutation: mutation(kind: "recurringexpense.archive", entityId: id, baseVersion: old.version))); return true } catch { return false }
    }

    @MainActor
    func rebuildBudgetSummary(period: String) {
        let monthExpenses = expenses.filter { $0.deletedAt == nil && String($0.expenseDate.prefix(7)) == period }
        let spent = monthExpenses.reduce(0) { $0 + $1.amount }
        let monthly = monthlyBudgets.first(where: { $0.period == period })
        let previous = previousBudgetPeriod(period)
        let previousSpent = expenses.filter { $0.deletedAt == nil && String($0.expenseDate.prefix(7)) == previous }.reduce(0) { $0 + $1.amount }
        let categoryRows = expenseCategories.map { category in
            let categorySpent = monthExpenses.filter { $0.categoryId == category.id }.reduce(0) { $0 + $1.amount }
            let limit = monthly?.categoryLimits.first(where: { $0.categoryId == category.id })?.limit
            return BudgetCategorySummaryModel(id: category.id, name: category.name, spent: categorySpent, limit: limit, remaining: limit.map { $0 - categorySpent }, percentage: limit.map { $0 > 0 ? categorySpent / $0 * 100 : 0 })
        }.sorted { $0.spent > $1.spent }
        let change = spent - previousSpent
        let due = recurringExpenses.filter { $0.isActive && $0.archivedAt == nil && $0.nextDueDate <= ISO8601DateFormatter().string(from: Date()) }
        budgetSummary = BudgetSummaryModel(period: period, spent: spent, overallLimit: monthly?.overallLimit, remaining: monthly?.overallLimit.map { $0 - spent }, previousSpent: previousSpent, changeAmount: change, changePercentage: previousSpent == 0 ? nil : change / previousSpent * 100, categories: categoryRows, recentExpenses: Array(monthExpenses.sorted { ($0.expenseDate, $0.createdAt ?? "") > ($1.expenseDate, $1.createdAt ?? "") }.prefix(10)), dueRecurring: due)
    }

    private func mutation(kind: String, entityId: String, baseVersion: Int? = nil, payload: [String: JSONValue] = [:]) -> SyncMutation {
        SyncMutation(id: ULID.generate(), kind: kind, entityId: entityId, baseVersion: baseVersion, payload: payload, occurredAt: ISO8601DateFormatter().string(from: Date()))
    }

    private func previousBudgetPeriod(_ period: String) -> String {
        let parts = period.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 2, let date = Calendar(identifier: .gregorian).date(from: DateComponents(year: parts[0], month: parts[1], day: 1)), let previous = Calendar(identifier: .gregorian).date(byAdding: .month, value: -1, to: date) else { return period }
        let formatter = DateFormatter(); formatter.calendar = Calendar(identifier: .gregorian); formatter.dateFormat = "yyyy-MM"; return formatter.string(from: previous)
    }

    private func nextRecurringDate(current: String, frequency: String, anchor: String) -> String {
        let formatter = DateFormatter(); formatter.calendar = Calendar(identifier: .gregorian); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.timeZone = TimeZone(secondsFromGMT: 0); formatter.dateFormat = "yyyy-MM-dd"
        guard let value = formatter.date(from: current), let anchorDate = formatter.date(from: anchor) else { return current }
        var calendar = Calendar(identifier: .gregorian); calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        if frequency == "WEEKLY" { return formatter.string(from: calendar.date(byAdding: .day, value: 7, to: value) ?? value) }
        if frequency == "YEARLY" {
            let components = calendar.dateComponents([.year, .month, .day], from: value)
            let targetYear = (components.year ?? 0) + 1
            let month = components.month ?? 1
            let anchorDay = calendar.component(.day, from: anchorDate)
            let maxDay = calendar.range(of: .day, in: .month, for: calendar.date(from: DateComponents(year: targetYear, month: month, day: 1))!)!.count
            return formatter.string(from: calendar.date(from: DateComponents(year: targetYear, month: month, day: min(anchorDay, maxDay))) ?? value)
        }
        let nextMonth = calendar.date(byAdding: .month, value: 1, to: value) ?? value
        let components = calendar.dateComponents([.year, .month], from: nextMonth)
        let anchorDay = calendar.component(.day, from: anchorDate)
        let first = calendar.date(from: DateComponents(year: components.year, month: components.month, day: 1))!
        let maxDay = calendar.range(of: .day, in: .month, for: first)!.count
        return formatter.string(from: calendar.date(from: DateComponents(year: components.year, month: components.month, day: min(anchorDay, maxDay))) ?? value)
    }
}

private extension AppModel {
    func apply(_ snapshot: OfflineSnapshot?) {
        if let snapshot { apply(snapshot) }
    }
}
