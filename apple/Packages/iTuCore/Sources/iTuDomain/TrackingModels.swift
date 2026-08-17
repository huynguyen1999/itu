import Foundation

public struct BudgetPreferencesModel: Codable, Equatable, Sendable {
    public init(
        defaultCurrency: String = "VND",
        rememberPaymentMethod: Bool = true,
        merchantSuggestionsEnabled: Bool = true,
        budgetWarningThreshold: Int = 80,
        budgetAlertsEnabled: Bool = true
    ) {
        self.defaultCurrency = defaultCurrency
        self.rememberPaymentMethod = rememberPaymentMethod
        self.merchantSuggestionsEnabled = merchantSuggestionsEnabled
        self.budgetWarningThreshold = budgetWarningThreshold
        self.budgetAlertsEnabled = budgetAlertsEnabled
    }

    public var defaultCurrency: String = "VND"
    public var rememberPaymentMethod: Bool = true
    public var merchantSuggestionsEnabled: Bool = true
    public var budgetWarningThreshold: Int = 80
    public var budgetAlertsEnabled: Bool = true
}

public struct GymPreferencesModel: Codable, Equatable, Sendable {
    public var weightUnit: String = "KG"
    public var distanceUnit: String = "KM"
    public var defaultRestSeconds: Int = 120
    public var autoStartRestTimer: Bool = true
    public var previousPerformanceMode: String = "EXERCISE"
    public var showRpe: Bool = false
    public var soundsEnabled: Bool = true
    public var restSoundEnabled: Bool = true
    public var completionSoundEnabled: Bool = true
    public var favoriteExerciseIDs: [String] = []
    public var recentExerciseIDs: [String] = []
    public var weeklyWorkoutGoal: Int?

    private enum CodingKeys: String, CodingKey {
        case weightUnit, distanceUnit, defaultRestSeconds, autoStartRestTimer,
             previousPerformanceMode, showRpe, soundsEnabled, favoriteExerciseIDs,
             restSoundEnabled, completionSoundEnabled, recentExerciseIDs, weeklyWorkoutGoal
    }

    public init(
        weightUnit: String = "KG",
        distanceUnit: String = "KM",
        defaultRestSeconds: Int = 120,
        autoStartRestTimer: Bool = true,
        previousPerformanceMode: String = "EXERCISE",
        showRpe: Bool = false,
        soundsEnabled: Bool = true,
        restSoundEnabled: Bool? = nil,
        completionSoundEnabled: Bool? = nil,
        favoriteExerciseIDs: [String] = [],
        recentExerciseIDs: [String] = [],
        weeklyWorkoutGoal: Int? = nil
    ) {
        self.weightUnit = weightUnit; self.distanceUnit = distanceUnit; self.defaultRestSeconds = defaultRestSeconds
        self.autoStartRestTimer = autoStartRestTimer; self.previousPerformanceMode = previousPerformanceMode
        self.showRpe = showRpe; self.soundsEnabled = soundsEnabled
        self.restSoundEnabled = restSoundEnabled ?? soundsEnabled
        self.completionSoundEnabled = completionSoundEnabled ?? soundsEnabled
        self.favoriteExerciseIDs = favoriteExerciseIDs
        self.recentExerciseIDs = recentExerciseIDs; self.weeklyWorkoutGoal = weeklyWorkoutGoal
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            weightUnit: try c.decodeIfPresent(String.self, forKey: .weightUnit) ?? "KG",
            distanceUnit: try c.decodeIfPresent(String.self, forKey: .distanceUnit) ?? "KM",
            defaultRestSeconds: try c.decodeIfPresent(Int.self, forKey: .defaultRestSeconds) ?? 120,
            autoStartRestTimer: try c.decodeIfPresent(Bool.self, forKey: .autoStartRestTimer) ?? true,
            previousPerformanceMode: try c.decodeIfPresent(String.self, forKey: .previousPerformanceMode) ?? "EXERCISE",
            showRpe: try c.decodeIfPresent(Bool.self, forKey: .showRpe) ?? false,
            soundsEnabled: try c.decodeIfPresent(Bool.self, forKey: .soundsEnabled) ?? true,
            restSoundEnabled: try c.decodeIfPresent(Bool.self, forKey: .restSoundEnabled),
            completionSoundEnabled: try c.decodeIfPresent(Bool.self, forKey: .completionSoundEnabled),
            favoriteExerciseIDs: try c.decodeIfPresent([String].self, forKey: .favoriteExerciseIDs) ?? [],
            recentExerciseIDs: try c.decodeIfPresent([String].self, forKey: .recentExerciseIDs) ?? [],
            weeklyWorkoutGoal: try c.decodeIfPresent(Int.self, forKey: .weeklyWorkoutGoal)
        )
    }
}

