import SwiftUI
import iTuDomain

struct Phase6GymView: View {
    @EnvironmentObject private var model: AppModel
    @State private var workoutTitle = ""
    @State private var selectedWorkoutID: String?
    @State private var showingExercisePicker = false
    @State private var restEndsAt: Date?
    @State private var pendingRemoval: WorkoutExerciseModel?
    @State private var removedExerciseForUndo: WorkoutExerciseModel?
    @State private var showingUndoRemoval = false

    private var activeWorkout: WorkoutModel? {
        model.gymWorkouts.first { ["IN_PROGRESS", "ACTIVE"].contains($0.status) }
    }

    var body: some View {
        List {
            SyncBanner()
            if let activeWorkout {
                activeSection(activeWorkout)
            } else {
                Section("Start a Workout") {
                    TextField("Workout name (optional)", text: $workoutTitle)
                    Button {
                        Task { _ = await model.startGymWorkout(title: workoutTitle) }
                    } label: {
                        Label("Start Workout", systemImage: "play.fill")
                    }
                    .buttonStyle(.borderedProminent)
                    if model.gymRoutines.isEmpty {
                        Text("No routines yet. Start a blank workout and add exercises from your library.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(model.gymRoutines.filter { $0.deletedAt == nil && $0.archivedAt == nil }) { routine in
                            Button {
                                Task { _ = await model.startGymWorkoutFromRoutine(routineId: routine.id) }
                            } label: {
                                Label("Start \(routine.name)", systemImage: "list.bullet.rectangle")
                            }
                        }
                    }
                }
            }

            Section("Exercise Library") {
                if model.gymExercises.filter({ $0.deletedAt == nil && $0.archivedAt == nil }).isEmpty {
                    Text("No exercises cached yet.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(model.gymExercises.filter { $0.deletedAt == nil && $0.archivedAt == nil }) { exercise in
                        HStack {
                            Image(systemName: "figure.strengthtraining.traditional")
                                .accessibilityHidden(true)
                            VStack(alignment: .leading) {
                                Text(exercise.name)
                                Text(exercise.metricType.replacingOccurrences(of: "_", with: " "))
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            if exercise.imageUrl == nil && exercise.imageStorageKey == nil {
                                Text("No image")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                    .accessibilityLabel("Image unavailable")
                            }
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
            }

            Section("History") {
                let history = model.gymWorkouts.filter { $0.status == "COMPLETED" && $0.deletedAt == nil }
                if history.isEmpty {
                    Text("Completed workouts will appear here.").foregroundStyle(.secondary)
                } else {
                    ForEach(history) { workout in
                        Button {
                            selectedWorkoutID = workout.id
                        } label: {
                            HStack {
                                VStack(alignment: .leading) {
                                    Text(workout.title)
                                    Text(workout.endedAt ?? workout.startedAt ?? "")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                Text("\((workout.exercises ?? []).flatMap { $0.sets ?? [] }.filter { $0.completedAt != nil }.count) sets")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .navigationTitle("Gym")
        .sheet(isPresented: $showingExercisePicker) {
            GymExercisePickerView(workout: activeWorkout)
        }
        .sheet(item: Binding(
            get: { selectedWorkoutID.map(Phase6GymSelection.init) },
            set: { selectedWorkoutID = $0?.id }
        )) { selection in
            if let workout = model.gymWorkouts.first(where: { $0.id == selection.id }) {
                GymHistoryDetailView(workout: workout)
            }
        }
        .confirmationDialog(
            "Remove exercise?",
            isPresented: Binding(
                get: { pendingRemoval != nil },
                set: { if !$0 { pendingRemoval = nil } }
            )
        ) {
            if let exercise = pendingRemoval {
                Button("Remove Exercise", role: .destructive) {
                    let value = exercise
                    pendingRemoval = nil
                    Task {
                        if await model.removeGymExercise(workoutID: value.workoutEntryId, workoutExerciseID: value.id) {
                            removedExerciseForUndo = value
                            showingUndoRemoval = true
                        }
                    }
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This removes the exercise and its sets from the active workout. You can undo immediately after removal.")
        }
        .alert("Exercise removed", isPresented: $showingUndoRemoval) {
            Button("Undo") {
                guard let value = removedExerciseForUndo else { return }
                removedExerciseForUndo = nil
                Task { _ = await model.restoreGymExercise(workoutID: value.workoutEntryId, exercise: value) }
            }
            Button("Done", role: .cancel) { removedExerciseForUndo = nil }
        } message: {
            Text("The exercise remains recoverable from this prompt until you dismiss it.")
        }
        .safeAreaInset(edge: .bottom) {
            if let restEndsAt {
                GymRestTimerView(endsAt: restEndsAt) {
                    self.restEndsAt = nil
                }
                .padding(.horizontal)
            }
        }
    }

    @ViewBuilder
    private func activeSection(_ workout: WorkoutModel) -> some View {
            Section {
            ViewThatFits(in: .horizontal) {
                HStack {
                    workoutSummary(workout)
                    Spacer(minLength: 8)
                    finishButton(workout)
                }
                VStack(alignment: .leading, spacing: 8) {
                    workoutSummary(workout)
                    finishButton(workout)
                }
            }
            Button {
                showingExercisePicker = true
            } label: {
                Label("Add Exercise", systemImage: "plus")
            }
        } header: {
            Text("Active Workout")
        }

        ForEach(workout.exercises ?? []) { workoutExercise in
            Section(workoutExercise.exercise?.name ?? "Exercise") {
                ForEach(workoutExercise.sets ?? []) { set in
                    GymSetRow(workoutID: workout.id, workoutExercise: workoutExercise, set: set) {
                        restEndsAt = Date().addingTimeInterval(TimeInterval(workoutExercise.restSeconds ?? model.gymPreferences.defaultRestSeconds))
                    }
                }
                ViewThatFits(in: .horizontal) {
                    HStack {
                        addSetButton(workoutID: workout.id, workoutExerciseID: workoutExercise.id)
                        removeExerciseButton(workoutExercise)
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        addSetButton(workoutID: workout.id, workoutExerciseID: workoutExercise.id)
                        removeExerciseButton(workoutExercise)
                    }
                }
            }
        }
    }

    private func workoutSummary(_ workout: WorkoutModel) -> some View {
        VStack(alignment: .leading) {
            Text(workout.title).font(.headline)
            Text(workout.startedAt ?? "Started locally")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private func finishButton(_ workout: WorkoutModel) -> some View {
        Button("Finish") {
            Task { _ = await model.completeGymWorkout(id: workout.id) }
        }
        .buttonStyle(.borderedProminent)
    }

    private func addSetButton(workoutID: String, workoutExerciseID: String) -> some View {
        Button {
            Task { _ = await model.addGymSet(workoutID: workoutID, workoutExerciseID: workoutExerciseID) }
        } label: {
            Label("Add Set", systemImage: "plus.circle")
        }
    }

    private func removeExerciseButton(_ exercise: WorkoutExerciseModel) -> some View {
        Button(role: .destructive) {
            pendingRemoval = exercise
        } label: {
            Label("Remove Exercise", systemImage: "minus.circle")
        }
        .accessibilityHint("Asks for confirmation before removing this exercise and its sets")
    }
}

private struct Phase6GymSelection: Identifiable {
    let id: String
}

private struct GymSetRow: View {
    @EnvironmentObject private var model: AppModel
    let workoutID: String
    let workoutExercise: WorkoutExerciseModel
    let set: WorkoutSetModel
    let onComplete: () -> Void
    @State private var reps: String
    @State private var weight: String
    @State private var duration: String
    @State private var distance: String

    init(workoutID: String, workoutExercise: WorkoutExerciseModel, set: WorkoutSetModel, onComplete: @escaping () -> Void) {
        self.workoutID = workoutID; self.workoutExercise = workoutExercise; self.set = set; self.onComplete = onComplete
        _reps = State(initialValue: set.reps.map(String.init) ?? "")
        _weight = State(initialValue: set.weight.map { String($0) } ?? "")
        _duration = State(initialValue: set.durationSeconds.map(String.init) ?? "")
        _distance = State(initialValue: set.distanceMeters.map { String($0) } ?? "")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Set \(set.sortOrder + 1)").font(.subheadline.weight(.medium))
                Spacer()
                if set.completedAt != nil { Label("Done", systemImage: "checkmark.circle.fill").foregroundStyle(.green) }
            }
            let metric = workoutExercise.exercise?.metricType ?? "WEIGHT_REPS"
            ViewThatFits(in: .horizontal) {
                HStack {
                    metricFields(metric)
                    saveButton(metric)
                }
                VStack(alignment: .leading, spacing: 8) {
                    metricFields(metric)
                    saveButton(metric)
                }
            }
            if let validationError {
                Label(validationError, systemImage: "exclamationmark.triangle")
                    .font(.caption)
                    .foregroundStyle(.red)
                    .accessibilityLabel("Set error: \(validationError)")
            }
        }
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder
    private func metricFields(_ metric: String) -> some View {
        if metric == "WEIGHT_REPS" {
            TextField("Reps", text: $reps).keyboardType(.numberPad)
                .accessibilityHint("Enter a positive whole number")
            TextField("Weight", text: $weight).keyboardType(.decimalPad)
                .accessibilityHint("Optional non-negative number")
        } else if metric == "DISTANCE_DURATION" {
            TextField("Distance", text: $distance).keyboardType(.decimalPad)
                .accessibilityHint("Enter a positive number")
            TextField("Seconds", text: $duration).keyboardType(.numberPad)
                .accessibilityHint("Enter a positive whole number")
        } else {
            TextField("Seconds", text: $duration).keyboardType(.numberPad)
                .accessibilityHint("Enter a positive whole number")
        }
    }

    private var validationError: String? {
        IOSGymSetValidation.error(metric: workoutExercise.exercise?.metricType ?? "WEIGHT_REPS", reps: reps, weight: weight, duration: duration, distance: distance)
    }

    private func saveButton(_ metric: String) -> some View {
        Button(set.completedAt == nil ? "Complete" : "Save") {
            guard let patch = IOSGymSetValidation.patch(metric: metric, reps: reps, weight: weight, duration: duration, distance: distance, completedAt: set.completedAt == nil ? IOSPhase6Clock.now() : nil) else { return }
            Task {
                if await model.updateGymSet(workoutID: workoutID, workoutExerciseID: workoutExercise.id, setID: set.id, patch: patch, complete: set.completedAt == nil) { onComplete() }
            }
        }
        .buttonStyle(.bordered)
        .disabled(validationError != nil)
    }
}

enum IOSGymSetValidation {
    static func error(metric: String, reps: String, weight: String, duration: String, distance: String) -> String? {
        switch metric {
        case "WEIGHT_REPS":
            guard positiveInt(reps) != nil else { return "Reps must be a positive whole number." }
            if !weight.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && nonNegativeDouble(weight) == nil { return "Weight must be a non-negative number." }
        case "DISTANCE_DURATION":
            guard positiveDouble(distance) != nil else { return "Distance must be a positive number." }
            guard positiveInt(duration) != nil else { return "Duration must be a positive whole number of seconds." }
        default:
            guard positiveInt(duration) != nil else { return "Duration must be a positive whole number of seconds." }
        }
        return nil
    }

    static func patch(metric: String, reps: String, weight: String, duration: String, distance: String, completedAt: String?) -> [String: JSONValue]? {
        guard error(metric: metric, reps: reps, weight: weight, duration: duration, distance: distance) == nil else { return nil }
        var patch: [String: JSONValue] = [:]
        switch metric {
        case "WEIGHT_REPS":
            guard let repsValue = positiveInt(reps) else { return nil }
            patch["reps"] = .number(Double(repsValue))
            if weight.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                patch["weight"] = .null
            } else {
                guard let weightValue = nonNegativeDouble(weight) else { return nil }
                patch["weight"] = .number(weightValue)
            }
        case "DISTANCE_DURATION":
            guard let distanceValue = positiveDouble(distance), let durationValue = positiveInt(duration) else { return nil }
            patch["distanceMeters"] = .number(distanceValue)
            patch["durationSeconds"] = .number(Double(durationValue))
        default:
            guard let durationValue = positiveInt(duration) else { return nil }
            patch["durationSeconds"] = .number(Double(durationValue))
        }
        if let completedAt { patch["completedAt"] = .string(completedAt) }
        return patch
    }

    private static func positiveInt(_ value: String) -> Int? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let parsed = Int(trimmed), parsed > 0 else { return nil }
        return parsed
    }

    private static func positiveDouble(_ value: String) -> Double? {
        guard let parsed = nonNegativeDouble(value), parsed > 0 else { return nil }
        return parsed
    }

    private static func nonNegativeDouble(_ value: String) -> Double? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let parsed = Double(trimmed), parsed.isFinite, parsed >= 0 else { return nil }
        return parsed
    }
}

private struct GymRestTimerView: View {
    let endsAt: Date
    let onDismiss: () -> Void

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let remaining = max(0, Int(endsAt.timeIntervalSince(context.date).rounded(.up)))
            HStack {
                Label("Rest", systemImage: "timer")
                Spacer()
                Text("\(remaining)s")
                    .monospacedDigit()
                    .accessibilityLabel("Rest timer, \(remaining) seconds remaining")
                Button("Stop", action: onDismiss)
                    .buttonStyle(.bordered)
            }
            .padding(12)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
    }
}

private struct GymExercisePickerView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var model: AppModel
    let workout: WorkoutModel?

    var body: some View {
        NavigationStack {
            List(model.gymExercises.filter { $0.deletedAt == nil && $0.archivedAt == nil }) { exercise in
                Button {
                    guard let workout else { return }
                    Task {
                        _ = await model.addGymExercise(workoutID: workout.id, exerciseID: exercise.id)
                        dismiss()
                    }
                } label: {
                    Label(exercise.name, systemImage: "figure.strengthtraining.traditional")
                }
            }
            .navigationTitle("Add Exercise")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel", action: dismiss.callAsFunction) } }
        }
    }
}

private struct GymHistoryDetailView: View {
    @EnvironmentObject private var model: AppModel
    let workout: WorkoutModel
    @State private var healthKitMessage: String?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text(workout.title).font(.headline)
                    if let duration = workout.durationMinutes { Text("\(duration) minutes") }
                    Button {
                        Task {
                            switch await model.writeGymWorkoutToHealthKit(id: workout.id) {
                            case .saved: healthKitMessage = "Workout saved to Apple Health."
                            case .alreadySaved: healthKitMessage = "This workout is already in Apple Health."
                            case nil: healthKitMessage = "Apple Health could not save this workout."
                            }
                        }
                    } label: {
                        Label("Save to Apple Health", systemImage: "heart.text.square")
                    }
                }
                ForEach(workout.exercises ?? []) { exercise in
                    Section(exercise.exercise?.name ?? "Exercise") {
                        ForEach(exercise.sets ?? []) { set in
                            Text([set.reps.map { "\($0) reps" }, set.weight.map { "\($0) weight" }, set.durationSeconds.map { "\($0)s" }, set.distanceMeters.map { "\($0)m" }].compactMap { $0 }.joined(separator: " · "))
                        }
                    }
                }
            }
            .navigationTitle("Workout History")
            .alert("Apple Health", isPresented: Binding(
                get: { healthKitMessage != nil },
                set: { if !$0 { healthKitMessage = nil } }
            )) {
                Button("Done", role: .cancel) { healthKitMessage = nil }
            } message: {
                Text(healthKitMessage ?? "")
            }
        }
    }
}
