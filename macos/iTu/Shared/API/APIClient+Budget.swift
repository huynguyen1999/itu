import Foundation

extension APIClient {
    func getBudgetStatistics(from: String, to: String) async throws -> BudgetStatisticsModel {
        try await request(path: "/budget/statistics?from=\(escapedPath(from))&to=\(escapedPath(to))")
    }

    func getBudgetSummary(period: String) async throws -> BudgetSummaryModel {
        try await request(path: "/budget/summary?period=\(escapedPath(period))")
    }

    func getBudgetReport(period: String) async throws -> BudgetReportModel {
        try await request(path: "/budget/reports?period=\(escapedPath(period))")
    }

    func getBudgetCategories() async throws -> [ExpenseCategoryModel] {
        try await request(path: "/budget/categories")
    }

    func createBudgetCategory(name: String, icon: String?, color: String?) async throws -> ExpenseCategoryModel {
        try await request(path: "/budget/categories", method: "POST", body: [
            "name": .string(name), "icon": icon.map(JSONValue.string) ?? .null, "color": color.map(JSONValue.string) ?? .null
        ] as [String: JSONValue])
    }

    func updateBudgetCategory(id: String, name: String, icon: String?, color: String?) async throws -> ExpenseCategoryModel {
        try await request(path: "/budget/categories/\(escapedPath(id))", method: "PATCH", body: [
            "name": .string(name), "icon": icon.map(JSONValue.string) ?? .null, "color": color.map(JSONValue.string) ?? .null
        ] as [String: JSONValue])
    }

    func archiveBudgetCategory(id: String) async throws -> ExpenseCategoryModel {
        try await request(path: "/budget/categories/\(escapedPath(id))", method: "DELETE")
    }

    func reorderBudgetCategories(_ categoryIDs: [String]) async throws -> [ExpenseCategoryModel] {
        try await request(path: "/budget/categories/reorder", method: "PATCH", body: ["categoryIds": .array(categoryIDs.map(JSONValue.string))] as [String: JSONValue])
    }

    func getMonthlyBudget(period: String) async throws -> MonthlyBudgetModel {
        try await request(path: "/budget/months/\(escapedPath(period))")
    }

    func updateMonthlyBudget(period: String, overallLimit: String?) async throws -> MonthlyBudgetModel {
        try await request(path: "/budget/months/\(escapedPath(period))", method: "PUT", body: [
            "overallLimit": overallLimit.map { JSONValue.string(Self.decimalString($0)) } ?? .null
        ] as [String: JSONValue])
    }

    func updateBudgetCategoryLimit(period: String, categoryID: String, limit: String) async throws -> CategoryBudgetLimitModel {
        try await request(path: "/budget/months/\(escapedPath(period))/categories/\(escapedPath(categoryID))", method: "PUT", body: [
            "limit": .string(Self.decimalString(limit))
        ] as [String: JSONValue])
    }

    func deleteBudgetCategoryLimit(period: String, categoryID: String) async throws {
        let _: EmptyResponse = try await request(path: "/budget/months/\(escapedPath(period))/categories/\(escapedPath(categoryID))", method: "DELETE")
    }

    func getBudgetExpenses(period: String? = nil, from: String? = nil, to: String? = nil, categoryID: String? = nil, paymentMethod: String? = nil, search: String? = nil) async throws -> [ExpenseModel] {
        var items: [String] = []
        for (key, value) in [("period", period), ("from", from), ("to", to), ("categoryId", categoryID), ("paymentMethod", paymentMethod), ("search", search)] {
            if let value, let encoded = value.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) { items.append("\(key)=\(encoded)") }
        }
        return try await request(path: items.isEmpty ? "/budget/expenses" : "/budget/expenses?\(items.joined(separator: "&"))")
    }

    func getBudgetExpense(id: String) async throws -> ExpenseModel {
        try await request(path: "/budget/expenses/\(escapedPath(id))")
    }

    func createBudgetExpense(amount: String, categoryID: String, merchant: String?, paymentMethod: String, expenseDate: String, note: String?) async throws -> ExpenseModel {
        try await request(path: "/budget/expenses", method: "POST", body: expenseBody(amount: amount, categoryID: categoryID, merchant: merchant, paymentMethod: paymentMethod, expenseDate: expenseDate, note: note))
    }

    func updateBudgetExpense(id: String, patch: [String: JSONValue]) async throws -> ExpenseModel {
        try await request(path: "/budget/expenses/\(escapedPath(id))", method: "PATCH", body: patch)
    }

    func deleteBudgetExpense(id: String) async throws {
        let _: EmptyResponse = try await request(path: "/budget/expenses/\(escapedPath(id))", method: "DELETE")
    }

    func getRecurringExpenses() async throws -> [RecurringExpenseModel] {
        try await request(path: "/budget/recurring")
    }

    func createRecurringExpense(name: String?, categoryID: String, amount: String, merchant: String?, paymentMethod: String, note: String?, frequency: String, startDate: String) async throws -> RecurringExpenseModel {
        try await request(path: "/budget/recurring", method: "POST", body: recurringBody(name: name, categoryID: categoryID, amount: amount, merchant: merchant, paymentMethod: paymentMethod, note: note, frequency: frequency, startDate: startDate))
    }

    func updateRecurringExpense(id: String, patch: [String: JSONValue]) async throws -> RecurringExpenseModel {
        try await request(path: "/budget/recurring/\(escapedPath(id))", method: "PATCH", body: patch)
    }

    func archiveRecurringExpense(id: String) async throws {
        let _: EmptyResponse = try await request(path: "/budget/recurring/\(escapedPath(id))", method: "DELETE")
    }

    func confirmRecurringExpense(id: String) async throws -> ExpenseModel {
        try await request(path: "/budget/recurring/\(escapedPath(id))/confirm", method: "POST")
    }

    func skipRecurringExpense(id: String) async throws -> RecurringExpenseModel {
        try await request(path: "/budget/recurring/\(escapedPath(id))/skip", method: "POST")
    }

    func getBudgetPreferences() async throws -> BudgetPreferencesModel { try await request(path: "/preferences/budget") }
    func updateBudgetPreferences(_ patch: [String: JSONValue]) async throws -> BudgetPreferencesModel { try await request(path: "/preferences/budget", method: "PATCH", body: patch) }

    private func expenseBody(amount: String, categoryID: String, merchant: String?, paymentMethod: String, expenseDate: String, note: String?) -> [String: JSONValue] {
        ["amount": .string(Self.decimalString(amount)), "categoryId": .string(categoryID), "merchant": merchant.map(JSONValue.string) ?? .null, "paymentMethod": .string(paymentMethod), "expenseDate": .string(expenseDate), "note": note.map(JSONValue.string) ?? .null]
    }

    private func recurringBody(name: String?, categoryID: String, amount: String, merchant: String?, paymentMethod: String, note: String?, frequency: String, startDate: String) -> [String: JSONValue] {
        ["name": name.map(JSONValue.string) ?? .null, "categoryId": .string(categoryID), "amount": .string(Self.decimalString(amount)), "merchant": merchant.map(JSONValue.string) ?? .null, "paymentMethod": .string(paymentMethod), "note": note.map(JSONValue.string) ?? .null, "frequency": .string(frequency), "startDate": .string(startDate)]
    }

    private static func decimalString(_ value: String) -> String {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let number = Decimal(string: trimmed, locale: Locale(identifier: "en_US_POSIX")) else { return "0.00" }
        return NSDecimalNumber(decimal: number).stringValue
    }
}
