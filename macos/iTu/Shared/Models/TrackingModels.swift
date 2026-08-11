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
    var showRpe: Bool = false
    var soundsEnabled: Bool = true
    var restSoundEnabled: Bool = true
    var completionSoundEnabled: Bool = true
    var favoriteExerciseIDs: [String] = []
    var recentExerciseIDs: [String] = []
    var weeklyWorkoutGoal: Int?

    private enum CodingKeys: String, CodingKey {
        case weightUnit, distanceUnit, defaultRestSeconds, autoStartRestTimer,
             previousPerformanceMode, showRpe, soundsEnabled, favoriteExerciseIDs,
             restSoundEnabled, completionSoundEnabled, recentExerciseIDs, weeklyWorkoutGoal
    }

    init(
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

    init(from decoder: Decoder) throws {
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
    let deletedByDeviceId: String?

    init(id: String, userId: String, type: String, amount: Double, currency: String, category: String, categoryId: String?, merchant: String?, paymentMethod: String, transactionAt: String, note: String?, version: Int?, createdAt: String?, updatedAt: String?, deletedAt: String?, deletedByDeviceId: String? = nil) {
        self.id = id; self.userId = userId; self.type = type; self.amount = amount; self.currency = currency; self.category = category; self.categoryId = categoryId; self.merchant = merchant; self.paymentMethod = paymentMethod; self.transactionAt = transactionAt; self.note = note; self.version = version; self.createdAt = createdAt; self.updatedAt = updatedAt; self.deletedAt = deletedAt; self.deletedByDeviceId = deletedByDeviceId
    }
}

/// The API sends money as decimal strings. Keep the native display model
/// convenient while accepting both the legacy JSON number and the canonical
/// string representation.
extension BudgetTransactionModel {
    enum CodingKeys: String, CodingKey {
        case id, userId, type, amount, currency, category, categoryId, merchant,
             paymentMethod, transactionAt, note, version, createdAt, updatedAt, deletedAt, deletedByDeviceId
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
        deletedByDeviceId = try c.decodeIfPresent(String.self, forKey: .deletedByDeviceId)
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
    /// Recoverable deletion is distinct from archival.  The tombstone stays
    /// in the offline snapshot so Trash can render it after a restart.
    let deletedAt: String?
    let deletedByDeviceId: String?
    let version: Int?

    init(id: String, userId: String, name: String, normalizedName: String, description: String?, imageStorageKey: String?, imageUrl: String?, metricType: String, equipment: String?, primaryMuscleGroup: String?, secondaryMuscleGroups: [String]?, defaultWeightUnit: String, defaultRestSeconds: Int?, archivedAt: String?, deletedAt: String?, version: Int?, deletedByDeviceId: String? = nil) {
        self.id = id; self.userId = userId; self.name = name; self.normalizedName = normalizedName; self.description = description; self.imageStorageKey = imageStorageKey; self.imageUrl = imageUrl; self.metricType = metricType; self.equipment = equipment; self.primaryMuscleGroup = primaryMuscleGroup; self.secondaryMuscleGroups = secondaryMuscleGroups; self.defaultWeightUnit = defaultWeightUnit; self.defaultRestSeconds = defaultRestSeconds; self.archivedAt = archivedAt; self.deletedAt = deletedAt; self.version = version; self.deletedByDeviceId = deletedByDeviceId
    }
}

struct ExerciseStatsModel: Codable, Equatable, Sendable {
    let exercise: ExerciseModel?
    let totalSets: Int
    let totalVolumeKg: Double
    let bestWeight: Double?
    let bestReps: Int?
    let lastPerformedAt: String?
    let estimated1RM: Double?
    let volumeTrend: [Double]
    let recentSets: [WorkoutSetModel]

    init(exercise: ExerciseModel? = nil, totalSets: Int = 0, totalVolumeKg: Double = 0, bestWeight: Double? = nil, bestReps: Int? = nil, lastPerformedAt: String? = nil, estimated1RM: Double? = nil, volumeTrend: [Double] = [], recentSets: [WorkoutSetModel] = []) {
        self.exercise = exercise; self.totalSets = totalSets; self.totalVolumeKg = totalVolumeKg; self.bestWeight = bestWeight
        self.bestReps = bestReps; self.lastPerformedAt = lastPerformedAt; self.estimated1RM = estimated1RM; self.volumeTrend = volumeTrend; self.recentSets = recentSets
    }

    private enum CodingKeys: String, CodingKey { case exercise, totalSets, totalVolumeKg, bestWeight, bestReps, lastPerformedAt, estimated1RM, heaviestWeight, bestVolumeSet, recentSets, volumeTrend }

    init(from decoder: Decoder) throws {
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

    func encode(to encoder: Encoder) throws {
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
    let deletedByDeviceId: String?

    init(id: String, userId: String, title: String, status: String, startedAt: String?, endedAt: String?, durationMinutes: Int?, exercises: [WorkoutExerciseModel]?, version: Int?, deletedAt: String?, deletedByDeviceId: String? = nil) {
        self.id = id; self.userId = userId; self.title = title; self.status = status; self.startedAt = startedAt; self.endedAt = endedAt; self.durationMinutes = durationMinutes; self.exercises = exercises; self.version = version; self.deletedAt = deletedAt; self.deletedByDeviceId = deletedByDeviceId
    }
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
    let version: Int?
    let deletedAt: String?

    init(id: String, workoutEntryId: String, exerciseId: String, sortOrder: Int, note: String?, restSeconds: Int?, exercise: ExerciseModel?, sets: [WorkoutSetModel]?, version: Int? = 1, deletedAt: String? = nil) {
        self.id = id; self.workoutEntryId = workoutEntryId; self.exerciseId = exerciseId; self.sortOrder = sortOrder; self.note = note
        self.restSeconds = restSeconds; self.exercise = exercise; self.sets = sets; self.version = version; self.deletedAt = deletedAt
    }

    private enum CodingKeys: String, CodingKey { case id, workoutEntryId, workoutId, exerciseId, sortOrder, note, restSeconds, exercise, sets, version, deletedAt }

    init(from decoder: Decoder) throws {
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

    func encode(to encoder: Encoder) throws {
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
    let version: Int?
    let deletedAt: String?

    init(id: String, workoutExerciseId: String, sortOrder: Int, type: String, reps: Int?, weight: Double?, durationSeconds: Int?, distanceMeters: Double?, rpe: Double?, completedAt: String?, version: Int? = 1, deletedAt: String? = nil) {
        self.id = id; self.workoutExerciseId = workoutExerciseId; self.sortOrder = sortOrder; self.type = type; self.reps = reps; self.weight = weight
        self.durationSeconds = durationSeconds; self.distanceMeters = distanceMeters; self.rpe = rpe; self.completedAt = completedAt; self.version = version; self.deletedAt = deletedAt
    }

    private enum CodingKeys: String, CodingKey { case id, workoutExerciseId, sortOrder, type, reps, weight, durationSeconds, distanceMeters, rpe, completedAt, version, deletedAt }

    init(from decoder: Decoder) throws {
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

    func encode(to encoder: Encoder) throws {
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