// MARK: - Budget Models

public struct ExpenseCategoryModel: Codable, Equatable, Sendable, Identifiable {
    public init(id: String, userId: String, name: String, icon: String?, color: String?, sortOrder: Int, archivedAt: String?, version: Int?) {
        self.id = id
        self.userId = userId
        self.name = name
        self.icon = icon
        self.color = color
        self.sortOrder = sortOrder
        self.archivedAt = archivedAt
        self.version = version
    }

    public let id: String
    public let userId: String
    public let name: String
    public let icon: String?
    public let color: String?
    public let sortOrder: Int
    public let archivedAt: String?
    public let version: Int?
}

public struct CategoryBudgetLimitModel: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public let monthlyBudgetId: String
    public let categoryId: String
    public let limit: Double
    public let version: Int?

    public init(id: String, monthlyBudgetId: String, categoryId: String, limit: Double, version: Int? = 1) {
        self.id = id; self.monthlyBudgetId = monthlyBudgetId; self.categoryId = categoryId; self.limit = limit; self.version = version
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id); monthlyBudgetId = try c.decode(String.self, forKey: .monthlyBudgetId)
        categoryId = try c.decode(String.self, forKey: .categoryId); limit = try c.decodeFlexibleDouble(forKey: .limit)
        version = try c.decodeIfPresent(Int.self, forKey: .version)
    }
    private enum CodingKeys: String, CodingKey { case id, monthlyBudgetId, categoryId, limit, version }
}

public struct MonthlyBudgetModel: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public let userId: String
    public let period: String
    public let overallLimit: Double?
    public let categoryLimits: [CategoryBudgetLimitModel]
    public let version: Int?

    public init(id: String, userId: String, period: String, overallLimit: Double?, categoryLimits: [CategoryBudgetLimitModel] = [], version: Int? = 1) {
        self.id = id; self.userId = userId; self.period = period; self.overallLimit = overallLimit; self.categoryLimits = categoryLimits; self.version = version
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id); userId = try c.decode(String.self, forKey: .userId); period = try c.decode(String.self, forKey: .period)
        overallLimit = try c.decodeFlexibleDoubleIfPresent(forKey: .overallLimit)
        categoryLimits = try c.decodeIfPresent([CategoryBudgetLimitModel].self, forKey: .categoryLimits) ?? []
        version = try c.decodeIfPresent(Int.self, forKey: .version)
    }
    private enum CodingKeys: String, CodingKey { case id, userId, period, overallLimit, categoryLimits, version }
}

public struct ExpenseModel: Codable, Equatable, Sendable, Identifiable {
    public let id: String; public let userId: String; public let amount: Double; public let category: String; public let categoryId: String
    public let merchant: String?; public let paymentMethod: String; public let expenseDate: String; public let note: String?
    public let recurringExpenseId: String?; public let recurringOccurrenceDate: String?
    public let version: Int?; public let createdAt: String?; public let updatedAt: String?; public let deletedAt: String?; public let deletedByDeviceId: String?

    public init(id: String, userId: String, amount: Double, category: String, categoryId: String, merchant: String?, paymentMethod: String, expenseDate: String, note: String?, recurringExpenseId: String? = nil, recurringOccurrenceDate: String? = nil, version: Int? = 1, createdAt: String?, updatedAt: String?, deletedAt: String? = nil, deletedByDeviceId: String? = nil) {
        self.id = id; self.userId = userId; self.amount = amount; self.category = category; self.categoryId = categoryId; self.merchant = merchant; self.paymentMethod = paymentMethod; self.expenseDate = expenseDate; self.note = note; self.recurringExpenseId = recurringExpenseId; self.recurringOccurrenceDate = recurringOccurrenceDate; self.version = version; self.createdAt = createdAt; self.updatedAt = updatedAt; self.deletedAt = deletedAt; self.deletedByDeviceId = deletedByDeviceId
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id); userId = try c.decode(String.self, forKey: .userId); amount = try c.decodeFlexibleDouble(forKey: .amount)
        category = try c.decode(String.self, forKey: .category); categoryId = try c.decode(String.self, forKey: .categoryId); merchant = try c.decodeIfPresent(String.self, forKey: .merchant)
        paymentMethod = try c.decode(String.self, forKey: .paymentMethod); expenseDate = try c.decode(String.self, forKey: .expenseDate); note = try c.decodeIfPresent(String.self, forKey: .note)
        recurringExpenseId = try c.decodeIfPresent(String.self, forKey: .recurringExpenseId); recurringOccurrenceDate = try c.decodeIfPresent(String.self, forKey: .recurringOccurrenceDate)
        version = try c.decodeIfPresent(Int.self, forKey: .version); createdAt = try c.decodeIfPresent(String.self, forKey: .createdAt); updatedAt = try c.decodeIfPresent(String.self, forKey: .updatedAt)
        deletedAt = try c.decodeIfPresent(String.self, forKey: .deletedAt); deletedByDeviceId = try c.decodeIfPresent(String.self, forKey: .deletedByDeviceId)
    }
    private enum CodingKeys: String, CodingKey { case id, userId, amount, category, categoryId, merchant, paymentMethod, expenseDate, note, recurringExpenseId, recurringOccurrenceDate, version, createdAt, updatedAt, deletedAt, deletedByDeviceId }
}

