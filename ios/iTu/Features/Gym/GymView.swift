import SwiftUI
import iTuDomain
import iTuDesignCore

public typealias Phase6GymView = GymView

public enum IOSGymSetValidation {
    public static func error(metric: String, reps: String, weight: String, duration: String, distance: String) -> String? {
        switch metric {
        case "WEIGHT_REPS", "REPS":
            let trimmedReps = reps.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmedReps.isEmpty {
                guard let r = Int(trimmedReps), r > 0 else {
                    return "Reps must be a positive whole number."
                }
            }
            let trimmedWeight = weight.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmedWeight.isEmpty {
                guard let w = Double(trimmedWeight), w >= 0 else {
                    return "Weight must be a non-negative number."
                }
            }
            return nil
        case "DURATION":
            let trimmed = duration.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty {
                guard let d = Int(trimmed), d > 0 else {
                    return "Duration must be a positive whole number of seconds."
                }
            }
            return nil
        case "DISTANCE_DURATION":
            let trimmedDist = distance.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmedDist.isEmpty {
                guard let dist = Double(trimmedDist), dist >= 0 else {
                    return "Distance must be a non-negative number."
                }
            }
            let trimmedDur = duration.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmedDur.isEmpty {
                guard let dur = Int(trimmedDur), dur > 0 else {
                    return "Duration must be a positive whole number of seconds."
                }
            }
            return nil
        default:
            return nil
        }
    }

    public static func patch(metric: String, reps: String, weight: String, duration: String, distance: String, completedAt: String?) -> [String: JSONValue]? {
        if error(metric: metric, reps: reps, weight: weight, duration: duration, distance: distance) != nil {
            return nil
        }
        var dict: [String: JSONValue] = [:]
        switch metric {
        case "WEIGHT_REPS", "REPS":
            let trimmedReps = reps.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmedReps.isEmpty, let r = Int(trimmedReps) {
                dict["reps"] = .number(Double(r))
            }
            let trimmedWeight = weight.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmedWeight.isEmpty, let w = Double(trimmedWeight) {
                dict["weight"] = .number(w)
            }
        case "DURATION":
            let trimmedDur = duration.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmedDur.isEmpty, let d = Int(trimmedDur) {
                dict["durationSeconds"] = .number(Double(d))
            }
        case "DISTANCE_DURATION":
            let trimmedDist = distance.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmedDist.isEmpty, let dist = Double(trimmedDist) {
                dict["distanceMeters"] = .number(dist)
            }
            let trimmedDur = duration.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmedDur.isEmpty, let dur = Int(trimmedDur) {
                dict["durationSeconds"] = .number(Double(dur))
            }
        default:
            break
        }
        if let completedAt {
            dict["completedAt"] = .string(completedAt)
        }
        return dict
    }
}

