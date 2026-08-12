import SwiftUI
import UniformTypeIdentifiers
import AppKit

struct GymView: View {
    @Environment(AppModel.self) private var model
    @State private var selectedTab = "Overview"
    @State private var isLoading = true
    @State private var isStartingWorkout = false
    @State private var newExerciseName = ""
    @State private var newExerciseDescription = ""
    @State private var newExerciseMetricType = "WEIGHT_REPS"
    @State private var newExerciseEquipment = ""
    @State private var newExerciseMuscleGroup = ""
    @State private var newExerciseImageData: Data?
    @State private var newExerciseImageName = ""
    @State private var newExerciseImageMimeType = "image/jpeg"
    @State private var isSelectingExerciseImage = false
    @State private var isCreatingExercise = false
    @State private var showingExerciseForm = false
    @State private var exerciseError: String?
    @State private var deleteWorkoutID: String?
    @State private var deleteExerciseID: String?
    @State private var restTimer = GymRestTimer()
    @State private var restTimerTick = Date()
    @State private var clockNow = Date()
    @State private var editingExerciseID: String?
    @State private var editingExerciseName = ""
    @State private var showingExercisePicker = false
    @State private var exerciseQuery = ""
    @State private var exerciseFilter = "All"
    @State private var pickerMuscleFilter = "All"
    @State private var pickerEquipmentFilter = "All"
    @State private var pickerMetricFilter = "All"
    @State private var isCreatingPickerExercise = false
    @State private var pickerCustomName = ""
    @State private var pickerCustomMetric = "WEIGHT_REPS"
    @State private var pickerCustomEquipment = ""
    @State private var pickerCustomMuscle = ""
    @State private var isCreatingPickerExerciseRequest = false
    @State private var focusedSetID: String?
    @State private var showingGymSettings = false
    @State private var showingFinishConfirmation = false
    @State private var historyFilter = "COMPLETED"

    private var visibleGymWorkouts: [WorkoutModel] {
        model.gymWorkouts.filter { $0.deletedAt == nil }
    }

    private var visibleGymExercises: [ExerciseModel] {
        model.gymExercises.filter { $0.deletedAt == nil }
    }

    private var activeWorkout: WorkoutModel? {
        visibleGymWorkouts.first { ["IN_PROGRESS", "ACTIVE"].contains($0.status) }
            ?? model.gymOverview?.recentWorkouts.first { $0.deletedAt == nil && ["IN_PROGRESS", "ACTIVE"].contains($0.status) }
    }

    private var completedGymWorkouts: [WorkoutModel] {
        visibleGymWorkouts.filter { $0.status == "COMPLETED" }
    }

    private var historyWorkouts: [WorkoutModel] {
        historyFilter == "COMPLETED" ? completedGymWorkouts : visibleGymWorkouts
    }

    private var historyCompletedSets: [WorkoutSetModel] {
        completedGymWorkouts.flatMap { workout in
            (workout.exercises ?? []).flatMap { $0.sets ?? [] }.filter { $0.completedAt != nil }
        }
    }

    private var historyBestWeight: Double? {
        historyCompletedSets.compactMap(\.weight).max()
    }

    private var historyEstimated1RM: Double? {
        historyCompletedSets.map { ($0.weight ?? 0) * (1 + Double($0.reps ?? 0) / 30) }.max()
    }

    private var historyVolumeTrend: [Double] {
        Array(completedGymWorkouts.prefix(7).reversed()).map { workoutVolume(for: $0) }
    }

    private func workoutVolume(for workout: WorkoutModel) -> Double {
        let sets = (workout.exercises ?? []).flatMap { $0.sets ?? [] }.filter { $0.completedAt != nil }
        return sets.reduce(0) { $0 + ($1.weight ?? 0) * Double($1.reps ?? 0) }
    }