public struct RecurringExpenseModel: Codable, Equatable, Sendable, Identifiable {
    public let id: String; public let userId: String; public let name: String?; public let categoryId: String; public let category: String; public let amount: Double
    public let merchant: String?; public let paymentMethod: String; public let note: String?; public let frequency: String; public let startDate: String; public let nextDueDate: String
    public let isActive: Bool; public let archivedAt: String?; public let version: Int?

    public init(id: String, userId: String, name: String?, categoryId: String, category: String, amount: Double, merchant: String?, paymentMethod: String, note: String?, frequency: String, startDate: String, nextDueDate: String, isActive: Bool, archivedAt: String?, version: Int?) {
        self.id = id; self.userId = userId; self.name = name; self.categoryId = categoryId; self.category = category; self.amount = amount; self.merchant = merchant
        self.paymentMethod = paymentMethod; self.note = note; self.frequency = frequency; self.startDate = startDate; self.nextDueDate = nextDueDate; self.isActive = isActive; self.archivedAt = archivedAt; self.version = version
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id); userId = try c.decode(String.self, forKey: .userId); name = try c.decodeIfPresent(String.self, forKey: .name)
        categoryId = try c.decode(String.self, forKey: .categoryId); category = try c.decode(String.self, forKey: .category); amount = try c.decodeFlexibleDouble(forKey: .amount)
        merchant = try c.decodeIfPresent(String.self, forKey: .merchant); paymentMethod = try c.decode(String.self, forKey: .paymentMethod); note = try c.decodeIfPresent(String.self, forKey: .note)
        frequency = try c.decode(String.self, forKey: .frequency); startDate = try c.decode(String.self, forKey: .startDate); nextDueDate = try c.decode(String.self, forKey: .nextDueDate)
        isActive = try c.decode(Bool.self, forKey: .isActive); archivedAt = try c.decodeIfPresent(String.self, forKey: .archivedAt); version = try c.decodeIfPresent(Int.self, forKey: .version)
    }

    private enum CodingKeys: String, CodingKey { case id, userId, name, categoryId, category, amount, merchant, paymentMethod, note, frequency, startDate, nextDueDate, isActive, archivedAt, version }
}

public struct BudgetCategorySummaryModel: Decodable, Equatable, Sendable, Identifiable {
    public let id: String; public let name: String; public let spent: Double; public let limit: Double?; public let remaining: Double?; public let percentage: Double?
    public var isOverBudget: Bool { (remaining ?? 0) < 0 }
    public init(id: String, name: String, spent: Double, limit: Double?, remaining: Double?, percentage: Double?) {
        self.id = id; self.name = name; self.spent = spent; self.limit = limit; self.remaining = remaining; self.percentage = percentage
    }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let category = try c.decode(ExpenseCategoryModel.self, forKey: .category)
        id = category.id; name = category.name
        spent = try c.decodeFlexibleDouble(forKey: .spent)
        limit = try c.decodeFlexibleDoubleIfPresent(forKey: .limit)
        remaining = try c.decodeFlexibleDoubleIfPresent(forKey: .remaining)
        percentage = try c.decodeFlexibleDoubleIfPresent(forKey: .percentage)
    }
    private enum CodingKeys: String, CodingKey { case category, spent, limit, remaining, percentage }
}

