import SwiftUI
import AppKit

struct ActiveWorkoutView: View {
    @Environment(AppModel.self) private var model
    let workout: WorkoutModel
    var onFinished: () -> Void
    var onDiscarded: () -> Void
    var isHistorical = false

    @State private var restTimer = GymRestTimer()
    @State private var clockNow = Date()
    @State private var showingFinishAlert = false
    @State private var showingDiscardAlert = false
    @State private var showingExercisePicker = false
    @State private var editingTitle = ""
    @State private var editingStartedAt = ""
    @State private var editingDuration = ""
    @State private var isSavingTitle = false
    @State private var pickerSearch = ""
    @State private var pickerMuscle = "All"

    private var unit: String {
        model.gymPreferences.weightUnit
    }

    private var exercises: [WorkoutExerciseModel] {
        workout.exercises ?? []
    }

    private var completedSetsCount: Int {
        exercises.flatMap { $0.sets ?? [] }.filter { $0.completedAt != nil }.count
    }

    private var totalSetsCount: Int {
        exercises.flatMap { $0.sets ?? [] }.count
    }

    private var totalVolume: Double {
        GymSupport.workoutVolume(for: workout)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            // Workout Top Header
            workoutHeader

            // Rest Timer Toolbar
            restTimerBar

            // Exercises List
            if exercises.isEmpty {
                emptyExercisesCard
            } else {
                VStack(spacing: 16) {
                    ForEach(exercises) { ex in
                        exerciseSection(ex)
                    }
                }
            }

            // Add Exercise Action
            Button {
                showingExercisePicker = true
            } label: {
                Label("Add Exercise", systemImage: "plus.circle.fill")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
            }
            .buttonStyle(.bordered)
            .tint(iTuTheme.teal)

            if isHistorical {
                HStack {
                    Spacer()
                    Button("Done") { onFinished() }
                        .buttonStyle(.borderedProminent)
                        .tint(iTuTheme.teal)
                }
                .padding(.top, 10)
            } else {
                // Finish / Discard Footer
                HStack(spacing: 12) {
                    Button(role: .destructive) {
                        showingDiscardAlert = true
                    } label: {
                        Label("Discard Workout", systemImage: "trash")
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.regular)

                    Spacer()

                    Button {
                        showingFinishAlert = true
                    } label: {
                        Label("Finish Workout", systemImage: "checkmark.circle.fill")
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(iTuTheme.teal)
                    .controlSize(.regular)
                }
                .padding(.top, 10)
            }
        }
        .onAppear {
            editingTitle = workout.title
            editingStartedAt = String((workout.startedAt ?? "").prefix(10))
            editingDuration = workout.durationMinutes.map(String.init) ?? ""
        }
        .task(id: restTimer.isRunning) {
            guard restTimer.isRunning else { return }
            while !Task.isCancelled && restTimer.isRunning {
                clockNow = Date()
                if restTimer.remaining <= 0 {
                    restTimer.stop()
                    if model.gymPreferences.soundsEnabled && model.gymPreferences.restSoundEnabled {
                        NSSound.beep()
                    }
                    break
                }
                try? await Task.sleep(for: .seconds(1))
            }
        }
        .alert("Finish workout?", isPresented: $showingFinishAlert) {
            Button("Finish Workout") {
                Task {
                    let completed = await model.completeGymWorkout(id: workout.id)
                    if completed {
                        if model.gymPreferences.soundsEnabled && model.gymPreferences.completionSoundEnabled {
                            NSSound.beep()
                        }
                        onFinished()
                    }
                }
            }
            Button("Keep Training", role: .cancel) {}
        } message: {
            Text("You completed \(completedSetsCount) of \(totalSetsCount) sets with a total volume of \(Int(totalVolume)) \(unit.lowercased()).")
        }
        .alert("Discard workout?", isPresented: $showingDiscardAlert) {
            Button("Discard", role: .destructive) {
                Task {
                    _ = await model.deleteGymWorkout(id: workout.id)
                    onDiscarded()
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This session will not be saved to workout history. You can restore it from Trash if needed.")
        }
        .sheet(isPresented: $showingExercisePicker) {
            exercisePickerSheet
        }
    }

    private var workoutHeader: some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 8) {
                    TextField("Workout title", text: $editingTitle)
                        .font(.system(size: 20, weight: .bold, design: .rounded))
                        .textFieldStyle(.plain)
                        .onSubmit {
                            saveWorkoutTitle()
                        }

                        Text(isHistorical ? "· Completed" : "· Active")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(iTuTheme.teal)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(iTuTheme.teal.opacity(0.12))
                        .clipShape(Capsule())
                }

                HStack(spacing: 12) {
                    Text("\(completedSetsCount)/\(totalSetsCount) sets completed")
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(iTuTheme.inkDim)
                    Text("· Total volume: \(Int(totalVolume)) \(unit.lowercased())")
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(iTuTheme.inkDim)
                }

                if isHistorical {
                    HStack(spacing: 8) {
                        Text("Date")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(iTuTheme.inkDim)
                        TextField("YYYY-MM-DD", text: $editingStartedAt)
                            .textFieldStyle(.roundedBorder)
                            .frame(width: 110)
                        Text("Minutes")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(iTuTheme.inkDim)
                        TextField("—", text: $editingDuration)
                            .textFieldStyle(.roundedBorder)
                            .frame(width: 60)
                        Button("Save") { saveWorkoutMetadata() }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                    }
                }
            }