public struct GymView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.colorScheme) private var colorScheme
    @State private var workoutTitle = ""
    @State private var selectedWorkoutID: String?
    @State private var showingExercisePicker = false
    @State private var restEndsAt: Date?
    @State private var pendingRemoval: WorkoutExerciseModel?
    @State private var removedExerciseForUndo: WorkoutExerciseModel?
    @State private var showingUndoRemoval = false

    public init() {}

    private var activeWorkout: WorkoutModel? {
        model.gymWorkouts.first { ["IN_PROGRESS", "ACTIVE"].contains($0.status) }
    }

    public var body: some View {
        IOSPage {
            // Header or active banner
            if let active = activeWorkout {
                activeWorkoutHero(active)
            } else {
                startWorkoutCard
            }

            // Sync issue banner
            IOSSyncIssueBanner()

            // Exercise Library Section
            exerciseLibrarySection
        }
        .navigationTitle("Gym")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                IOSSyncStatusIndicator()
            }
        }
    }

    // MARK: - Active Workout Hero

    private func activeWorkoutHero(_ workout: WorkoutModel) -> some View {
        IOSHeroCard {
            VStack(alignment: .leading, spacing: IOSSpacing.compact) {
                HStack {
                    Label("ACTIVE WORKOUT", systemImage: "dumbbell.fill")
                        .font(IOSTypography.kicker)
                        .tracking(1.2)
                        .foregroundStyle(IOSColor.mint(colorScheme))
                    Spacer()
                    Circle()
                        .fill(IOSColor.mint(colorScheme))
                        .frame(width: 8, height: 8)
                }

                Text(workout.title.isEmpty ? "Workout in Progress" : workout.title)
                    .font(IOSTypography.title)
                    .foregroundStyle(.white)

                Text("\(workout.exercises?.count ?? 0) exercises logged")
                    .font(IOSTypography.subheadline)
                    .foregroundStyle(.white.opacity(0.85))

                HStack(spacing: IOSSpacing.compact) {
                    Button {
                        Task { await model.completeGymWorkout(id: workout.id) }
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "checkmark")
                            Text("Finish Workout")
                        }
                        .font(IOSTypography.headline)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .background(IOSColor.mint(colorScheme), in: Capsule())
                        .foregroundStyle(IOSColor.forestDeep(colorScheme))
                    }
                    .buttonStyle(.plain)
                }
                .padding(.top, 4)
            }
        }
    }

    // MARK: - Start Workout Card

    private var startWorkoutCard: some View {
        IOSCard {
            VStack(alignment: .leading, spacing: IOSSpacing.compact) {
                Text("START WORKOUT")
                    .font(IOSTypography.kicker)
                    .tracking(1.2)
                    .foregroundStyle(IOSColor.teal(colorScheme))

                TextField("Workout Name (optional)", text: $workoutTitle)
                    .font(IOSTypography.subheadline)
                    .padding(IOSSpacing.compact)
                    .background(IOSColor.surfaceMuted(colorScheme), in: RoundedRectangle(cornerRadius: IOSCornerRadius.control, style: .continuous))

                Button {
                    Task { _ = await model.startGymWorkout(title: workoutTitle) }
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "play.fill")
                        Text("Start Empty Workout")
                    }
                    .font(IOSTypography.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(IOSColor.teal(colorScheme), in: RoundedRectangle(cornerRadius: IOSCornerRadius.control, style: .continuous))
                    .foregroundStyle(.white)
                }
                .buttonStyle(.plain)

                if !model.gymRoutines.isEmpty {
                    Divider()
                    Text("ROUTINES")
                        .font(IOSTypography.kicker)
                        .tracking(1.2)
                        .foregroundStyle(IOSColor.inkDim(colorScheme))

                    ForEach(model.gymRoutines.filter { $0.deletedAt == nil && $0.archivedAt == nil }) { routine in
                        Button {
                            Task { _ = await model.startGymWorkoutFromRoutine(routineId: routine.id) }
                        } label: {
                            HStack {
                                Image(systemName: "dumbbell.fill")
                                    .foregroundStyle(IOSColor.teal(colorScheme))
                                Text(routine.name)
                                    .font(IOSTypography.subheadline)
                                    .fontWeight(.medium)
                                    .foregroundStyle(IOSColor.ink(colorScheme))
                                Spacer()
                                Image(systemName: "play.circle.fill")
                                    .foregroundStyle(IOSColor.teal(colorScheme))
                            }
                            .padding(IOSSpacing.compact)
                            .background(IOSColor.surfaceMuted(colorScheme), in: RoundedRectangle(cornerRadius: IOSCornerRadius.control, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    // MARK: - Exercise Library Section

    private var exerciseLibrarySection: some View {
        IOSSection(title: "Exercise Library", subtitle: "\(model.gymExercises.count) exercises") {
            if model.gymExercises.isEmpty {
                IOSEmptyState(
                    icon: "figure.strengthtraining.traditional",
                    title: "No Exercises Found",
                    description: "Add exercises to track your strength progression."
                )
            } else {
                VStack(spacing: IOSSpacing.tight) {
                    ForEach(model.gymExercises.filter { $0.deletedAt == nil && $0.archivedAt == nil }) { exercise in
                        HStack(spacing: IOSSpacing.compact) {
                            Image(systemName: "figure.strengthtraining.traditional")
                                .font(.headline)
                                .foregroundStyle(IOSColor.teal(colorScheme))
                                .frame(width: 36, height: 36)
                                .background(IOSColor.mintTint(colorScheme), in: RoundedRectangle(cornerRadius: IOSCornerRadius.control, style: .continuous))

                            VStack(alignment: .leading, spacing: 2) {
                                Text(exercise.name)
                                    .font(IOSTypography.headline)
                                    .foregroundStyle(IOSColor.ink(colorScheme))
                                Text(exercise.metricType.replacingOccurrences(of: "_", with: " ").capitalized)
                                    .font(IOSTypography.caption)
                                    .foregroundStyle(IOSColor.inkDim(colorScheme))
                            }

                            Spacer()
                        }
                        .padding(IOSSpacing.normal)
                        .background(IOSColor.surface(colorScheme), in: RoundedRectangle(cornerRadius: IOSCornerRadius.row, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: IOSCornerRadius.row, style: .continuous).stroke(IOSColor.borderSoft(colorScheme), lineWidth: 1))
                    }
                }
            }
        }
    }
}