public struct BudgetSummaryModel: Decodable, Equatable, Sendable {
    public let period: String; public let spent: Double; public let overallLimit: Double?; public let remaining: Double?; public let previousSpent: Double
    public let changeAmount: Double; public let changePercentage: Double?; public let categories: [BudgetCategorySummaryModel]
    public let recentExpenses: [ExpenseModel]; public let dueRecurring: [RecurringExpenseModel]
    public init(period: String, spent: Double, overallLimit: Double?, remaining: Double?, previousSpent: Double, changeAmount: Double, changePercentage: Double?, categories: [BudgetCategorySummaryModel], recentExpenses: [ExpenseModel], dueRecurring: [RecurringExpenseModel]) {
        self.period = period; self.spent = spent; self.overallLimit = overallLimit; self.remaining = remaining; self.previousSpent = previousSpent; self.changeAmount = changeAmount; self.changePercentage = changePercentage; self.categories = categories; self.recentExpenses = recentExpenses; self.dueRecurring = dueRecurring
    }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        period = try c.decode(String.self, forKey: .period); spent = try c.decodeFlexibleDouble(forKey: .spent)
        overallLimit = try c.decodeFlexibleDoubleIfPresent(forKey: .overallLimit); remaining = try c.decodeFlexibleDoubleIfPresent(forKey: .remaining)
        previousSpent = try c.decodeFlexibleDouble(forKey: .previousSpent); changeAmount = try c.decodeFlexibleDouble(forKey: .changeAmount)
        changePercentage = try c.decodeFlexibleDoubleIfPresent(forKey: .changePercentage); categories = try c.decode([BudgetCategorySummaryModel].self, forKey: .categories)
        recentExpenses = try c.decode([ExpenseModel].self, forKey: .recentExpenses); dueRecurring = try c.decode([RecurringExpenseModel].self, forKey: .dueRecurring)
    }
    private enum CodingKeys: String, CodingKey { case period, spent, overallLimit, remaining, previousSpent, changeAmount, changePercentage, categories, recentExpenses, dueRecurring }
}

public struct BudgetReportModel: Decodable, Equatable, Sendable {
    public struct Point: Codable, Equatable, Sendable, Identifiable {
        public let date: String; public let amount: Double; public let cumulative: Double; public var id: String { date }
        public init(from decoder: Decoder) throws { let c = try decoder.container(keyedBy: CodingKeys.self); date = try c.decode(String.self, forKey: .date); amount = try c.decodeFlexibleDouble(forKey: .amount); cumulative = try c.decodeFlexibleDouble(forKey: .cumulative) }
        private enum CodingKeys: String, CodingKey { case date, amount, cumulative }
    }
    public struct Category: Codable, Equatable, Sendable, Identifiable {
        public let categoryId: String; public let category: String; public let amount: Double; public let percentage: Double
        public var id: String { categoryId }
        public init(from decoder: Decoder) throws { let c = try decoder.container(keyedBy: CodingKeys.self); categoryId = try c.decode(String.self, forKey: .categoryId); category = try c.decode(String.self, forKey: .category); amount = try c.decodeFlexibleDouble(forKey: .amount); percentage = try c.decodeFlexibleDouble(forKey: .percentage) }
        private enum CodingKeys: String, CodingKey { case categoryId, category, amount, percentage }
    }
    public struct TopCategory: Codable, Equatable, Sendable, Identifiable {
        public let categoryId: String; public let category: String; public let amount: Double; public let count: Int
        public var id: String { categoryId }
        public init(from decoder: Decoder) throws { let c = try decoder.container(keyedBy: CodingKeys.self); categoryId = try c.decode(String.self, forKey: .categoryId); category = try c.decode(String.self, forKey: .category); amount = try c.decodeFlexibleDouble(forKey: .amount); count = try c.decode(Int.self, forKey: .count) }
        private enum CodingKeys: String, CodingKey { case categoryId, category, amount, count }
    }
    public struct Outflow: Codable, Equatable, Sendable, Identifiable {
        public let bucket: String; public let amount: Double; public var id: String { bucket }
        public init(from decoder: Decoder) throws { let c = try decoder.container(keyedBy: CodingKeys.self); bucket = try c.decode(String.self, forKey: .bucket); amount = try c.decodeFlexibleDouble(forKey: .amount) }
        private enum CodingKeys: String, CodingKey { case bucket, amount }
    }
    public struct Merchant: Codable, Equatable, Sendable, Identifiable {
        public let merchant: String; public let amount: Double; public let count: Int; public var id: String { merchant }
        public init(from decoder: Decoder) throws { let c = try decoder.container(keyedBy: CodingKeys.self); merchant = try c.decode(String.self, forKey: .merchant); amount = try c.decodeFlexibleDouble(forKey: .amount); count = try c.decode(Int.self, forKey: .count) }
        private enum CodingKeys: String, CodingKey { case merchant, amount, count }
    }
    public struct Comparison: Codable, Equatable, Sendable {
        public let current: Double; public let previous: Double; public let difference: Double; public let percentage: Double?
        public init(from decoder: Decoder) throws { let c = try decoder.container(keyedBy: CodingKeys.self); current = try c.decodeFlexibleDouble(forKey: .current); previous = try c.decodeFlexibleDouble(forKey: .previous); difference = try c.decodeFlexibleDouble(forKey: .difference); percentage = try c.decodeFlexibleDoubleIfPresent(forKey: .percentage) }
        private enum CodingKeys: String, CodingKey { case current, previous, difference, percentage }
    }
    public let period: String; public let spendingOverTime: [Point]; public let categoryBreakdown: [Category]; public let monthlyOutflow: [Outflow]
    public let previousMonthComparison: Comparison; public let topMerchants: [Merchant]; public let topCategories: [TopCategory]
}

