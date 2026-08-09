import Foundation

struct BudgetPreferencesModel: Codable, Equatable, Sendable {
    var defaultCurrency: String = "VND"
    var defaultTransactionType: String = "EXPENSE"
    var rememberPaymentMethod: Bool = true
    var merchantSuggestionsEnabled: Bool = true
    var budgetWarningThreshold: Int = 80
    var budgetAlertsEnabled: Bool = true
}

struct GymPreferencesModel: Codable, Equatable, Sendable {
    var weightUnit: String = "KG"
    var distanceUnit: String = "KM"
    var defaultRestSeconds: Int = 120
    var autoStartRestTimer: Bool = true
    var previousPerformanceMode: String = "EXERCISE"
    var showRpe: Bool = true
    var weeklyWorkoutGoal: Int?
}

// MARK: - Budget Models

struct BudgetOverviewModel: Codable, Equatable, Sendable {
    let period: String
    let currency: String
    let income: Double
    let spent: Double
    let overallBudget: Double
    let remainingBudget: Double
    let categories: [BudgetCategoryStatModel]

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        period = try c.decode(String.self, forKey: .period); currency = try c.decode(String.self, forKey: .currency)
        income = try c.decodeFlexibleDouble(forKey: .income); spent = try c.decodeFlexibleDouble(forKey: .spent)
        overallBudget = try c.decodeFlexibleDouble(forKey: .overallBudget); remainingBudget = try c.decodeFlexibleDouble(forKey: .remainingBudget)
        categories = try c.decode([BudgetCategoryStatModel].self, forKey: .categories)
    }
    private enum CodingKeys: String, CodingKey { case period, currency, income, spent, overallBudget, remainingBudget, categories }
}

struct BudgetCategoryStatModel: Codable, Equatable, Sendable, Identifiable {
    var id: String { category.id }
    let category: BudgetCategoryModel
    let budget: Double
    let spent: Double
    let remaining: Double
    let percentage: Double

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        category = try c.decode(BudgetCategoryModel.self, forKey: .category); budget = try c.decodeFlexibleDouble(forKey: .budget)
        spent = try c.decodeFlexibleDouble(forKey: .spent); remaining = try c.decodeFlexibleDouble(forKey: .remaining); percentage = try c.decodeFlexibleDouble(forKey: .percentage)
    }
    private enum CodingKeys: String, CodingKey { case category, budget, spent, remaining, percentage }
}

struct BudgetCategoryModel: Codable, Equatable, Sendable, Identifiable {
    let id: String
    let userId: String
    let name: String
    let type: String
    let icon: String?
    let color: String?
    let sortOrder: Int
    let archivedAt: String?
    let version: Int?
}

struct BudgetCategoryBudgetModel: Codable, Equatable, Sendable, Identifiable {
    let id: String
    let budgetPeriodId: String
    let categoryId: String
    let limit: Double
    let category: BudgetCategoryModel?
    let version: Int?

    init(id: String, budgetPeriodId: String, categoryId: String, limit: Double, category: BudgetCategoryModel?, version: Int?) {
        self.id = id; self.budgetPeriodId = budgetPeriodId; self.categoryId = categoryId; self.limit = limit; self.category = category; self.version = version
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id); budgetPeriodId = try c.decode(String.self, forKey: .budgetPeriodId)
        categoryId = try c.decode(String.self, forKey: .categoryId); limit = try c.decodeFlexibleDouble(forKey: .limit)
        category = try c.decodeIfPresent(BudgetCategoryModel.self, forKey: .category); version = try c.decodeIfPresent(Int.self, forKey: .version)
    }
    private enum CodingKeys: String, CodingKey { case id, budgetPeriodId, categoryId, limit, category, version }
}

struct BudgetPeriodModel: Codable, Equatable, Sendable, Identifiable {
    let id: String
    let userId: String
    let period: String
    let currency: String
    let overallLimit: Double
    let categoryBudgets: [BudgetCategoryBudgetModel]
    let version: Int?

    init(id: String, userId: String, period: String, currency: String, overallLimit: Double, categoryBudgets: [BudgetCategoryBudgetModel], version: Int?) {
        self.id = id; self.userId = userId; self.period = period; self.currency = currency; self.overallLimit = overallLimit; self.categoryBudgets = categoryBudgets; self.version = version
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id); userId = try c.decode(String.self, forKey: .userId); period = try c.decode(String.self, forKey: .period)
        currency = try c.decode(String.self, forKey: .currency); overallLimit = try c.decodeFlexibleDouble(forKey: .overallLimit)
        categoryBudgets = try c.decodeIfPresent([BudgetCategoryBudgetModel].self, forKey: .categoryBudgets) ?? []; version = try c.decodeIfPresent(Int.self, forKey: .version)
    }
    private enum CodingKeys: String, CodingKey { case id, userId, period, currency, overallLimit, categoryBudgets, version }
}

