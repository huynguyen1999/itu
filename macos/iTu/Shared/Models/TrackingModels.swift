import Foundation

// MARK: - Budget Models

struct BudgetOverviewModel: Codable, Sendable {
    let period: String
    let currency: String
    let income: Double
    let spent: Double
    let overallBudget: Double
    let remainingBudget: Double
    let categories: [BudgetCategoryStatModel]
}

struct BudgetCategoryStatModel: Codable, Sendable, Identifiable {
    var id: String { category.id }
    let category: BudgetCategoryModel
    let budget: Double
    let spent: Double
    let remaining: Double
    let percentage: Double
}

struct BudgetCategoryModel: Codable, Sendable, Identifiable {
    let id: String
    let userId: String
    let name: String
    let type: String
    let icon: String?
    let color: String?
    let sortOrder: Int
    let archivedAt: String?
}

struct BudgetTransactionModel: Codable, Sendable, Identifiable {
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
}

// MARK: - Gym Models

struct GymOverviewModel: Codable, Sendable {
    let weeklyWorkoutsCount: Int
    let weeklySetsCount: Int
    let weeklyVolumeKg: Int
    let recentWorkouts: [WorkoutModel]
}

struct ExerciseModel: Codable, Sendable, Identifiable {
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
}

struct WorkoutModel: Codable, Sendable, Identifiable {
    let id: String
    let userId: String
    let title: String
    let status: String
    let startedAt: String?
    let endedAt: String?
    let durationMinutes: Int?
    let exercises: [WorkoutExerciseModel]?
}

struct WorkoutExerciseModel: Codable, Sendable, Identifiable {
    let id: String
    let workoutEntryId: String
    let exerciseId: String
    let sortOrder: Int
    let note: String?
    let restSeconds: Int?
    let exercise: ExerciseModel?
    let sets: [WorkoutSetModel]?
}

struct WorkoutSetModel: Codable, Sendable, Identifiable {
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