public struct BudgetStatisticsModel: Decodable, Equatable, Sendable {
    public struct Point: Decodable, Equatable, Sendable, Identifiable {
        public let date: String
        public let amount: Double
        public var id: String { date }

        public init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            date = try container.decode(String.self, forKey: .date)
            amount = try container.decodeFlexibleDouble(forKey: .amount)
        }

        private enum CodingKeys: String, CodingKey { case date, amount }
    }

    public let from: String
    public let to: String
    public let spent: Double
    public let expenseCount: Int
    public let previousSpent: Double
    public let changeAmount: Double
    public let trend: [Point]

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        from = try container.decode(String.self, forKey: .from)
        to = try container.decode(String.self, forKey: .to)
        spent = try container.decodeFlexibleDouble(forKey: .spent)
        expenseCount = try container.decode(Int.self, forKey: .expenseCount)
        previousSpent = try container.decodeFlexibleDouble(forKey: .previousSpent)
        changeAmount = try container.decodeFlexibleDouble(forKey: .changeAmount)
        trend = try container.decodeIfPresent([Point].self, forKey: .trend) ?? []
    }

    private enum CodingKeys: String, CodingKey { case from, to, spent, expenseCount, previousSpent, changeAmount, trend }
}

// MARK: - Gym Models

public struct GymOverviewModel: Codable, Equatable, Sendable {
    public let weeklyWorkoutsCount: Int
    public let weeklySetsCount: Int
    public let weeklyVolumeKg: Int
    public let weeklyWorkoutTarget: Int?
    public let consistencyStreakWeeks: Int?
    public let trainingMinutes: Int?
    public let prCount: Int?
    public let muscleSets: [String: Int]?
    public let recentWorkouts: [WorkoutModel]

    private enum CodingKeys: String, CodingKey {
        case weeklyWorkoutsCount, weeklySetsCount, weeklyVolumeKg, weeklyWorkoutTarget, consistencyStreakWeeks, trainingMinutes, prCount, muscleSets, recentWorkouts
    }

    public init(weeklyWorkoutsCount: Int = 0, weeklySetsCount: Int = 0, weeklyVolumeKg: Int = 0, weeklyWorkoutTarget: Int? = nil, consistencyStreakWeeks: Int? = nil, trainingMinutes: Int? = nil, prCount: Int? = nil, muscleSets: [String: Int]? = nil, recentWorkouts: [WorkoutModel] = []) {
        self.weeklyWorkoutsCount = weeklyWorkoutsCount
        self.weeklySetsCount = weeklySetsCount
        self.weeklyVolumeKg = weeklyVolumeKg
        self.weeklyWorkoutTarget = weeklyWorkoutTarget
        self.consistencyStreakWeeks = consistencyStreakWeeks
        self.trainingMinutes = trainingMinutes
        self.prCount = prCount
        self.muscleSets = muscleSets
        self.recentWorkouts = recentWorkouts
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        weeklyWorkoutsCount = try c.decodeIfPresent(Int.self, forKey: .weeklyWorkoutsCount) ?? 0
        weeklySetsCount = try c.decodeIfPresent(Int.self, forKey: .weeklySetsCount) ?? 0
        weeklyVolumeKg = try c.decodeIfPresent(Int.self, forKey: .weeklyVolumeKg) ?? 0
        weeklyWorkoutTarget = try c.decodeIfPresent(Int.self, forKey: .weeklyWorkoutTarget)
        consistencyStreakWeeks = try c.decodeIfPresent(Int.self, forKey: .consistencyStreakWeeks)
        trainingMinutes = try c.decodeIfPresent(Int.self, forKey: .trainingMinutes)
        prCount = try c.decodeIfPresent(Int.self, forKey: .prCount)
        muscleSets = try c.decodeIfPresent([String: Int].self, forKey: .muscleSets)
        recentWorkouts = try c.decodeIfPresent([WorkoutModel].self, forKey: .recentWorkouts) ?? []
    }
}

public struct GymAnalyticsModel: Codable, Equatable, Sendable {
    public struct WeeklyTrend: Codable, Equatable, Sendable, Identifiable {
        public let weekLabel: String
        public let startDate: String
        public let workouts: Int
        public let sets: Int
        public let volumeKg: Double
        public let trainingMinutes: Int
        public var id: String { startDate }
    }

    public let range: String
    public let totalWorkouts: Int
    public let totalWorkingSets: Int
    public let totalVolumeKg: Double
    public let totalTrainingMinutes: Int
    public let totalPRs: Int
    public let muscleDistribution: [String: Int]
    public let weeklyTrend: [WeeklyTrend]
}

