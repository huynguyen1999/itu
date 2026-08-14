import SwiftUI

enum GymSupport {
    static let muscleGroups = ["Chest", "Back", "Legs", "Shoulders", "Arms", "Core", "Full Body", "Cardio", "Other"]
    static let equipmentOptions = ["Barbell", "Dumbbell", "Cable", "Machine", "Bodyweight", "Kettlebell", "Bands", "Smith Machine", "Other"]
    static let metricTypes: [(key: String, label: String)] = [
        ("WEIGHT_REPS", "Weight & Reps"),
        ("REPS", "Reps Only"),
        ("DURATION", "Duration"),
        ("DISTANCE_DURATION", "Distance & Time")
    ]

    static func formatWeight(_ value: Double?, unit: String) -> String {
        guard let value else { return "--" }
        if value.truncatingRemainder(dividingBy: 1) == 0 {
            return "\(Int(value)) \(unit.lowercased())"
        }
        return "\(String(format: "%.1f", value)) \(unit.lowercased())"
    }

    static func formatDuration(_ seconds: Int) -> String {
        let mins = seconds / 60
        let secs = seconds % 60
        if mins >= 60 {
            let hours = mins / 60
            let remMins = mins % 60
            return "\(hours)h \(remMins)m"
        }
        return String(format: "%02d:%02d", mins, secs)
    }

    static func workoutVolume(for workout: WorkoutModel) -> Double {
        let sets = (workout.exercises ?? []).flatMap { $0.sets ?? [] }.filter { $0.completedAt != nil }
        return sets.reduce(0) { $0 + ($1.weight ?? 0) * Double($1.reps ?? 0) }
    }

    static func calculate1RM(weight: Double, reps: Int) -> Double {
        guard reps > 0 else { return weight }
        if reps == 1 { return weight }
        return weight * (1.0 + Double(reps) / 30.0)
    }
}
