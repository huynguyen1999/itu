import SwiftUI
import AppKit

struct ExerciseLibraryView: View {
    @Environment(AppModel.self) private var model
    @State private var searchQuery = ""
    @State private var selectedMuscle = "All"
    @State private var selectedMetric = "All"
    @State private var showCreateSheet = false
    @State private var selectedStatsExercise: ExerciseModel?

    // Create form state
    @State private var newName = ""
    @State private var newDesc = ""
    @State private var newMetric = "WEIGHT_REPS"
    @State private var newMuscle = "Chest"
    @State private var newEquipment = "Barbell"
    @State private var newImageData: Data?
    @State private var newImageName = ""
    @State private var isCreating = false
    @State private var createError: String?

    // Delete confirmation
    @State private var deleteExerciseID: String?

    private var allExercises: [ExerciseModel] {
        model.gymExercises.filter { $0.deletedAt == nil && $0.archivedAt == nil }
    }

    private var filteredExercises: [ExerciseModel] {
        allExercises.filter { ex in
            (selectedMuscle == "All" || ex.primaryMuscleGroup?.localizedCaseInsensitiveCompare(selectedMuscle) == .orderedSame) &&
            (selectedMetric == "All" || ex.metricType == selectedMetric) &&
            (searchQuery.isEmpty || ex.name.localizedCaseInsensitiveContains(searchQuery))
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            // Header Actions & Search Bar
            HStack(spacing: 12) {
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(iTuTheme.inkDim)
                    TextField("Search exercise library…", text: $searchQuery)
                        .textFieldStyle(.plain)
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 7)
                .background(iTuTheme.surface)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .stroke(iTuTheme.border, lineWidth: 1)
                }

                Spacer()

                Button {
                    showCreateSheet = true
                } label: {
                    Label("New Exercise", systemImage: "plus")
                }
                .buttonStyle(.borderedProminent)
                .tint(iTuTheme.teal)
                .controlSize(.small)
            }