public struct RoutineExerciseModel: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public let routineId: String
    public let exerciseId: String
    public let sortOrder: Int
    public let setCount: Int
    public let targetRepsMin: Int?
    public let targetRepsMax: Int?
    public let targetDurationSeconds: Int?
    public let targetDistanceMeters: Double?
    public let restSeconds: Int?
    public let note: String?
    public let exercise: ExerciseModel?
    public let version: Int?
    public let deletedAt: String?

    public init(id: String, routineId: String, exerciseId: String, sortOrder: Int = 0, setCount: Int = 3, targetRepsMin: Int? = nil, targetRepsMax: Int? = nil, targetDurationSeconds: Int? = nil, targetDistanceMeters: Double? = nil, restSeconds: Int? = nil, note: String? = nil, exercise: ExerciseModel? = nil, version: Int? = 1, deletedAt: String? = nil) {
        self.id = id; self.routineId = routineId; self.exerciseId = exerciseId; self.sortOrder = sortOrder; self.setCount = setCount
        self.targetRepsMin = targetRepsMin; self.targetRepsMax = targetRepsMax; self.targetDurationSeconds = targetDurationSeconds
        self.targetDistanceMeters = targetDistanceMeters; self.restSeconds = restSeconds; self.note = note; self.exercise = exercise
        self.version = version; self.deletedAt = deletedAt
    }
}

public struct RoutineModel: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public let userId: String
    public let name: String
    public let description: String?
    public let sortOrder: Int
    public let exercises: [RoutineExerciseModel]?
    public let archivedAt: String?
    public let deletedAt: String?
    public let version: Int?

    public init(id: String, userId: String, name: String, description: String? = nil, sortOrder: Int = 0, exercises: [RoutineExerciseModel]? = [], archivedAt: String? = nil, deletedAt: String? = nil, version: Int? = 1) {
        self.id = id; self.userId = userId; self.name = name; self.description = description; self.sortOrder = sortOrder
        self.exercises = exercises; self.archivedAt = archivedAt; self.deletedAt = deletedAt; self.version = version
    }
}

public struct ExerciseModel: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public let userId: String
    public let name: String
    public let normalizedName: String
    public let description: String?
    public let imageStorageKey: String?
    public let imageUrl: String?
    public let metricType: String
    public let equipment: String?
    public let primaryMuscleGroup: String?
    public let secondaryMuscleGroups: [String]?
    public let defaultWeightUnit: String
    public let defaultRestSeconds: Int?
    public let origin: String?
    public let catalogKey: String?
    public let catalogVersion: Int?
    public let userNotes: String?
    public let isFavorite: Bool?
    public let archivedAt: String?
    public let deletedAt: String?
    public let deletedByDeviceId: String?
    public let version: Int?

    public init(id: String, userId: String, name: String, normalizedName: String, description: String?, imageStorageKey: String?, imageUrl: String?, metricType: String, equipment: String?, primaryMuscleGroup: String?, secondaryMuscleGroups: [String]?, defaultWeightUnit: String, defaultRestSeconds: Int?, origin: String? = nil, catalogKey: String? = nil, catalogVersion: Int? = nil, userNotes: String? = nil, isFavorite: Bool? = nil, archivedAt: String?, deletedAt: String?, version: Int?, deletedByDeviceId: String? = nil) {
        self.id = id; self.userId = userId; self.name = name; self.normalizedName = normalizedName; self.description = description; self.imageStorageKey = imageStorageKey; self.imageUrl = imageUrl; self.metricType = metricType; self.equipment = equipment; self.primaryMuscleGroup = primaryMuscleGroup; self.secondaryMuscleGroups = secondaryMuscleGroups; self.defaultWeightUnit = defaultWeightUnit; self.defaultRestSeconds = defaultRestSeconds; self.origin = origin; self.catalogKey = catalogKey; self.catalogVersion = catalogVersion; self.userNotes = userNotes; self.isFavorite = isFavorite; self.archivedAt = archivedAt; self.deletedAt = deletedAt; self.version = version; self.deletedByDeviceId = deletedByDeviceId
    }
}

public struct ExerciseStatsModel: Codable, Equatable, Sendable {
    public let exercise: ExerciseModel?
    public let totalSets: Int
    public let totalVolumeKg: Double
    public let bestWeight: Double?
    public let bestReps: Int?
    public let lastPerformedAt: String?
    public let estimated1RM: Double?
    public let volumeTrend: [Double]
    public let recentSets: [WorkoutSetModel]

