import Foundation

extension APIClient {
    // MARK: - Budget

    func getBudgetPeriod(period: String) async throws -> BudgetPeriodModel {
        try await request(path: "/budget/periods/\(escapedPath(period))")
    }

    func updateBudgetPeriod(period: String, overallLimit: String) async throws -> BudgetPeriodModel {
        try await request(path: "/budget/periods/\(escapedPath(period))", method: "PUT", body: ["overallLimit": .string(Self.decimalString(overallLimit))] as [String: JSONValue])
    }

    func updateBudgetCategoryLimit(period: String, categoryID: String, limit: String) async throws -> BudgetPeriodModel {
        try await request(path: "/budget/periods/\(escapedPath(period))/categories/\(escapedPath(categoryID))", method: "PUT", body: ["limit": .string(Self.decimalString(limit))] as [String: JSONValue])
    }

    func deleteBudgetCategoryLimit(period: String, categoryID: String) async throws -> BudgetPeriodModel {
        try await request(path: "/budget/periods/\(escapedPath(period))/categories/\(escapedPath(categoryID))", method: "DELETE")
    }

    func getBudgetTransaction(id: String) async throws -> BudgetTransactionModel {
        try await request(path: "/budget/transactions/\(escapedPath(id))")
    }

    func createBudgetTransaction(amount: String, currency: String = "VND", type: String = "EXPENSE", categoryID: String, merchant: String?, paymentMethod: String = "CASH", transactionAt: String, note: String?) async throws -> BudgetTransactionModel {
        var body: [String: JSONValue] = ["amount": .string(Self.decimalString(amount)), "currency": .string(currency), "type": .string(type), "categoryId": .string(categoryID), "paymentMethod": .string(paymentMethod), "transactionAt": .string(transactionAt)]
        body["merchant"] = merchant.map(JSONValue.string) ?? .null
        body["note"] = note.map(JSONValue.string) ?? .null
        return try await request(path: "/budget/transactions", method: "POST", body: body)
    }

    func updateBudgetTransaction(id: String, patch: [String: JSONValue]) async throws -> BudgetTransactionModel {
        try await request(path: "/budget/transactions/\(escapedPath(id))", method: "PATCH", body: patch)
    }

    func deleteBudgetTransaction(id: String) async throws {
        let _: EmptyResponse = try await request(path: "/budget/transactions/\(escapedPath(id))", method: "DELETE")
    }

    func getBudgetPreferences() async throws -> BudgetPreferencesModel { try await request(path: "/preferences/budget") }
    func updateBudgetPreferences(_ patch: [String: JSONValue]) async throws -> BudgetPreferencesModel { try await request(path: "/preferences/budget", method: "PATCH", body: patch) }

    func getBudgetOverview(period: String? = nil) async throws -> BudgetOverviewModel {
        let path: String
        if let period, let encoded = period.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) {
            path = "/budget/overview?period=\(encoded)"
        } else {
            path = "/budget/overview"
        }
        return try await request(path: path)
    }

    func getBudgetCategories() async throws -> [BudgetCategoryModel] {
        try await request(path: "/budget/categories")
    }

    func createBudgetCategory(name: String, type: String, icon: String, color: String) async throws -> BudgetCategoryModel {
        try await request(path: "/budget/categories", method: "POST", body: [
            "name": .string(name),
            "type": .string(type),
            "icon": .string(icon),
            "color": .string(color)
        ] as [String: JSONValue])
    }

    func updateBudgetCategory(id: String, name: String, type: String, icon: String, color: String) async throws -> BudgetCategoryModel {
        try await request(path: "/budget/categories/\(escapedPath(id))", method: "PATCH", body: [
            "name": .string(name),
            "type": .string(type),
            "icon": .string(icon),
            "color": .string(color)
        ] as [String: JSONValue])
    }

    func archiveBudgetCategory(id: String) async throws -> BudgetCategoryModel {
        try await request(path: "/budget/categories/\(escapedPath(id))", method: "DELETE")
    }

    func getBudgetTransactions(period: String? = nil, categoryID: String? = nil, type: String? = nil) async throws -> [BudgetTransactionModel] {
        var items: [String] = []
        if let period, let encoded = period.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) { items.append("period=\(encoded)") }
        if let categoryID, let encoded = categoryID.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) { items.append("categoryId=\(encoded)") }
        if let type, let encoded = type.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) { items.append("type=\(encoded)") }
        let path = items.isEmpty ? "/budget/transactions" : "/budget/transactions?\(items.joined(separator: "&"))"
        return try await request(path: path)
    }

    private static func decimalString(_ value: String) -> String {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let number = Decimal(string: trimmed, locale: Locale(identifier: "en_US_POSIX")) else { return "0.00" }
        return NSDecimalNumber(decimal: number).rounding(accordingToBehavior: nil).stringValue
    }
}
