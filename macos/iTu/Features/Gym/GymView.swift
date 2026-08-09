import SwiftUI
import UniformTypeIdentifiers

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
    @State private var exerciseError: String?
    @State private var restTimer = GymRestTimer()
    @State private var restTimerTick = Date()
    @State private var editingExerciseID: String?
    @State private var editingExerciseName = ""

    private var activeWorkout: WorkoutModel? {
        model.gymWorkouts.first { $0.status == "ACTIVE" }
            ?? model.gymOverview?.recentWorkouts.first { $0.status == "ACTIVE" }
    }

    var body: some View {
        HStack(spacing: 0) {
            secondaryRail

            VStack(alignment: .leading, spacing: 0) {
                header

                if isLoading {
                    VStack(spacing: 10) {
                        ProgressView()
                        Text("Loading Gym…")
                            .font(.system(size: 13))
                            .foregroundStyle(iTuTheme.inkDim)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
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
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
        .background(iTuTheme.canvas)
        .task {
            await reload()
        }
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
                if model.conflicts.contains(where: { ["gymworkout", "exercisedefinition"].contains($0.entityType.lowercased()) }) {
                    Label("Gym change needs conflict resolution", systemImage: "exclamationmark.triangle.fill")
                        .font(.system(size: 11, weight: .medium)).foregroundStyle(iTuTheme.amber)
                }
            }
            Spacer()
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
                    HStack(alignment: .firstTextBaseline) {
                        Text(workout.title)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(iTuTheme.ink)
                        Spacer()
                        Text("IN PROGRESS")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(iTuTheme.teal)
                    }
                    HStack(spacing: 8) {
                        Text(restTimer.isRunning ? "Rest \(Int(restTimer.remaining))s" : "Rest timer")
                            .font(.system(size: 12, design: .monospaced)).foregroundStyle(iTuTheme.inkDim)
                        Button(restTimer.isRunning ? "Stop" : "Start \(model.gymPreferences.defaultRestSeconds)s") {
                            if restTimer.isRunning { restTimer.stop() } else { restTimer.start(seconds: model.gymPreferences.defaultRestSeconds) }
                            restTimerTick = Date()
                        }.buttonStyle(.bordered).controlSize(.small)
                    }

                    if let exercises = workout.exercises, !exercises.isEmpty {
                        ForEach(exercises) { exercise in
                            activeExerciseRow(exercise)
                        }
                    } else {
                        Text("No exercises yet.")
                            .font(.system(size: 13))
                            .foregroundStyle(iTuTheme.inkDim)
                    }
                }
                .padding(16)
                .background(iTuTheme.surface)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(iTuTheme.border, lineWidth: 1)
                )
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
                        Spacer()
                        Image(systemName: set.completedAt == nil ? "circle" : "checkmark.circle.fill")
                            .foregroundStyle(set.completedAt == nil ? iTuTheme.inkFaint : iTuTheme.teal)
                            .accessibilityLabel(set.completedAt == nil ? "Set not completed" : "Set completed")
                    }
                    .padding(.vertical, 6)
                    .padding(.horizontal, 8)
                    .background(iTuTheme.canvas)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
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
            metricCard(title: "TOTAL VOLUME", value: "\(weeklyVolume) kg", color: iTuTheme.amber)
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

            let recent = model.gymOverview?.recentWorkouts ?? model.gymWorkouts
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
            Text("Workout History")
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(iTuTheme.ink)

            if model.gymWorkouts.isEmpty {
                emptyState("No workouts in history.")
            } else {
                VStack(spacing: 8) {
                    ForEach(model.gymWorkouts) { workout in
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
                Text("\(model.gymExercises.count) \(model.gymExercises.count == 1 ? "exercise" : "exercises")")
                    .font(.system(size: 12, weight: .medium, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkDim)
            }

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
                                Text("Required")
                                    .font(.system(size: 10, weight: .semibold, design: .monospaced))
                                    .foregroundStyle(iTuTheme.coral)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 4)
                                    .background(iTuTheme.coral.opacity(0.12))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 5, style: .continuous)
                                            .stroke(iTuTheme.coral.opacity(0.28), lineWidth: 1)
                                    )
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

            if model.gymExercises.isEmpty {
                emptyExerciseLibraryState
            } else {
                VStack(spacing: 8) {
                    ForEach(model.gymExercises) { exercise in
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
            Text("Exercises you create will show up here, ready to add into any routine.")
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
                newExerciseName = ""
                newExerciseDescription = ""
                newExerciseEquipment = ""
                newExerciseMuscleGroup = ""
                newExerciseImageData = nil
                newExerciseImageName = ""
            } else {
                exerciseError = "The exercise could not be saved with its image. Please try again."
            }
            isCreatingExercise = false
        }
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
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(workout.title)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(iTuTheme.ink)
                if let started = workout.startedAt {
                    Text(started)
                        .font(.system(size: 11))
                        .foregroundStyle(iTuTheme.inkDim)
                }
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
            Button { Task { _ = await model.deleteGymWorkout(id: workout.id) } } label: { Image(systemName: "trash") }
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

    private func metricLabel(_ metric: String) -> String {
        switch metric {
        case "REPS": return "Reps"
        case "DURATION": return "Duration"
        case "DISTANCE_DURATION": return "Distance + duration"
        default: return "Weight + reps"
        }
    }

    private func setSummary(_ set: WorkoutSetModel, metric: String) -> String {
        switch metric {
        case "REPS": return "\(set.reps ?? 0) reps"
        case "DURATION": return "\(set.durationSeconds ?? 0) sec"
        case "DISTANCE_DURATION": return "\(set.distanceMeters ?? 0) m · \(set.durationSeconds ?? 0) sec"
        default: return "\(set.weight ?? 0) kg · \(set.reps ?? 0) reps"
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