            Spacer()
        }
        .padding(16)
        .background(iTuTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(iTuTheme.border, lineWidth: 1)
        }
    }

    private var restTimerBar: some View {
        HStack(spacing: 14) {
            Image(systemName: "timer")
                .font(.system(size: 20))
                .foregroundStyle(restTimer.isRunning ? iTuTheme.teal : iTuTheme.inkDim)

            if restTimer.isRunning {
                let remaining = Int(restTimer.remaining)
                VStack(alignment: .leading, spacing: 1) {
                    Text("REST TIMER")
                        .font(.system(size: 9, weight: .bold, design: .monospaced))
                        .foregroundStyle(iTuTheme.teal)
                    Text(GymSupport.formatDuration(remaining))
                        .font(.system(size: 16, weight: .bold, design: .monospaced))
                        .foregroundStyle(iTuTheme.ink)
                }

                Spacer()

                Button("-15s") {
                    restTimer.adjust(by: -15)
                }
                .buttonStyle(.bordered)
                .controlSize(.small)

                Button("+15s") {
                    restTimer.adjust(by: 15)
                }
                .buttonStyle(.bordered)
                .controlSize(.small)

                Button("Skip") {
                    restTimer.stop()
                }
                .buttonStyle(.borderedProminent)
                .tint(iTuTheme.inkDim)
                .controlSize(.small)
            } else {
                Text("Rest Timer Idle")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(iTuTheme.inkDim)

                Spacer()

                Button("Start \(model.gymPreferences.defaultRestSeconds)s Rest") {
                    restTimer.start(seconds: model.gymPreferences.defaultRestSeconds)
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(restTimer.isRunning ? iTuTheme.teal.opacity(0.08) : iTuTheme.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(restTimer.isRunning ? iTuTheme.teal.opacity(0.3) : iTuTheme.border, lineWidth: 1)
        }
    }

    private var emptyExercisesCard: some View {
        VStack(spacing: 8) {
            Image(systemName: "dumbbell.fill")
                .font(.system(size: 28))
                .foregroundStyle(iTuTheme.teal)
            Text("No exercises added yet.")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(iTuTheme.ink)
            Text("Add exercises from your library to start logging sets.")
                .font(.system(size: 11))
                .foregroundStyle(iTuTheme.inkDim)
        }
        .frame(maxWidth: .infinity, minHeight: 120)
        .background(iTuTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(iTuTheme.border, lineWidth: 1)
        }
    }

    private func exerciseSection(_ ex: WorkoutExerciseModel) -> some View {
        let sets = ex.sets ?? []
        let metric = ex.exercise?.metricType ?? "WEIGHT_REPS"

        return VStack(alignment: .leading, spacing: 10) {
            // Exercise Header
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(ex.exercise?.name ?? "Exercise")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(iTuTheme.ink)

                    HStack(spacing: 6) {
                        if let muscle = ex.exercise?.primaryMuscleGroup {
                            Text(muscle)
                                .font(.system(size: 9, weight: .semibold))
                                .foregroundStyle(iTuTheme.teal)
                        }
                        if let equip = ex.exercise?.equipment {
                            Text("· \(equip)")
                                .font(.system(size: 9))
                                .foregroundStyle(iTuTheme.inkDim)
                        }
                    }
                }

                Spacer()

                Button {
                    Task { _ = await model.removeGymExercise(workoutID: workout.id, workoutExerciseID: ex.id) }
                } label: {
                    Image(systemName: "trash")
                }
                .buttonStyle(.borderless)
                .font(.system(size: 12))
                .foregroundStyle(iTuTheme.coral)
                .accessibilityLabel("Remove exercise")
            }

            // Sets Table
            VStack(spacing: 6) {
                // Table Header
                HStack(spacing: 8) {
                    Text("SET")
                        .frame(width: 44, alignment: .leading)
                    Text("PREVIOUS")
                        .frame(width: 80, alignment: .leading)
                    if metric == "WEIGHT_REPS" {
                        Text("\(unit.uppercased())")
                            .frame(width: 70, alignment: .leading)
                        Text("REPS")
                            .frame(width: 60, alignment: .leading)
                    } else if metric == "REPS" {
                        Text("REPS")
                            .frame(width: 70, alignment: .leading)
                    } else if metric == "DURATION" {
                        Text("SECS")
                            .frame(width: 70, alignment: .leading)
                    } else if metric == "DISTANCE_DURATION" {
                        Text("METERS")
                            .frame(width: 70, alignment: .leading)
                        Text("SECS")
                            .frame(width: 60, alignment: .leading)
                    }
                    if model.gymPreferences.showRpe {
                        Text("RPE")
                            .frame(width: 44, alignment: .leading)
                    }
                    Spacer()
                    Text("DONE")
                        .frame(width: 44, alignment: .center)
                }
                .font(.system(size: 9, weight: .bold, design: .monospaced))
                .foregroundStyle(iTuTheme.inkDim)
                .padding(.horizontal, 8)

                // Set Rows
                ForEach(sets.indices, id: \.self) { idx in
                    let set = sets[idx]
                    setRow(set: set, index: idx + 1, metric: metric, workoutExerciseID: ex.id)
                }
            }

            // Add Set Action
            Button {
                Task { _ = await model.addGymSet(workoutID: workout.id, workoutExerciseID: ex.id) }
            } label: {
                Label("Add Set", systemImage: "plus")
                    .font(.system(size: 11, weight: .semibold))
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
        }
        .padding(14)
        .background(iTuTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(iTuTheme.border, lineWidth: 1)
        }
    }

    private func setRow(set: WorkoutSetModel, index: Int, metric: String, workoutExerciseID: String) -> some View {
        let isDone = set.completedAt != nil

        return HStack(spacing: 8) {
            // Set Number & Badge
            HStack(spacing: 2) {
                Text("\(index)")
                    .font(.system(size: 12, weight: .bold, design: .monospaced))
                    .foregroundStyle(iTuTheme.ink)
            }
            .frame(width: 44, alignment: .leading)

            // Previous Set Hint
            Text(previousHint(for: set))
                .font(.system(size: 10, design: .monospaced))
                .foregroundStyle(iTuTheme.inkDim)
                .frame(width: 80, alignment: .leading)

            // Dynamic Inputs based on Metric Type
            if metric == "WEIGHT_REPS" {
                TextField("0", text: Binding(
                    get: { set.weight.map { String(format: "%.1f", $0) } ?? "" },
                    set: { updateWeight(set, workoutExerciseID: workoutExerciseID, val: $0) }
                ))
                .textFieldStyle(.roundedBorder)
                .frame(width: 70)
                .font(.system(size: 12, design: .monospaced))

                TextField("0", text: Binding(
                    get: { set.reps.map(String.init) ?? "" },
                    set: { updateReps(set, workoutExerciseID: workoutExerciseID, val: $0) }
                ))
                .textFieldStyle(.roundedBorder)
                .frame(width: 60)
                .font(.system(size: 12, design: .monospaced))
            } else if metric == "REPS" {
                TextField("0", text: Binding(
                    get: { set.reps.map(String.init) ?? "" },
                    set: { updateReps(set, workoutExerciseID: workoutExerciseID, val: $0) }
                ))
                .textFieldStyle(.roundedBorder)
                .frame(width: 70)
                .font(.system(size: 12, design: .monospaced))
            } else if metric == "DURATION" {
                TextField("0s", text: Binding(
                    get: { set.durationSeconds.map(String.init) ?? "" },
                    set: { updateDuration(set, workoutExerciseID: workoutExerciseID, val: $0) }
                ))
                .textFieldStyle(.roundedBorder)
                .frame(width: 70)
                .font(.system(size: 12, design: .monospaced))
            } else if metric == "DISTANCE_DURATION" {
                TextField("m", text: Binding(
                    get: { set.distanceMeters.map { String(format: "%.0f", $0) } ?? "" },
                    set: { updateDistance(set, workoutExerciseID: workoutExerciseID, val: $0) }
                ))
                .textFieldStyle(.roundedBorder)
                .frame(width: 70)
                .font(.system(size: 12, design: .monospaced))

                TextField("s", text: Binding(
                    get: { set.durationSeconds.map(String.init) ?? "" },
                    set: { updateDuration(set, workoutExerciseID: workoutExerciseID, val: $0) }
                ))
                .textFieldStyle(.roundedBorder)
                .frame(width: 60)
                .font(.system(size: 12, design: .monospaced))
            }

            if model.gymPreferences.showRpe {
                TextField("-", text: Binding(
                    get: { set.rpe.map { String(format: "%.1f", $0) } ?? "" },
                    set: { updateRpe(set, workoutExerciseID: workoutExerciseID, val: $0) }
                ))
                .textFieldStyle(.roundedBorder)
                .frame(width: 44)
                .font(.system(size: 12, design: .monospaced))
            }

            Spacer()

            // Completion Button
            Button {
                toggleSetCompleted(set, workoutExerciseID: workoutExerciseID)
            } label: {
                Image(systemName: isDone ? "checkmark.square.fill" : "square")
                    .font(.system(size: 18))
                    .foregroundStyle(isDone ? iTuTheme.teal : iTuTheme.inkDim)
            }
            .buttonStyle(.plain)
            .frame(width: 44, alignment: .center)
            .accessibilityLabel("Complete set \(index)")
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(isDone ? iTuTheme.teal.opacity(0.06) : Color.clear)
        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
    }

    private func previousHint(for set: WorkoutSetModel) -> String {
        if let weight = set.weight, let reps = set.reps {
            return "\(Int(weight))k × \(reps)"
        }
        return "--"
    }

    private func updateWeight(_ set: WorkoutSetModel, workoutExerciseID: String, val: String) {
        let num = Double(val.replacingOccurrences(of: ",", with: "."))
        Task {
            _ = await model.updateGymSet(
                workoutID: workout.id,
                workoutExerciseID: workoutExerciseID,
                setID: set.id,
                patch: ["weight": num.map(JSONValue.number) ?? .null]
            )
        }
    }

    private func updateReps(_ set: WorkoutSetModel, workoutExerciseID: String, val: String) {
        let num = Double(val)
        Task {
            _ = await model.updateGymSet(
                workoutID: workout.id,
                workoutExerciseID: workoutExerciseID,
                setID: set.id,
                patch: ["reps": num.map(JSONValue.number) ?? .null]
            )
        }
    }

    private func updateDuration(_ set: WorkoutSetModel, workoutExerciseID: String, val: String) {
        let num = Double(val)
        Task {
            _ = await model.updateGymSet(
                workoutID: workout.id,
                workoutExerciseID: workoutExerciseID,
                setID: set.id,
                patch: ["durationSeconds": num.map(JSONValue.number) ?? .null]
            )
        }
    }

    private func updateDistance(_ set: WorkoutSetModel, workoutExerciseID: String, val: String) {
        let num = Double(val)
        Task {
            _ = await model.updateGymSet(
                workoutID: workout.id,
                workoutExerciseID: workoutExerciseID,
                setID: set.id,
                patch: ["distanceMeters": num.map(JSONValue.number) ?? .null]
            )
        }
    }

    private func updateRpe(_ set: WorkoutSetModel, workoutExerciseID: String, val: String) {
        let num = Double(val)
        Task {
            _ = await model.updateGymSet(
                workoutID: workout.id,
                workoutExerciseID: workoutExerciseID,
                setID: set.id,
                patch: ["rpe": num.map(JSONValue.number) ?? .null]
            )
        }
    }

    private func toggleSetCompleted(_ set: WorkoutSetModel, workoutExerciseID: String) {
        let isDone = set.completedAt != nil
        let newCompletedAt = isDone ? JSONValue.null : JSONValue.string(ISO8601DateFormatter().string(from: Date()))
        Task {
            let success = await model.updateGymSet(
                workoutID: workout.id,
                workoutExerciseID: workoutExerciseID,
                setID: set.id,
                patch: ["completedAt": newCompletedAt],
                complete: !isDone
            )
            if success && !isDone {
                if model.gymPreferences.autoStartRestTimer {
                    restTimer.start(seconds: model.gymPreferences.defaultRestSeconds)
                }
                if model.gymPreferences.soundsEnabled && model.gymPreferences.completionSoundEnabled {
                    NSSound.beep()
                }
            }
        }
    }

    private func saveWorkoutTitle() {
        saveWorkoutMetadata()
    }

    private func saveWorkoutMetadata() {
        let trimmed = editingTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        var patch: [String: JSONValue] = ["title": .string(trimmed)]
        if isHistorical, editingStartedAt.count == 10 {
            patch["startedAt"] = .string("\(editingStartedAt)T12:00:00.000Z")
        }
        if isHistorical, let duration = Int(editingDuration), duration >= 0 {
            patch["durationMinutes"] = .number(Double(duration))
        }
        Task {
            _ = await model.updateGymWorkout(id: workout.id, patch: patch)
        }
    }

    private var exercisePickerSheet: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("Select Exercise")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(iTuTheme.ink)
                Spacer()
                Button("Done") { showingExercisePicker = false }
                    .buttonStyle(.plain)
            }

            TextField("Search exercises…", text: $pickerSearch)
                .textFieldStyle(.roundedBorder)

            ScrollView {
                LazyVStack(spacing: 6) {
                    let available = model.gymExercises.filter { ex in
                        ex.deletedAt == nil && ex.archivedAt == nil &&
                        (pickerSearch.isEmpty || ex.name.localizedCaseInsensitiveContains(pickerSearch))
                    }

                    ForEach(available) { ex in
                        Button {
                            Task {
                                _ = await model.addGymExercise(workoutID: workout.id, exerciseID: ex.id)
                                showingExercisePicker = false
                            }
                        } label: {
                            HStack {
                                Image(systemName: "dumbbell.fill")
                                    .foregroundStyle(iTuTheme.teal)
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(ex.name)
                                        .font(.system(size: 13, weight: .semibold))
                                        .foregroundStyle(iTuTheme.ink)
                                    if let muscle = ex.primaryMuscleGroup {
                                        Text(muscle)
                                            .font(.system(size: 10))
                                            .foregroundStyle(iTuTheme.inkDim)
                                    }
                                }
                                Spacer()
                                Image(systemName: "plus.circle")
                                    .foregroundStyle(iTuTheme.teal)
                            }
                            .padding(10)
                            .background(iTuTheme.surfaceMuted)
                            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .padding(20)
        .frame(width: 380, height: 420)
    }
}