    var body: some View {
        HStack(spacing: 0) {
            secondaryRail

            VStack(alignment: .leading, spacing: 0) {
                if isLoading {
                    VStack(spacing: 10) {
                        ProgressView()
                        Text("Loading Gym…")
                            .font(.system(size: 13))
                            .foregroundStyle(iTuTheme.inkDim)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .iTuPinnedHeader { header }
                } else {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 20) {
                            if selectedTab == "Active" {
                                activeWorkoutSection
                            } else if selectedTab == "Overview" {
                                gymOverviewSection
                            } else if selectedTab == "History" {
                                gymHistorySection
                            } else {
                                exercisesSection
                            }
                        }
                        .padding(24)
                    }
                    .iTuPinnedHeader { header }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
        .background(iTuTheme.canvas)
        .task {
            await reload()
        }
        .task {
            var wasRunning = false
            while !Task.isCancelled {
                let running = restTimer.isRunning
                if wasRunning && !running && model.gymPreferences.soundsEnabled && model.gymPreferences.restSoundEnabled {
                    NSSound.beep()
                }
                wasRunning = running
                restTimerTick = Date()
                clockNow = Date()
                try? await Task.sleep(for: .milliseconds(250))
            }
        }
        .alert("Discard workout?", isPresented: Binding(get: { deleteWorkoutID != nil }, set: { if !$0 { deleteWorkoutID = nil } })) {
            Button("Discard", role: .destructive) {
                if let id = deleteWorkoutID { Task { _ = await model.deleteGymWorkout(id: id) } }
                deleteWorkoutID = nil
            }
            Button("Cancel", role: .cancel) { deleteWorkoutID = nil }
        } message: {
            Text("It won't enter workout history. You can restore it from Trash.")
        }
        .alert("Move exercise to Trash?", isPresented: Binding(get: { deleteExerciseID != nil }, set: { if !$0 { deleteExerciseID = nil } })) {
            Button("Move to Trash", role: .destructive) {
                if let id = deleteExerciseID { Task { _ = await model.deleteGymExercise(id: id) } }
                deleteExerciseID = nil
            }
            Button("Cancel", role: .cancel) { deleteExerciseID = nil }
        } message: {
            Text("You can restore this exercise from Trash. Archived state is kept separate.")
        }
        .alert("Finish workout?", isPresented: $showingFinishConfirmation) {
            Button("Finish Workout") {
                guard let workout = activeWorkout else { return }
                Task {
                    let completed = await model.completeGymWorkout(id: workout.id)
                    if completed && model.gymPreferences.soundsEnabled && model.gymPreferences.completionSoundEnabled { NSSound.beep() }
                    if completed { selectedTab = "History" }
                }
            }
            Button("Keep Training", role: .cancel) {}
        } message: {
            Text(activeWorkoutSummary)
        }
        .popover(isPresented: $showingGymSettings, arrowEdge: .top) { gymSettingsPopover }
        .popover(isPresented: $showingExercisePicker, arrowEdge: .top) { exercisePickerPopover }
    }

    private var header: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 4) {
                Text("TRACKING")
                    .font(.system(size: 10, weight: .bold))
                    .tracking(1.4)
                    .foregroundStyle(iTuTheme.mint)
                Text("Gym & Fitness")
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                    .foregroundStyle(iTuTheme.ink)
                Text(syncStatus)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(syncColor)
                    .accessibilityLabel("Gym sync status: \(syncStatus)")
                if model.conflicts.contains(where: { ["gymworkout", "exercisedefinition", "workout", "workout-exercise", "workout-set"].contains($0.entityType.lowercased()) }) {
                    Label("Gym change needs conflict resolution", systemImage: "exclamationmark.triangle.fill")
                        .font(.system(size: 11, weight: .medium)).foregroundStyle(iTuTheme.amber)
                }
            }
            Spacer()
            if activeWorkout != nil {
                Button { selectedTab = "Active" } label: {
                    Label("Active", systemImage: "figure.strengthtraining.traditional")
                }
                .buttonStyle(.borderedProminent)
                .tint(iTuTheme.teal)
            }
            Button { showingGymSettings = true } label: { Image(systemName: "gearshape") }
                .buttonStyle(.borderless)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(iTuTheme.inkDim)
                .accessibilityLabel("Gym settings")
        }
        .padding(.horizontal, 28)
        .padding(.top, 24)
        .padding(.bottom, 8)
    }

    private var secondaryRail: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 4) {
                Text("TRACKING")
                    .font(.system(size: 10, weight: .bold))
                    .tracking(1.4)
                    .foregroundStyle(iTuTheme.mint)
                Text("Gym")
                    .font(.system(size: 22, weight: .bold, design: .rounded))
                    .foregroundStyle(iTuTheme.ink)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 22)

            Divider().overlay(iTuTheme.border)

            VStack(spacing: 4) {
                railButton("Overview", icon: "square.grid.2x2", value: "Overview")
                if activeWorkout != nil { railButton("Active", icon: "figure.strengthtraining.traditional", value: "Active") }
                railButton("History", icon: "clock.arrow.circlepath", value: "History")
                railButton("Exercises", icon: "figure.strengthtraining.traditional", value: "Exercises")
            }
            .padding(12)

            Spacer()
        }
        .frame(width: 224)
        .background(iTuTheme.surfaceMuted)
        .overlay(alignment: .trailing) { Divider().overlay(iTuTheme.border) }
    }

    private func railButton(_ title: String, icon: String, value: String) -> some View {
        Button { selectedTab = value } label: {
            Label(title, systemImage: icon)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .buttonStyle(.plain)
        .font(.system(size: 14, weight: selectedTab == value ? .semibold : .regular))
        .foregroundStyle(selectedTab == value ? iTuTheme.teal : iTuTheme.inkDim)
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(selectedTab == value ? iTuTheme.mintTint : .clear)
        .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
    }

    @ViewBuilder
    private var activeWorkoutSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Active Workout")
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(iTuTheme.ink)

            if let workout = activeWorkout {
                VStack(alignment: .leading, spacing: 12) {
                    let sets = (workout.exercises ?? []).flatMap { $0.sets ?? [] }
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(workout.title)
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundStyle(iTuTheme.ink)
                            Text("\(sets.filter { $0.completedAt != nil }.count)/\(sets.count) sets · \(activeElapsedLabel(workout))")
                                .font(.system(size: 11, design: .monospaced))
                                .foregroundStyle(iTuTheme.inkDim)
                        }
                        Spacer()
                        Menu {
                            Button("Discard workout", role: .destructive) { deleteWorkoutID = workout.id }
                        } label: {
                            Image(systemName: "ellipsis.circle")
                        }
                        .menuStyle(.borderlessButton)
                        Button("Finish workout") { showingFinishConfirmation = true }
                            .buttonStyle(.borderedProminent)
                            .tint(iTuTheme.teal)
                    }
                    HStack(spacing: 8) {
                        Text(restTimerDisplay)
                            .font(.system(size: 12, design: .monospaced)).foregroundStyle(iTuTheme.inkDim)
                        if restTimer.isRunning {
                            Button("−15") { restTimer.adjust(by: -15); restTimerTick = Date() }
                                .buttonStyle(.bordered).controlSize(.small)
                            Button("Skip") { restTimer.stop(); restTimerTick = Date() }
                                .buttonStyle(.bordered).controlSize(.small)
                            Button("+15") { restTimer.adjust(by: 15); restTimerTick = Date() }
                                .buttonStyle(.bordered).controlSize(.small)
                        } else {
                            Button("Start \(model.gymPreferences.defaultRestSeconds)s") {
                                restTimer.start(seconds: model.gymPreferences.defaultRestSeconds)
                                restTimerTick = Date()
                            }.buttonStyle(.bordered).controlSize(.small)
                        }
                    }

                    if let exercises = workout.exercises, !exercises.isEmpty {
                        ForEach(exercises) { exercise in
                            activeExerciseRow(exercise)
                        }
                    } else {
                        VStack(alignment: .leading, spacing: 3) {
                            Text("Ready for your first exercise?")
                                .font(.system(size: 13, weight: .semibold))
                            Text("Your workout saves automatically while you train.")
                                .font(.system(size: 12))
                                .foregroundStyle(iTuTheme.inkDim)
                        }
                    }
                    HStack {
                        Button { showingExercisePicker = true } label: { Label("Add exercise", systemImage: "plus") }
                            .buttonStyle(.bordered)
                    }
                }
                .padding(16)
            } else {
                VStack(alignment: .leading, spacing: 12) {
                    emptyState("No active workout. Start a session to record exercises, sets, and progress.")
                    Button {
                        isStartingWorkout = true
                        Task {
                            _ = await model.startGymWorkout()
                            isStartingWorkout = false
                        }
                    } label: {
                        Label(isStartingWorkout ? "Starting…" : "Start Workout", systemImage: "play.fill")
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(iTuTheme.teal)
                    .disabled(isStartingWorkout)
                }
            }
        }
        .padding(12)
        .background(iTuTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(iTuTheme.border, lineWidth: 1))
    }

    @ViewBuilder
    private func activeExerciseRow(_ exercise: WorkoutExerciseModel) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack {
                Text(exercise.exercise?.name ?? "Exercise")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(iTuTheme.ink)
                Spacer()
                Text(metricLabel(exercise.exercise?.metricType ?? "WEIGHT_REPS"))
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(iTuTheme.inkDim)
                Menu {
                    Button("Remove exercise", role: .destructive) {
                        Task { _ = await model.removeGymExercise(workoutID: activeWorkout?.id ?? "", workoutExerciseID: exercise.id) }
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
                .menuStyle(.borderlessButton)
            }

            if let note = exercise.note, !note.isEmpty {
                Text(note)
                    .font(.system(size: 12))
                    .foregroundStyle(iTuTheme.inkDim)
            }

            if let sets = exercise.sets, !sets.isEmpty {
                ForEach(sets) { set in
                    HStack(spacing: 8) {
                        Text("Set \(set.sortOrder + 1)")
                            .font(.system(size: 11, weight: .medium, design: .monospaced))
                            .foregroundStyle(iTuTheme.inkDim)
                            .frame(width: 48, alignment: .leading)
                        Text(setSummary(set, metric: exercise.exercise?.metricType ?? "WEIGHT_REPS"))
                            .font(.system(size: 12, weight: .medium, design: .monospaced))
                            .foregroundStyle(iTuTheme.ink)
                        if exercise.exercise?.metricType == "WEIGHT_REPS" {
                            stepperButton("minus", value: set.weight ?? 0, step: 2.5) { value in
                                Task { _ = await model.updateGymSet(workoutID: activeWorkout?.id ?? "", workoutExerciseID: exercise.id, setID: set.id, patch: ["weight": .number(value)]) }
                            }
                            stepperButton("plus", value: set.weight ?? 0, step: 2.5) { value in
                                Task { _ = await model.updateGymSet(workoutID: activeWorkout?.id ?? "", workoutExerciseID: exercise.id, setID: set.id, patch: ["weight": .number(value)]) }
                            }
                        }
                        if ["WEIGHT_REPS", "REPS"].contains(exercise.exercise?.metricType ?? "WEIGHT_REPS") {
                            stepperButton("minus", value: Double(set.reps ?? 0), step: 1) { value in
                                Task { _ = await model.updateGymSet(workoutID: activeWorkout?.id ?? "", workoutExerciseID: exercise.id, setID: set.id, patch: ["reps": .number(value)]) }
                            }
                            stepperButton("plus", value: Double(set.reps ?? 0), step: 1) { value in
                                Task { _ = await model.updateGymSet(workoutID: activeWorkout?.id ?? "", workoutExerciseID: exercise.id, setID: set.id, patch: ["reps": .number(value)]) }
                            }
                        }
                        if exercise.exercise?.metricType == "DURATION" || exercise.exercise?.metricType == "DISTANCE_DURATION" {
                            if exercise.exercise?.metricType == "DISTANCE_DURATION" {
                                stepperButton("minus", value: set.distanceMeters ?? 0, step: 100) { value in
                                    Task { _ = await model.updateGymSet(workoutID: activeWorkout?.id ?? "", workoutExerciseID: exercise.id, setID: set.id, patch: ["distanceMeters": .number(value)]) }
                                }
                                stepperButton("plus", value: set.distanceMeters ?? 0, step: 100) { value in
                                    Task { _ = await model.updateGymSet(workoutID: activeWorkout?.id ?? "", workoutExerciseID: exercise.id, setID: set.id, patch: ["distanceMeters": .number(value)]) }
                                }
                            }
                            stepperButton("minus", value: Double(set.durationSeconds ?? 0), step: 15) { value in
                                Task { _ = await model.updateGymSet(workoutID: activeWorkout?.id ?? "", workoutExerciseID: exercise.id, setID: set.id, patch: ["durationSeconds": .number(value)]) }
                            }
                            stepperButton("plus", value: Double(set.durationSeconds ?? 0), step: 15) { value in
                                Task { _ = await model.updateGymSet(workoutID: activeWorkout?.id ?? "", workoutExerciseID: exercise.id, setID: set.id, patch: ["durationSeconds": .number(value)]) }
                            }
                        }
                        if model.gymPreferences.showRpe {
                            Text("RPE \(set.rpe.map { String(format: "%.1f", $0) } ?? "—")")
                                .font(.system(size: 10, design: .monospaced)).foregroundStyle(iTuTheme.inkDim)
                            stepperButton("minus", value: set.rpe ?? 0, step: 0.5) { value in
                                Task { _ = await model.updateGymSet(workoutID: activeWorkout?.id ?? "", workoutExerciseID: exercise.id, setID: set.id, patch: ["rpe": .number(value)]) }
                            }
                            stepperButton("plus", value: set.rpe ?? 0, step: 0.5) { value in
                                Task { _ = await model.updateGymSet(workoutID: activeWorkout?.id ?? "", workoutExerciseID: exercise.id, setID: set.id, patch: ["rpe": .number(min(10, value))]) }
                            }
                        }
                        Menu {
                            ForEach(["WARM_UP", "NORMAL", "DROP", "FAILURE"], id: \.self) { type in
                                Button(type.replacingOccurrences(of: "_", with: " ")) {
                                    Task { _ = await model.updateGymSet(workoutID: activeWorkout?.id ?? "", workoutExerciseID: exercise.id, setID: set.id, patch: ["type": .string(type)]) }
                                }
                            }
                        } label: { Image(systemName: "tag") }
                        .menuStyle(.borderlessButton)
                        Spacer()
                        if set.completedAt == nil {
                            Button("Complete") {
                                let nextSetID = activeWorkout.flatMap { nextUnfinishedSetID(in: $0, after: set.id) }
                                if model.gymPreferences.autoStartRestTimer { restTimer.start(seconds: exercise.restSeconds ?? model.gymPreferences.defaultRestSeconds); restTimerTick = Date() }
                                Task {
                                    let completed = await model.updateGymSet(workoutID: activeWorkout?.id ?? "", workoutExerciseID: exercise.id, setID: set.id, patch: ["completedAt": .string(ISO8601DateFormatter().string(from: Date()))], complete: true)
                                    if completed {
                                        focusedSetID = nextSetID
                                        if model.gymPreferences.soundsEnabled && model.gymPreferences.completionSoundEnabled { NSSound.beep() }
                                    }
                                }
                            }.buttonStyle(.borderless).foregroundStyle(iTuTheme.teal)
                        } else {
                            Image(systemName: "checkmark.circle.fill").foregroundStyle(iTuTheme.teal).accessibilityLabel("Set completed")
                            Button("Reopen") {
                                Task {
                                    _ = await model.updateGymSet(workoutID: activeWorkout?.id ?? "", workoutExerciseID: exercise.id, setID: set.id, patch: ["completedAt": .null], complete: false)
                                    focusedSetID = set.id
                                }
                            }
                            .buttonStyle(.borderless)
                            .foregroundStyle(iTuTheme.inkDim)
                        }
                        Button { Task { _ = await model.removeGymSet(workoutID: activeWorkout?.id ?? "", workoutExerciseID: exercise.id, setID: set.id) } } label: { Image(systemName: "trash") }
                            .buttonStyle(.borderless).foregroundStyle(iTuTheme.inkFaint)
                    }
                    .padding(.vertical, 6)
                    .padding(.horizontal, 8)
                    .background(focusedSetID == set.id ? iTuTheme.mintTint : iTuTheme.canvas)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                }
            }
            HStack(spacing: 8) {
                Button { Task { _ = await model.addGymSet(workoutID: activeWorkout?.id ?? "", workoutExerciseID: exercise.id) } } label: { Label("Add set", systemImage: "plus.circle") }
                    .buttonStyle(.borderless).foregroundStyle(iTuTheme.teal)
                if let previous = model.gymPreviousSet(exerciseID: exercise.exerciseId) {
                    Text("Previous: \(setSummary(previous, metric: exercise.exercise?.metricType ?? "WEIGHT_REPS"))")
                        .font(.system(size: 11, design: .monospaced)).foregroundStyle(iTuTheme.inkDim)
                }
            }
        }
        .padding(.top, 8)
    }

    @ViewBuilder
    private var gymOverviewSection: some View {
        let weeklyWorkouts = model.gymOverview?.weeklyWorkoutsCount ?? 0
        let weeklySets = model.gymOverview?.weeklySetsCount ?? 0
        let weeklyVolume = model.gymOverview?.weeklyVolumeKg ?? 0

        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Ready to train?")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(iTuTheme.ink)
                Text("Start a session and record your exercises, sets, and progress.")
                    .font(.system(size: 12))
                    .foregroundStyle(iTuTheme.inkDim)
            }
            Button {
                continueOrStartWorkout()
            } label: {
                Label(isStartingWorkout ? "Starting…" : (activeWorkout == nil ? "Start Workout" : "Continue Workout"), systemImage: "play.fill")
            }
            .buttonStyle(.borderedProminent)
            .tint(iTuTheme.teal)
            .disabled(isStartingWorkout)
        }
        .padding(16)
        .background(iTuTheme.mintTint.opacity(0.45))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(iTuTheme.border, lineWidth: 1))

        HStack(spacing: 16) {
            metricCard(title: "THIS WEEK WORKOUTS", value: "\(weeklyWorkouts)", color: iTuTheme.teal)
            metricCard(title: "TOTAL SETS", value: "\(weeklySets)", color: iTuTheme.mint)
            metricCard(title: "TOTAL VOLUME", value: formatWeight(Double(weeklyVolume)), color: iTuTheme.amber)
        }

        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Recent Workouts")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(iTuTheme.ink)
                Spacer()
                Button("View full history →") {
                    selectedTab = "History"
                }
                .buttonStyle(.link)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(iTuTheme.teal)
            }

            let recent = (model.gymOverview?.recentWorkouts ?? visibleGymWorkouts).filter { $0.deletedAt == nil }
            if recent.isEmpty {
                emptyState("No workouts recorded yet. Your history will appear here after your first session.")
            } else {
                VStack(spacing: 8) {
                    ForEach(recent.prefix(5)) { workout in
                        workoutRow(workout)
                    }
                }
            }
        }
        .padding(.top, 12)
    }

    private func continueOrStartWorkout() {
        if activeWorkout != nil {
            selectedTab = "Active"
            return
        }

        isStartingWorkout = true
        Task {
            let workout = await model.startGymWorkout()
            isStartingWorkout = false
            if workout != nil {
                selectedTab = "Active"
            }
        }
    }

    @ViewBuilder
    private var gymHistorySection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Workout History")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(iTuTheme.ink)
                    Text("Completed sessions, progress, and personal bests.")
                        .font(.system(size: 12))
                        .foregroundStyle(iTuTheme.inkDim)
                }
                Spacer()
                Picker("History filter", selection: $historyFilter) {
                    Text("Completed").tag("COMPLETED")
                    Text("All sessions").tag("ALL")
                }
                .pickerStyle(.segmented)
                .frame(width: 190)
            }

            HStack(spacing: 10) {
                metricCard(title: "COMPLETED", value: "\(completedGymWorkouts.count)", color: iTuTheme.teal)
                metricCard(title: "LOGGED SETS", value: "\(historyCompletedSets.count)", color: iTuTheme.mint)
                metricCard(title: "BEST WEIGHT", value: historyBestWeight.map(formatWeight) ?? "—", color: iTuTheme.amber)
                metricCard(title: "ESTIMATED 1RM", value: historyEstimated1RM.map { formatWeight($0) } ?? "—", color: iTuTheme.coral)
            }

            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Volume trend")
                            .font(.system(size: 14, weight: .semibold))
                        Text("Completed set volume across recent sessions.")
                            .font(.system(size: 11))
                            .foregroundStyle(iTuTheme.inkDim)
                    }
                    Spacer()
                    Image(systemName: "chart.line.uptrend.xyaxis")
                        .foregroundStyle(iTuTheme.teal)
                }
                if historyVolumeTrend.isEmpty {
                    Text("Complete a workout to see your trend.")
                        .font(.system(size: 12))
                        .foregroundStyle(iTuTheme.inkDim)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.vertical, 24)
                } else {
                    let maxVolume = max(historyVolumeTrend.max() ?? 1, 1)
                    HStack(alignment: .bottom, spacing: 8) {
                        ForEach(Array(historyVolumeTrend.enumerated()), id: \.offset) { _, volume in
                            RoundedRectangle(cornerRadius: 3, style: .continuous)
                                .fill(iTuTheme.teal.opacity(0.72))
                                .frame(maxWidth: .infinity, minHeight: 8, maxHeight: CGFloat(max(8, (volume / maxVolume) * 74)))
                        }
                    }
                    .frame(height: 82, alignment: .bottom)
                }
            }
            .padding(14)
            .background(iTuTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(iTuTheme.border, lineWidth: 1))

            if historyWorkouts.isEmpty {
                emptyState("No workouts in this view yet.")
            } else {
                VStack(spacing: 8) {
                    ForEach(historyWorkouts) { workout in
                        workoutRow(workout)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var exercisesSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .firstTextBaseline) {
                Text("Exercise Library")
                    .font(.system(size: 18, weight: .bold, design: .rounded))
                    .foregroundStyle(iTuTheme.ink)
                Spacer()
                Text("\(visibleGymExercises.count) \(visibleGymExercises.count == 1 ? "exercise" : "exercises")")
                    .font(.system(size: 12, weight: .medium, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkDim)
                if showingExerciseForm {
                    Button("Cancel") {
                        resetNewExerciseForm()
                    }
                    .buttonStyle(iTuSecondaryButtonStyle(height: 30))
                } else {
                    Button("Add exercise") {
                        showingExerciseForm = true
                    }
                    .buttonStyle(iTuPrimaryButtonStyle(height: 30))
                }
            }

            if showingExerciseForm {
                VStack(alignment: .leading, spacing: 16) {
                HStack(spacing: 8) {
                    Image(systemName: "figure.strengthtraining.traditional")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(iTuTheme.teal)
                    Text("Add exercise")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(iTuTheme.ink)
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text("Exercise name")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(iTuTheme.inkDim)
                    TextField("Barbell back squat", text: $newExerciseName)
                        .textFieldStyle(.roundedBorder)
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text("Metric type")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(iTuTheme.inkDim)
                    Picker("", selection: $newExerciseMetricType) {
                        Text("Weight & reps").tag("WEIGHT_REPS")
                        Text("Reps only").tag("REPS")
                        Text("Duration").tag("DURATION")
                        Text("Distance & duration").tag("DISTANCE_DURATION")
                    }
                    .pickerStyle(.segmented)
                }

                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(spacing: 4) {
                            Text("Equipment")
                                .font(.system(size: 12, weight: .medium))
                                .foregroundStyle(iTuTheme.inkDim)
                            Text("(optional)")
                                .font(.system(size: 12))
                                .foregroundStyle(iTuTheme.inkFaint)
                        }
                        TextField("Barbell", text: $newExerciseEquipment)
                            .textFieldStyle(.roundedBorder)
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        HStack(spacing: 4) {
                            Text("Primary muscle")
                                .font(.system(size: 12, weight: .medium))
                                .foregroundStyle(iTuTheme.inkDim)
                            Text("(optional)")
                                .font(.system(size: 12))
                                .foregroundStyle(iTuTheme.inkFaint)
                        }
                        TextField("Quadriceps", text: $newExerciseMuscleGroup)
                            .textFieldStyle(.roundedBorder)
                    }
                }

                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 4) {
                        Text("Instructions")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(iTuTheme.inkDim)
                        Text("(optional)")
                            .font(.system(size: 12))
                            .foregroundStyle(iTuTheme.inkFaint)
                    }
                    TextField("Brace your core, keep your chest up, and squat until your hips drop below your knees.", text: $newExerciseDescription)
                        .textFieldStyle(.roundedBorder)
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text("Reference image")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(iTuTheme.inkDim)

                    Button {
                        isSelectingExerciseImage = true
                    } label: {
                        HStack(spacing: 12) {
                            ZStack {
                                RoundedRectangle(cornerRadius: 8, style: .continuous)
                                    .fill(iTuTheme.canvas)
                                    .frame(width: 36, height: 36)

                                if let data = newExerciseImageData, let nsImage = NSImage(data: data) {
                                    Image(nsImage: nsImage)
                                        .resizable()
                                        .scaledToFill()
                                        .frame(width: 36, height: 36)
                                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                                } else {
                                    Image(systemName: "photo.on.rectangle.angled")
                                        .font(.system(size: 16))
                                        .foregroundStyle(iTuTheme.inkDim)
                                }
                            }

                            VStack(alignment: .leading, spacing: 2) {
                                Text(newExerciseImageName.isEmpty ? "Choose reference image" : newExerciseImageName)
                                    .font(.system(size: 13, weight: .medium))
                                    .foregroundStyle(iTuTheme.ink)
                                    .lineLimit(1)
                                Text(newExerciseImageName.isEmpty ? "PNG or JPG, up to 5 MB" : "Click to replace image")
                                    .font(.system(size: 12))
                                    .foregroundStyle(iTuTheme.inkDim)
                            }

                            Spacer()

                            if !newExerciseImageName.isEmpty {
                                Text("Attached")
                                    .font(.system(size: 10, weight: .semibold, design: .monospaced))
                                    .foregroundStyle(iTuTheme.teal)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 4)
                                    .background(iTuTheme.mintTint)
                                    .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
                            } else {
                                Text("Optional")
                                    .font(.system(size: 10, weight: .medium, design: .monospaced))
                                    .foregroundStyle(iTuTheme.inkDim)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 4)
                                    .background(iTuTheme.canvas)
                                    .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
                            }
                        }
                        .padding(12)
                        .background(iTuTheme.canvas)
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: 10, style: .continuous)
                                .stroke(newExerciseImageData != nil ? iTuTheme.teal.opacity(0.5) : iTuTheme.border, lineWidth: 1)
                        )
                    }
                    .buttonStyle(.plain)
                }

                if let exerciseError {
                    Text(exerciseError)
                        .font(.system(size: 12))
                        .foregroundStyle(iTuTheme.coral)
                }

                Divider().overlay(iTuTheme.border)

                HStack {
                        Text(newExerciseName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                         ? "An exercise name is required"
                         : (newExerciseImageData == nil ? "Ready to create without an image" : "Ready to create"))
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(iTuTheme.inkDim)

                    Spacer()

                    Button("Cancel") { resetNewExerciseForm() }
                        .buttonStyle(.bordered)
                        .controlSize(.small)

                    Button(isCreatingExercise ? "Creating…" : "Create exercise") {
                        createExercise()
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(iTuTheme.teal)
                    .disabled(newExerciseName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isCreatingExercise)
                }
                }
            .padding(20)
            .background(iTuTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(iTuTheme.border, lineWidth: 1))
            }

            if visibleGymExercises.isEmpty {
                emptyExerciseLibraryState
            } else {
                VStack(spacing: 8) {
                    ForEach(visibleGymExercises) { exercise in
                        exerciseRow(exercise)
                    }
                }
            }
        }
        .fileImporter(
            isPresented: $isSelectingExerciseImage,
            allowedContentTypes: [.image],
            allowsMultipleSelection: false
        ) { result in
            guard case .success(let urls) = result, let url = urls.first else { return }
            let accessed = url.startAccessingSecurityScopedResource()
            defer { if accessed { url.stopAccessingSecurityScopedResource() } }
            do {
                newExerciseImageData = try Data(contentsOf: url)
                newExerciseImageName = url.lastPathComponent
                newExerciseImageMimeType = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "image/jpeg"
                exerciseError = nil
            } catch {
                exerciseError = "Could not read that image. Please choose another file."
            }
        }
    }

    @ViewBuilder
    private var emptyExerciseLibraryState: some View {
        VStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(iTuTheme.canvas)
                    .frame(width: 44, height: 44)
                Image(systemName: "figure.cross-training")
                    .font(.system(size: 20))
                    .foregroundStyle(iTuTheme.teal)
            }
            Text("No exercises in the library yet")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(iTuTheme.ink)
            Text("Exercises you create will show up here, ready to add into any workout.")
                .font(.system(size: 13))
                .foregroundStyle(iTuTheme.inkDim)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 320)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
        .padding(.horizontal, 24)
        .background(iTuTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(iTuTheme.border, lineWidth: 1))
    }

    @ViewBuilder
    private func exerciseRow(_ exercise: ExerciseModel) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(iTuTheme.canvas)
                    .frame(width: 40, height: 40)

                if let urlString = exercise.imageUrl, let url = URL(string: urlString) {
                    AsyncImage(url: url) { phase in
                        if let image = phase.image {
                            image
                                .resizable()
                                .scaledToFill()
                        } else {
                            Image(systemName: "photo")
                                .foregroundStyle(iTuTheme.inkFaint)
                        }
                    }
                    .frame(width: 40, height: 40)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                } else {
                    Image(systemName: "figure.strengthtraining.traditional")
                        .font(.system(size: 16))
                        .foregroundStyle(iTuTheme.teal)
                }
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(exercise.name)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(iTuTheme.ink)
                Text("\(exercise.primaryMuscleGroup ?? "General") • \(exercise.equipment ?? "Bodyweight")")
                    .font(.system(size: 11))
                    .foregroundStyle(iTuTheme.inkDim)
            }

            Spacer()

            Text(metricLabel(exercise.metricType))
                .font(.system(size: 10, weight: .semibold, design: .monospaced))
                .foregroundStyle(iTuTheme.teal)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(iTuTheme.mintTint)
                .clipShape(Capsule())
            Button("Edit") { editingExerciseID = exercise.id; editingExerciseName = exercise.name }.buttonStyle(.borderless)
            Button("Archive") { Task { _ = await model.archiveGymExercise(id: exercise.id) } }.buttonStyle(.borderless)
            Button("Delete") { deleteExerciseID = exercise.id }.buttonStyle(.borderless)
            }
            let stats = model.gymStats(exerciseID: exercise.id)
            if stats.totalSets > 0 {
                Text("Best \(stats.bestWeight.map { formatWeight($0) } ?? "—") · 1RM \(stats.estimated1RM.map { formatWeight($0) } ?? "—") · Volume \(formatWeight(stats.totalVolumeKg))")
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkDim)
                if !stats.volumeTrend.isEmpty {
                    Text("Volume trend  " + stats.volumeTrend.suffix(5).map { String(Int($0)) }.joined(separator: "  →  "))
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundStyle(iTuTheme.inkFaint)
                }
                if !stats.recentSets.isEmpty {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Recent sets")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(iTuTheme.inkDim)
                        ForEach(stats.recentSets.prefix(3)) { set in
                            HStack(spacing: 8) {
                                Text(gymDateLabel(set.completedAt))
                                    .frame(width: 78, alignment: .leading)
                                Text(setSummary(set, metric: exercise.metricType))
                            }
                            .font(.system(size: 10, design: .monospaced))
                            .foregroundStyle(iTuTheme.inkFaint)
                        }
                    }
                }
            }
            if editingExerciseID == exercise.id {
                HStack {
                    TextField("Exercise name", text: $editingExerciseName).textFieldStyle(.roundedBorder)
                    Button("Save") { Task { let ok = await model.updateGymExercise(id: exercise.id, patch: ["name": .string(editingExerciseName)]); if ok { editingExerciseID = nil } } }.buttonStyle(.borderedProminent).tint(iTuTheme.teal)
                }
            }
        }
        .padding(12)
        .background(iTuTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(iTuTheme.border, lineWidth: 1)
        )
    }

    private func createExercise() {
        let name = newExerciseName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else {
            exerciseError = "Add an exercise name before saving."
            return
        }
        isCreatingExercise = true
        exerciseError = nil
        Task {
            let created = await model.createGymExercise(
                name: name,
                description: newExerciseDescription.trimmingCharacters(in: .whitespacesAndNewlines),
                metricType: newExerciseMetricType,
                equipment: newExerciseEquipment.trimmingCharacters(in: .whitespacesAndNewlines),
                primaryMuscleGroup: newExerciseMuscleGroup.trimmingCharacters(in: .whitespacesAndNewlines),
                imageData: newExerciseImageData,
                fileName: newExerciseImageName,
                mimeType: newExerciseImageMimeType
            )
            if created {
                resetNewExerciseForm()
            } else {
                exerciseError = "The exercise could not be saved with its image. Please try again."
            }
            isCreatingExercise = false
        }
    }

    private func resetNewExerciseForm() {
        newExerciseName = ""
        newExerciseDescription = ""
        newExerciseEquipment = ""
        newExerciseMuscleGroup = ""
        newExerciseImageData = nil
        newExerciseImageName = ""
        exerciseError = nil
        showingExerciseForm = false
    }

    private func reload() async {
        isLoading = true
        await model.loadGymOverview()
        await model.loadGymExercises()
        await model.loadGymWorkouts()
        isLoading = false
    }

    private func emptyState(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 13))
            .foregroundStyle(iTuTheme.inkDim)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(iTuTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func workoutRow(_ workout: WorkoutModel) -> some View {
        let exercises = workout.exercises ?? []
        let sets = exercises.flatMap { $0.sets ?? [] }
        let volume = sets.filter { $0.completedAt != nil }.reduce(0) { $0 + ($1.weight ?? 0) * Double($1.reps ?? 0) }
        return HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(workout.title)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(iTuTheme.ink)
                if let started = workout.startedAt {
                    Text(gymDateLabel(started))
                        .font(.system(size: 11))
                        .foregroundStyle(iTuTheme.inkDim)
                }
                Text("\(workoutDurationLabel(workout)) · \(exercises.count) exercises · \(sets.count) sets · \(formatWeight(volume))")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkFaint)
            }
            Spacer()
            Text(workout.status)
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(workout.status == "COMPLETED" ? iTuTheme.teal : iTuTheme.amber)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(iTuTheme.canvas)
                .clipShape(Capsule())
            if workout.status == "COMPLETED" {
                Button("Edit") { Task { _ = await model.updateGymWorkout(id: workout.id, patch: ["title": .string(workout.title)]) } }.buttonStyle(.borderless)
            }
            Button { deleteWorkoutID = workout.id } label: { Image(systemName: "trash") }
                .buttonStyle(.borderless)
                .accessibilityLabel("Delete workout")
        }
        .padding(12)
        .background(iTuTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func metricCard(title: String, value: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(color)
            Text(value)
                .font(.system(size: 20, weight: .bold, design: .monospaced))
                .foregroundStyle(iTuTheme.ink)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(iTuTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(iTuTheme.border, lineWidth: 1)
        )
    }

    private var gymSettingsPopover: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Gym settings").font(.headline)
            Picker("Weight unit", selection: Binding(get: { model.gymPreferences.weightUnit }, set: { value in Task { _ = await model.updateGymPreferences(patch: ["weightUnit": .string(value)]) } })) {
                Text("Kilograms (kg)").tag("KG")
                Text("Pounds (lb)").tag("LBS")
            }
            Picker("Distance", selection: Binding(get: { model.gymPreferences.distanceUnit }, set: { value in Task { _ = await model.updateGymPreferences(patch: ["distanceUnit": .string(value)]) } })) {
                Text("Kilometres").tag("KM")
                Text("Miles").tag("MI")
            }
            Stepper(value: Binding(get: { model.gymPreferences.defaultRestSeconds }, set: { value in Task { _ = await model.updateGymPreferences(patch: ["defaultRestSeconds": .number(Double(value))]) } }), in: 0...600, step: 15) {
                Text("Rest: \(model.gymPreferences.defaultRestSeconds)s")
            }
            Toggle("Auto-start rest timer", isOn: Binding(get: { model.gymPreferences.autoStartRestTimer }, set: { value in Task { _ = await model.updateGymPreferences(patch: ["autoStartRestTimer": .bool(value)]) } }))
            Toggle("Show RPE", isOn: Binding(get: { model.gymPreferences.showRpe }, set: { value in Task { _ = await model.updateGymPreferences(patch: ["showRpe": .bool(value)]) } }))
            Toggle("Sounds enabled", isOn: Binding(get: { model.gymPreferences.soundsEnabled }, set: { value in Task { _ = await model.updateGymPreferences(patch: ["soundsEnabled": .bool(value)]) } }))
            Toggle("Rest timer sound", isOn: Binding(get: { model.gymPreferences.restSoundEnabled }, set: { value in Task { _ = await model.updateGymPreferences(patch: ["restSoundEnabled": .bool(value)]) } }))
            Toggle("Set completion sound", isOn: Binding(get: { model.gymPreferences.completionSoundEnabled }, set: { value in Task { _ = await model.updateGymPreferences(patch: ["completionSoundEnabled": .bool(value)]) } }))
            HStack(spacing: 8) {
                Button("Test rest") { if model.gymPreferences.soundsEnabled && model.gymPreferences.restSoundEnabled { NSSound.beep() } }
                Button("Test completion") { if model.gymPreferences.soundsEnabled && model.gymPreferences.completionSoundEnabled { NSSound.beep() } }
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            Picker("Previous values", selection: Binding(get: { model.gymPreferences.previousPerformanceMode }, set: { value in Task { _ = await model.updateGymPreferences(patch: ["previousPerformanceMode": .string(value)]) } })) {
                Text("Same exercise").tag("EXERCISE")
                Text("Same workout").tag("WORKOUT")
            }
        }
        .padding(18)
        .frame(width: 260)
    }

    private var exercisePickerPopover: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Add exercise").font(.headline)
            TextField("Search exercises", text: $exerciseQuery)
                .textFieldStyle(.roundedBorder)
            Picker("Filter", selection: $exerciseFilter) {
                Text("All").tag("All")
                Text("Recent").tag("Recent")
                Text("Favorites").tag("Favorites")
                Text("Custom").tag("Custom")
            }
            .pickerStyle(.segmented)
            HStack(spacing: 8) {
                Picker("Muscle", selection: $pickerMuscleFilter) {
                    ForEach(pickerMuscleOptions, id: \.self) { Text($0).tag($0) }
                }
                .pickerStyle(.menu)
                Picker("Equipment", selection: $pickerEquipmentFilter) {
                    ForEach(pickerEquipmentOptions, id: \.self) { Text($0).tag($0) }
                }
                .pickerStyle(.menu)
                Picker("Metric", selection: $pickerMetricFilter) {
                    ForEach(pickerMetricOptions, id: \.self) { Text(metricLabel($0)).tag($0) }
                }
                .pickerStyle(.menu)
            }
            Button {
                isCreatingPickerExercise = true
                pickerCustomName = exerciseQuery
                pickerCustomMetric = pickerMetricFilter == "All" ? "WEIGHT_REPS" : pickerMetricFilter
            } label: {
                Label("Create custom exercise", systemImage: "plus.circle")
            }
            .buttonStyle(.borderless)
            .foregroundStyle(iTuTheme.teal)
            if isCreatingPickerExercise {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Create custom exercise")
                        .font(.system(size: 13, weight: .semibold))
                    TextField("Exercise name", text: $pickerCustomName)
                        .textFieldStyle(.roundedBorder)
                    Picker("Metric", selection: $pickerCustomMetric) {
                        Text("Weight & reps").tag("WEIGHT_REPS")
                        Text("Reps only").tag("REPS")
                        Text("Duration").tag("DURATION")
                        Text("Distance & duration").tag("DISTANCE_DURATION")
                    }
                    .pickerStyle(.menu)
                    TextField("Equipment (optional)", text: $pickerCustomEquipment)
                        .textFieldStyle(.roundedBorder)
                    TextField("Primary muscle (optional)", text: $pickerCustomMuscle)
                        .textFieldStyle(.roundedBorder)
                    HStack {
                        Button("Cancel") { isCreatingPickerExercise = false }
                            .buttonStyle(.borderless)
                        Spacer()
                        Button(isCreatingPickerExerciseRequest ? "Creating…" : "Create and add") {
                            createPickerExercise()
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(iTuTheme.teal)
                        .disabled(pickerCustomName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isCreatingPickerExerciseRequest)
                    }
                }
                .padding(10)
                .background(iTuTheme.canvas)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            } else {
                ScrollView {
                    VStack(spacing: 4) {
                        ForEach(pickerExercises) { exercise in
                            HStack(spacing: 8) {
                                Button {
                                    Task {
                                        _ = await model.addGymExercise(workoutID: activeWorkout?.id ?? "", exerciseID: exercise.id)
                                        showingExercisePicker = false
                                    }
                                } label: {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(exercise.name).font(.system(size: 13, weight: .medium))
                                        Text(metricLabel(exercise.metricType)).font(.caption).foregroundStyle(iTuTheme.inkDim)
                                    }
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                }
                                .buttonStyle(.plain)
                                Button {
                                    var ids = model.gymPreferences.favoriteExerciseIDs
                                    if ids.contains(exercise.id) { ids.removeAll { $0 == exercise.id } } else { ids.append(exercise.id) }
                                    Task { _ = await model.updateGymPreferences(patch: ["favoriteExerciseIDs": .array(ids.map(JSONValue.string))]) }
                                } label: {
                                    Image(systemName: model.gymPreferences.favoriteExerciseIDs.contains(exercise.id) ? "star.fill" : "star")
                                }
                                .buttonStyle(.borderless)
                                .foregroundStyle(iTuTheme.amber)
                            }
                            .padding(8)
                            .background(iTuTheme.canvas)
                            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                        }
                    }
                }
                .frame(maxHeight: 280)
            }
        }
        .padding(14)
        .frame(width: 320)
    }

    private var activeWorkoutSummary: String {
        guard let workout = activeWorkout else { return "Your local workout will be saved to History." }
        let exercises = workout.exercises ?? []
        let sets = (workout.exercises ?? []).flatMap { $0.sets ?? [] }
        let completed = sets.filter { $0.completedAt != nil }.count
        let volume = sets.filter { $0.completedAt != nil }.reduce(0) { $0 + ($1.weight ?? 0) * Double($1.reps ?? 0) }
        let unfinished = sets.count - completed
        let warning = unfinished > 0 ? " \(unfinished) unfinished set\(unfinished == 1 ? "" : "s") will be discarded." : ""
        return "\(completed) of \(sets.count) sets · \(exercises.count) exercises · \(workoutDurationLabel(workout)) · \(formatWeight(volume)).\(warning) Your local workout will be saved to History and synced when you reconnect."
    }

    private var pickerExercises: [ExerciseModel] {
        let query = exerciseQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return visibleGymExercises.filter { exercise in
            guard exercise.deletedAt == nil, query.isEmpty || exercise.name.lowercased().contains(query) else { return false }
            guard pickerMuscleFilter == "All" || (exercise.primaryMuscleGroup ?? "General") == pickerMuscleFilter else { return false }
            guard pickerEquipmentFilter == "All" || (exercise.equipment ?? "Bodyweight") == pickerEquipmentFilter else { return false }
            guard pickerMetricFilter == "All" || exercise.metricType == pickerMetricFilter else { return false }
            switch exerciseFilter {
            case "Recent": return model.gymPreferences.recentExerciseIDs.contains(exercise.id)
            case "Favorites": return model.gymPreferences.favoriteExerciseIDs.contains(exercise.id)
            case "Custom": return exercise.userId == (model.user?.id ?? "")
            default: return true
            }
        }
    }

    private func createPickerExercise() {
        let name = pickerCustomName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }
        isCreatingPickerExerciseRequest = true
        Task {
            let created = await model.createGymExercise(
                name: name,
                description: "",
                metricType: pickerCustomMetric,
                equipment: pickerCustomEquipment.trimmingCharacters(in: .whitespacesAndNewlines),
                primaryMuscleGroup: pickerCustomMuscle.trimmingCharacters(in: .whitespacesAndNewlines),
                imageData: nil,
                fileName: "",
                mimeType: "image/jpeg"
            )
            if created,
               let exercise = model.gymExercises.last(where: { $0.name.caseInsensitiveCompare(name) == .orderedSame }) {
                _ = await model.addGymExercise(workoutID: activeWorkout?.id ?? "", exerciseID: exercise.id)
                isCreatingPickerExercise = false
                pickerCustomName = ""
                pickerCustomEquipment = ""
                pickerCustomMuscle = ""
                showingExercisePicker = false
            }
            isCreatingPickerExerciseRequest = false
        }
    }

    private var pickerMuscleOptions: [String] {
        ["All"] + Set(visibleGymExercises.map { $0.primaryMuscleGroup ?? "General" }).sorted()
    }

    private var pickerEquipmentOptions: [String] {
        ["All"] + Set(visibleGymExercises.map { $0.equipment ?? "Bodyweight" }).sorted()
    }

    private var pickerMetricOptions: [String] {
        ["All"] + Set(visibleGymExercises.map(\.metricType)).sorted()
    }

    private func metricLabel(_ metric: String) -> String {
        switch metric {
        case "REPS": return "Reps"
        case "DURATION": return "Duration"
        case "DISTANCE_DURATION": return "Distance + duration"
        default: return "Weight + reps"
        }
    }

    private var restTimerDisplay: String {
        let _ = restTimerTick
        return restTimer.isRunning ? "Rest \(Int(ceil(restTimer.remaining)))s" : "Rest timer"
    }

    private func activeElapsedLabel(_ workout: WorkoutModel) -> String {
        guard let startedAt = workout.startedAt, let start = ISO8601DateFormatter().date(from: startedAt) else { return "0:00:00" }
        let seconds = max(0, Int(clockNow.timeIntervalSince(start)))
        return "\(seconds / 3600):\(String(format: "%02d", (seconds % 3600) / 60)):\(String(format: "%02d", seconds % 60))"
    }

    private func nextUnfinishedSetID(in workout: WorkoutModel, after setID: String) -> String? {
        let allSets = (workout.exercises ?? []).flatMap { $0.sets ?? [] }
        guard let index = allSets.firstIndex(where: { $0.id == setID }) else {
            return allSets.first(where: { $0.completedAt == nil })?.id
        }
        let after = allSets[(index + 1)...].first(where: { $0.completedAt == nil })
        return after?.id ?? allSets[..<index].first(where: { $0.completedAt == nil })?.id
    }

    private func gymDateLabel(_ value: String?) -> String {
        guard let value, !value.isEmpty else { return "—" }
        return String(value.prefix(10))
    }

    private func workoutDurationLabel(_ workout: WorkoutModel) -> String {
        if let duration = workout.durationMinutes { return "\(max(0, duration))m" }
        guard let started = workout.startedAt,
              let start = ISO8601DateFormatter().date(from: started) else { return "0m" }
        let end = workout.endedAt.flatMap { ISO8601DateFormatter().date(from: $0) } ?? Date()
        return "\(max(0, Int(end.timeIntervalSince(start) / 60)))m"
    }

    private func formatWeight(_ value: Double) -> String {
        let isPounds = model.gymPreferences.weightUnit == "LBS"
        let converted = isPounds ? value * 2.2046226218 : value
        return String(format: "%.1f %@", converted, isPounds ? "lb" : "kg")
    }

    private func formatDistance(_ value: Double) -> String {
        let isMiles = model.gymPreferences.distanceUnit == "MI"
        let converted = isMiles ? value * 0.000621371192 : value / 1000
        return String(format: "%.2f %@", converted, isMiles ? "mi" : "km")
    }

    private func stepperButton(_ icon: String, value: Double, step: Double, action: @escaping (Double) -> Void) -> some View {
        Button { action(max(0, value + (icon == "plus" ? step : -step))) } label: { Image(systemName: icon) }
            .buttonStyle(.borderless)
            .foregroundStyle(iTuTheme.teal)
            .accessibilityLabel(icon == "plus" ? "Increase value" : "Decrease value")
    }

    private func setSummary(_ set: WorkoutSetModel, metric: String) -> String {
        switch metric {
        case "REPS": return "\(set.reps ?? 0) reps"
        case "DURATION": return "\(set.durationSeconds ?? 0) sec"
        case "DISTANCE_DURATION": return "\(formatDistance(set.distanceMeters ?? 0)) · \(set.durationSeconds ?? 0) sec"
        default: return "\(formatWeight(set.weight ?? 0)) · \(set.reps ?? 0) reps"
        }
    }

    private var syncStatus: String {
        switch model.syncPhase {
        case .offline: return "Offline — cached Gym data remains available"
        case .pending: return "Changes pending sync"
        case .syncing: return "Syncing Gym data…"
        case .upToDate: return "Gym data up to date"
        case .conflict: return "Sync needs attention"
        }
    }

    private var syncColor: Color {
        switch model.syncPhase {
        case .offline: return iTuTheme.inkDim
        case .pending, .syncing: return iTuTheme.syncBlue
        case .upToDate: return iTuTheme.teal
        case .conflict: return iTuTheme.amber
        }
    }
}