    public init(exercise: ExerciseModel? = nil, totalSets: Int = 0, totalVolumeKg: Double = 0, bestWeight: Double? = nil, bestReps: Int? = nil, lastPerformedAt: String? = nil, estimated1RM: Double? = nil, volumeTrend: [Double] = [], recentSets: [WorkoutSetModel] = []) {
        self.exercise = exercise; self.totalSets = totalSets; self.totalVolumeKg = totalVolumeKg; self.bestWeight = bestWeight
        self.bestReps = bestReps; self.lastPerformedAt = lastPerformedAt; self.estimated1RM = estimated1RM; self.volumeTrend = volumeTrend; self.recentSets = recentSets
    }

    private enum CodingKeys: String, CodingKey { case exercise, totalSets, totalVolumeKg, bestWeight, bestReps, lastPerformedAt, estimated1RM, heaviestWeight, bestVolumeSet, recentSets, volumeTrend }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        exercise = try c.decodeIfPresent(ExerciseModel.self, forKey: .exercise)
        totalSets = try c.decodeIfPresent(Int.self, forKey: .totalSets) ?? 0
        totalVolumeKg = (try? c.decodeFlexibleDouble(forKey: .totalVolumeKg)) ?? 0
        bestWeight = (try? c.decodeFlexibleDoubleIfPresent(forKey: .bestWeight)) ?? (try? c.decodeFlexibleDoubleIfPresent(forKey: .heaviestWeight))
        bestReps = try c.decodeIfPresent(Int.self, forKey: .bestReps)
        lastPerformedAt = try c.decodeIfPresent(String.self, forKey: .lastPerformedAt)
        estimated1RM = (try? c.decodeFlexibleDoubleIfPresent(forKey: .estimated1RM))
        volumeTrend = try c.decodeIfPresent([Double].self, forKey: .volumeTrend) ?? []
        recentSets = try c.decodeIfPresent([WorkoutSetModel].self, forKey: .recentSets) ?? []
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(exercise, forKey: .exercise)
        try c.encode(totalSets, forKey: .totalSets)
        try c.encode(totalVolumeKg, forKey: .totalVolumeKg)
        try c.encodeIfPresent(bestWeight, forKey: .bestWeight)
        try c.encodeIfPresent(bestReps, forKey: .bestReps)
        try c.encodeIfPresent(lastPerformedAt, forKey: .lastPerformedAt)
        try c.encodeIfPresent(estimated1RM, forKey: .estimated1RM)
        try c.encode(volumeTrend, forKey: .volumeTrend)
        try c.encode(recentSets, forKey: .recentSets)
    }
}

public struct WorkoutModel: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public let userId: String
    public let routineId: String?
    public let title: String
    public let status: String
    public let startedAt: String?
    public let endedAt: String?
    public let durationMinutes: Int?
    public let exercises: [WorkoutExerciseModel]?
    public let version: Int?
    public let deletedAt: String?
    public let deletedByDeviceId: String?

    public init(id: String, userId: String, routineId: String? = nil, title: String, status: String, startedAt: String?, endedAt: String?, durationMinutes: Int?, exercises: [WorkoutExerciseModel]?, version: Int?, deletedAt: String?, deletedByDeviceId: String? = nil) {
        self.id = id; self.userId = userId; self.routineId = routineId; self.title = title; self.status = status; self.startedAt = startedAt; self.endedAt = endedAt; self.durationMinutes = durationMinutes; self.exercises = exercises; self.version = version; self.deletedAt = deletedAt; self.deletedByDeviceId = deletedByDeviceId
    }
}

public struct WorkoutExerciseModel: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public let workoutEntryId: String
    public let exerciseId: String
    public let sortOrder: Int
    public let note: String?
    public let restSeconds: Int?
    public let exercise: ExerciseModel?
    public let sets: [WorkoutSetModel]?
    public let version: Int?
    public let deletedAt: String?

    public init(id: String, workoutEntryId: String, exerciseId: String, sortOrder: Int, note: String?, restSeconds: Int?, exercise: ExerciseModel?, sets: [WorkoutSetModel]?, version: Int? = 1, deletedAt: String? = nil) {
        self.id = id; self.workoutEntryId = workoutEntryId; self.exerciseId = exerciseId; self.sortOrder = sortOrder; self.note = note
        self.restSeconds = restSeconds; self.exercise = exercise; self.sets = sets; self.version = version; self.deletedAt = deletedAt
    }

    private enum CodingKeys: String, CodingKey { case id, workoutEntryId, workoutId, exerciseId, sortOrder, note, restSeconds, exercise, sets, version, deletedAt }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        workoutEntryId = try c.decodeIfPresent(String.self, forKey: .workoutEntryId) ?? c.decode(String.self, forKey: .workoutId)
        exerciseId = try c.decode(String.self, forKey: .exerciseId)
        sortOrder = try c.decodeIfPresent(Int.self, forKey: .sortOrder) ?? 0
        note = try c.decodeIfPresent(String.self, forKey: .note)
        restSeconds = try c.decodeIfPresent(Int.self, forKey: .restSeconds)
        exercise = try c.decodeIfPresent(ExerciseModel.self, forKey: .exercise)
        sets = try c.decodeIfPresent([WorkoutSetModel].self, forKey: .sets) ?? []
        version = try c.decodeIfPresent(Int.self, forKey: .version)
        deletedAt = try c.decodeIfPresent(String.self, forKey: .deletedAt)
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        // Keep both names while the API and pre-granular snapshots converge.
        try c.encode(workoutEntryId, forKey: .workoutEntryId)
        try c.encode(workoutEntryId, forKey: .workoutId)
        try c.encode(exerciseId, forKey: .exerciseId)
        try c.encode(sortOrder, forKey: .sortOrder)
        try c.encodeIfPresent(note, forKey: .note)
        try c.encodeIfPresent(restSeconds, forKey: .restSeconds)
        try c.encodeIfPresent(exercise, forKey: .exercise)
        try c.encodeIfPresent(sets, forKey: .sets)
        try c.encodeIfPresent(version, forKey: .version)
        try c.encodeIfPresent(deletedAt, forKey: .deletedAt)
    }
}