struct BudgetTransactionModel: Codable, Equatable, Sendable, Identifiable {
    let id: String
    let userId: String
    let type: String
    let amount: Double
    let currency: String
    let category: String
    let categoryId: String?
    let merchant: String?
    let paymentMethod: String
    let transactionAt: String
    let note: String?
    let version: Int?
    let createdAt: String?
    let updatedAt: String?
    let deletedAt: String?

    init(id: String, userId: String, type: String, amount: Double, currency: String, category: String, categoryId: String?, merchant: String?, paymentMethod: String, transactionAt: String, note: String?, version: Int?, createdAt: String?, updatedAt: String?, deletedAt: String?) {
        self.id = id; self.userId = userId; self.type = type; self.amount = amount; self.currency = currency; self.category = category; self.categoryId = categoryId; self.merchant = merchant; self.paymentMethod = paymentMethod; self.transactionAt = transactionAt; self.note = note; self.version = version; self.createdAt = createdAt; self.updatedAt = updatedAt; self.deletedAt = deletedAt
    }
}

/// The API sends money as decimal strings. Keep the native display model
/// convenient while accepting both the legacy JSON number and the canonical
/// string representation.
extension BudgetTransactionModel {
    enum CodingKeys: String, CodingKey {
        case id, userId, type, amount, currency, category, categoryId, merchant,
             paymentMethod, transactionAt, note, version, createdAt, updatedAt, deletedAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        userId = try c.decode(String.self, forKey: .userId)
        type = try c.decode(String.self, forKey: .type)
        amount = try c.decodeFlexibleDouble(forKey: .amount)
        currency = try c.decode(String.self, forKey: .currency)
        category = try c.decode(String.self, forKey: .category)
        categoryId = try c.decodeIfPresent(String.self, forKey: .categoryId)
        merchant = try c.decodeIfPresent(String.self, forKey: .merchant)
        paymentMethod = try c.decode(String.self, forKey: .paymentMethod)
        transactionAt = try c.decode(String.self, forKey: .transactionAt)
        note = try c.decodeIfPresent(String.self, forKey: .note)
        version = try c.decodeIfPresent(Int.self, forKey: .version)
        createdAt = try c.decodeIfPresent(String.self, forKey: .createdAt)
        updatedAt = try c.decodeIfPresent(String.self, forKey: .updatedAt)
        deletedAt = try c.decodeIfPresent(String.self, forKey: .deletedAt)
    }
}

// MARK: - Gym Models

struct GymOverviewModel: Codable, Equatable, Sendable {
    let weeklyWorkoutsCount: Int
    let weeklySetsCount: Int
    let weeklyVolumeKg: Int
    let recentWorkouts: [WorkoutModel]
}

struct ExerciseModel: Codable, Equatable, Sendable, Identifiable {
    let id: String
    let userId: String
    let name: String
    let normalizedName: String
    let description: String?
    let imageStorageKey: String?
    let imageUrl: String?
    let metricType: String
    let equipment: String?
    let primaryMuscleGroup: String?
    let secondaryMuscleGroups: [String]?
    let defaultWeightUnit: String
    let defaultRestSeconds: Int?
    let archivedAt: String?
    let version: Int?
}

struct ExerciseStatsModel: Codable, Equatable, Sendable {
    let exercise: ExerciseModel?
    let totalSets: Int
    let totalVolumeKg: Double
    let bestWeight: Double?
    let bestReps: Int?
    let lastPerformedAt: String?
}

struct WorkoutModel: Codable, Equatable, Sendable, Identifiable {
    let id: String
    let userId: String
    let title: String
    let status: String
    let startedAt: String?
    let endedAt: String?
    let durationMinutes: Int?
    let exercises: [WorkoutExerciseModel]?
    let version: Int?
    let deletedAt: String?
}

struct WorkoutExerciseModel: Codable, Equatable, Sendable, Identifiable {
    let id: String
    let workoutEntryId: String
    let exerciseId: String
    let sortOrder: Int
    let note: String?
    let restSeconds: Int?
    let exercise: ExerciseModel?
    let sets: [WorkoutSetModel]?
}

struct WorkoutSetModel: Codable, Equatable, Sendable, Identifiable {
    let id: String
    let workoutExerciseId: String
    let sortOrder: Int
    let type: String
    let reps: Int?
    let weight: Double?
    let durationSeconds: Int?
    let distanceMeters: Double?
    let rpe: Double?
    let completedAt: String?
}

private extension KeyedDecodingContainer {
    func decodeFlexibleDouble(forKey key: Key) throws -> Double {
        if let value = try? decode(Double.self, forKey: key) { return value }
        if let value = try? decode(String.self, forKey: key), let number = Double(value) { return number }
        return 0
    }
}