            // Muscle Group Filter Chips
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(["All"] + GymSupport.muscleGroups, id: \.self) { muscle in
                        let isSelected = selectedMuscle == muscle
                        Button {
                            selectedMuscle = muscle
                        } label: {
                            Text(muscle)
                                .font(.system(size: 11, weight: isSelected ? .semibold : .regular))
                                .foregroundStyle(isSelected ? iTuTheme.teal : iTuTheme.inkDim)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 5)
                                .background(isSelected ? iTuTheme.teal.opacity(0.12) : iTuTheme.surface)
                                .clipShape(Capsule())
                                .overlay {
                                    Capsule().stroke(isSelected ? iTuTheme.teal.opacity(0.4) : iTuTheme.border, lineWidth: 1)
                                }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            // Exercises Grid / List
            if filteredExercises.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "figure.strengthtraining.traditional")
                        .font(.system(size: 28))
                        .foregroundStyle(iTuTheme.inkDim)
                    Text("No exercises match your filter.")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(iTuTheme.ink)
                }
                .frame(maxWidth: .infinity, minHeight: 140)
                .background(iTuTheme.surface)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            } else {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 280, maximum: 400), spacing: 12)], spacing: 12) {
                    ForEach(filteredExercises) { ex in
                        exerciseCard(ex)
                    }
                }
            }
        }
        .sheet(isPresented: $showCreateSheet) {
            createExerciseSheet
        }
        .popover(item: $selectedStatsExercise) { ex in
            ExerciseStatsView(exercise: ex) {
                selectedStatsExercise = nil
            }
        }
        .alert("Move exercise to Trash?", isPresented: Binding(get: { deleteExerciseID != nil }, set: { if !$0 { deleteExerciseID = nil } })) {
            Button("Move to Trash", role: .destructive) {
                if let id = deleteExerciseID {
                    Task { _ = await model.deleteGymExercise(id: id) }
                }
                deleteExerciseID = nil
            }
            Button("Cancel", role: .cancel) { deleteExerciseID = nil }
        } message: {
            Text("You can restore this exercise from Trash.")
        }
    }

    private func exerciseCard(_ ex: ExerciseModel) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                // Exercise Thumbnail
                if let imageURL = ex.imageUrl, let url = URL(string: imageURL) {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let image):
                            image.resizable().scaledToFill()
                        default:
                            fallbackExerciseIcon
                        }
                    }
                    .frame(width: 44, height: 44)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                } else {
                    fallbackExerciseIcon
                }

                VStack(alignment: .leading, spacing: 3) {
                    Text(ex.name)
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(iTuTheme.ink)
                        .lineLimit(1)

                    HStack(spacing: 4) {
                        if let muscle = ex.primaryMuscleGroup, !muscle.isEmpty {
                            Text(muscle)
                                .font(.system(size: 9, weight: .semibold))
                                .foregroundStyle(iTuTheme.teal)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 2)
                                .background(iTuTheme.teal.opacity(0.1))
                                .clipShape(Capsule())
                        }
                        if let equip = ex.equipment, !equip.isEmpty {
                            Text(equip)
                                .font(.system(size: 9, weight: .semibold))
                                .foregroundStyle(iTuTheme.inkDim)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 2)
                                .background(iTuTheme.surfaceMuted)
                                .clipShape(Capsule())
                        }
                    }
                }

                Spacer()

                Button {
                    deleteExerciseID = ex.id
                } label: {
                    Image(systemName: "trash")
                }
                .buttonStyle(.borderless)
                .font(.system(size: 11))
                .foregroundStyle(iTuTheme.coral)
                .accessibilityLabel("Delete \(ex.name)")
            }

            if let desc = ex.description, !desc.isEmpty {
                Text(desc)
                    .font(.system(size: 11))
                    .foregroundStyle(iTuTheme.inkDim)
                    .lineLimit(2)
            }

            Divider()

            HStack {
                Text(metricTypeLabel(ex.metricType))
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkDim)

                Spacer()

                Button {
                    selectedStatsExercise = ex
                } label: {
                    HStack(spacing: 4) {
                        Text("Stats & PRs")
                        Image(systemName: "chart.line.uptrend.xyaxis")
                    }
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(iTuTheme.teal)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(12)
        .background(iTuTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(iTuTheme.border, lineWidth: 1)
        }
    }

    private var fallbackExerciseIcon: some View {
        RoundedRectangle(cornerRadius: 8, style: .continuous)
            .fill(iTuTheme.teal.opacity(0.1))
            .frame(width: 44, height: 44)
            .overlay {
                Image(systemName: "dumbbell.fill")
                    .font(.system(size: 18))
                    .foregroundStyle(iTuTheme.teal)
            }
    }

    private func metricTypeLabel(_ type: String) -> String {
        GymSupport.metricTypes.first { $0.key == type }?.label ?? type
    }

    private var createExerciseSheet: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("Create Custom Exercise")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(iTuTheme.ink)
                Spacer()
                Button("Cancel") { showCreateSheet = false }
                    .buttonStyle(.plain)
            }

            Divider()

            VStack(alignment: .leading, spacing: 10) {
                TextField("Exercise Name (e.g. Incline DB Press)", text: $newName)
                    .textFieldStyle(.roundedBorder)

                TextField("Instructions or notes (optional)", text: $newDesc)
                    .textFieldStyle(.roundedBorder)

                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("METRIC TYPE")
                            .font(.system(size: 9, weight: .bold, design: .monospaced))
                            .foregroundStyle(iTuTheme.inkDim)
                        Picker("Metric", selection: $newMetric) {
                            ForEach(GymSupport.metricTypes, id: \.key) { m in
                                Text(m.label).tag(m.key)
                            }
                        }
                        .labelsHidden()
                        .pickerStyle(.menu)
                    }

                    VStack(alignment: .leading, spacing: 4) {
                        Text("TARGET MUSCLE")
                            .font(.system(size: 9, weight: .bold, design: .monospaced))
                            .foregroundStyle(iTuTheme.inkDim)
                        Picker("Muscle", selection: $newMuscle) {
                            ForEach(GymSupport.muscleGroups, id: \.self) { m in
                                Text(m).tag(m)
                            }
                        }
                        .labelsHidden()
                        .pickerStyle(.menu)
                    }

                    VStack(alignment: .leading, spacing: 4) {
                        Text("EQUIPMENT")
                            .font(.system(size: 9, weight: .bold, design: .monospaced))
                            .foregroundStyle(iTuTheme.inkDim)
                        Picker("Equipment", selection: $newEquipment) {
                            ForEach(GymSupport.equipmentOptions, id: \.self) { e in
                                Text(e).tag(e)
                            }
                        }
                        .labelsHidden()
                        .pickerStyle(.menu)
                    }
                }

                // Reference Picture selection
                HStack(spacing: 10) {
                    Button("Select Reference Image…") {
                        selectImage()
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)

                    if !newImageName.isEmpty {
                        Text(newImageName)
                            .font(.system(size: 11))
                            .foregroundStyle(iTuTheme.inkDim)
                    }
                }

                if let createError {
                    Text(createError)
                        .font(.system(size: 11))
                        .foregroundStyle(iTuTheme.coral)
                }
            }

            Spacer()

            HStack {
                Spacer()
                Button(isCreating ? "Creating…" : "Save Exercise") {
                    saveNewExercise()
                }
                .buttonStyle(.borderedProminent)
                .tint(iTuTheme.teal)
                .disabled(newName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isCreating)
            }
        }
        .padding(20)
        .frame(width: 440, height: 320)
    }

    private func selectImage() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.image]
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        if panel.runModal() == .OK, let url = panel.url {
            if let data = try? Data(contentsOf: url) {
                newImageData = data
                newImageName = url.lastPathComponent
            }
        }
    }

    private func saveNewExercise() {
        let trimmed = newName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        isCreating = true
        createError = nil
        Task {
            let success = await model.createGymExercise(
                name: trimmed,
                description: newDesc,
                metricType: newMetric,
                equipment: newEquipment,
                primaryMuscleGroup: newMuscle,
                imageData: newImageData,
                fileName: newImageName.isEmpty ? "reference.jpg" : newImageName,
                mimeType: "image/jpeg"
            )
            isCreating = false
            if success {
                newName = ""
                newDesc = ""
                newImageData = nil
                newImageName = ""
                showCreateSheet = false
            } else {
                createError = "Failed to create exercise."
            }
        }
    }
}