public struct WorkoutSetModel: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public let workoutExerciseId: String
    public let sortOrder: Int
    public let type: String
    public let reps: Int?
    public let weight: Double?
    public let durationSeconds: Int?
    public let distanceMeters: Double?
    public let rpe: Double?
    public let completedAt: String?
    public let version: Int?
    public let deletedAt: String?

    public init(id: String, workoutExerciseId: String, sortOrder: Int, type: String, reps: Int?, weight: Double?, durationSeconds: Int?, distanceMeters: Double?, rpe: Double?, completedAt: String?, version: Int? = 1, deletedAt: String? = nil) {
        self.id = id; self.workoutExerciseId = workoutExerciseId; self.sortOrder = sortOrder; self.type = type; self.reps = reps; self.weight = weight
        self.durationSeconds = durationSeconds; self.distanceMeters = distanceMeters; self.rpe = rpe; self.completedAt = completedAt; self.version = version; self.deletedAt = deletedAt
    }

    private enum CodingKeys: String, CodingKey { case id, workoutExerciseId, sortOrder, type, reps, weight, durationSeconds, distanceMeters, rpe, completedAt, version, deletedAt }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        workoutExerciseId = try c.decode(String.self, forKey: .workoutExerciseId)
        sortOrder = try c.decodeIfPresent(Int.self, forKey: .sortOrder) ?? 0
        type = try c.decodeIfPresent(String.self, forKey: .type) ?? "NORMAL"
        reps = (try? c.decodeFlexibleDoubleIfPresent(forKey: .reps)).map(Int.init)
        weight = try? c.decodeFlexibleDoubleIfPresent(forKey: .weight)
        durationSeconds = (try? c.decodeFlexibleDoubleIfPresent(forKey: .durationSeconds)).map(Int.init)
        distanceMeters = try? c.decodeFlexibleDoubleIfPresent(forKey: .distanceMeters)
        rpe = try? c.decodeFlexibleDoubleIfPresent(forKey: .rpe)
        completedAt = try c.decodeIfPresent(String.self, forKey: .completedAt)
        version = try c.decodeIfPresent(Int.self, forKey: .version)
        deletedAt = try c.decodeIfPresent(String.self, forKey: .deletedAt)
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(workoutExerciseId, forKey: .workoutExerciseId)
        try c.encode(sortOrder, forKey: .sortOrder)
        try c.encode(type, forKey: .type)
        try c.encodeIfPresent(reps, forKey: .reps)
        try c.encodeIfPresent(weight, forKey: .weight)
        try c.encodeIfPresent(durationSeconds, forKey: .durationSeconds)
        try c.encodeIfPresent(distanceMeters, forKey: .distanceMeters)
        try c.encodeIfPresent(rpe, forKey: .rpe)
        try c.encodeIfPresent(completedAt, forKey: .completedAt)
        try c.encodeIfPresent(version, forKey: .version)
        try c.encodeIfPresent(deletedAt, forKey: .deletedAt)
    }
}

private extension KeyedDecodingContainer {
    func decodeFlexibleDouble(forKey key: Key) throws -> Double {
        if let value = try? decode(Double.self, forKey: key) { return value }
        if let value = try? decode(String.self, forKey: key), let number = Double(value) { return number }
        return 0
    }

    func decodeFlexibleDoubleIfPresent(forKey key: Key) throws -> Double? {
        if let value = try? decode(Double.self, forKey: key) { return value }
        if let value = try? decode(String.self, forKey: key) { return Double(value) }
        return nil
    }
}
