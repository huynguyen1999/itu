import SwiftUI

private struct GymRoutineDraftExercise: Identifiable {
    let id: String
    var exerciseId: String
    var setCount: Int
    var targetRepsMin: Int?
    var targetRepsMax: Int?
    var restSeconds: Int?
    var note: String?
}

struct GymRoutinesView: View {
    @Environment(AppModel.self) private var model
    var onStartWorkout: ((String) -> Void)?

    @State private var showingEditor = false
    @State private var editingRoutine: RoutineModel?
    @State private var draftName = ""
    @State private var draftDescription = ""
    @State private var draftExercises: [GymRoutineDraftExercise] = []
    @State private var selectedExerciseID = ""
    @State private var isSaving = false

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Workout Routines")
                        .font(.system(size: 20, weight: .bold, design: .rounded))
                        .foregroundStyle(iTuTheme.ink)
                    Text("Templates for your training splits with instant start.")
                        .font(.system(size: 13))
                        .foregroundStyle(iTuTheme.inkDim)
                }

                Spacer()

                Button {
                    openEditor()
                } label: {
                    Label("New Routine", systemImage: "plus")
                        .font(.system(size: 12, weight: .semibold))
                }
                .buttonStyle(.borderedProminent)
                .tint(iTuTheme.mint)
            }

            if model.gymRoutines.isEmpty {
                VStack(spacing: 12) {
                    Image(systemName: "list.bullet.clipboard")
                        .font(.system(size: 36))
                        .foregroundStyle(iTuTheme.inkFaint)
                    Text("No workout routines yet")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(iTuTheme.ink)
                    Text("Create a routine template to log your workouts faster.")
                        .font(.system(size: 12))
                        .foregroundStyle(iTuTheme.inkDim)

                    Button {
                        openEditor()
                    } label: {
                        Text("Create First Routine")
                            .font(.system(size: 12, weight: .semibold))
                    }
                    .buttonStyle(.bordered)
                    .padding(.top, 4)
                }
                .frame(maxWidth: .infinity)
                .padding(40)
                .background(iTuTheme.surface)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [4]))
                        .foregroundStyle(iTuTheme.border)
                )
            } else {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 14) {
                    ForEach(model.gymRoutines) { routine in
                        routineCard(routine)
                    }
                }
            }
        }
        .sheet(isPresented: $showingEditor) {
            routineEditorSheet
        }
        .task {
            await model.loadGymRoutines()
        }
    }

    private func routineCard(_ routine: RoutineModel) -> some View {
        let exercises = routine.exercises ?? []
        let totalSets = exercises.reduce(0) { $0 + $1.setCount }

        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(routine.name)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(iTuTheme.ink)

                    if let desc = routine.description, !desc.isEmpty {
                        Text(desc)
                            .font(.system(size: 11))
                            .foregroundStyle(iTuTheme.inkDim)
                            .lineLimit(1)
                    }
                }

                Spacer()

                Menu {
                    Button {
                        openEditor(routine)
                    } label: {
                        Label("Edit Routine", systemImage: "pencil")
                    }
                    Button {
                        Task { _ = await model.archiveGymRoutine(id: routine.id) }
                    } label: {
                        Label("Archive Routine", systemImage: "archivebox")
                    }
                    Button(role: .destructive) {
                        Task {
                            _ = await model.deleteGymRoutine(id: routine.id)
                        }
                    } label: {
                        Label("Delete", systemImage: "trash")
                    }
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 12))
                        .foregroundStyle(iTuTheme.inkDim)
                }
                .menuStyle(.borderlessButton)
            }

            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) {
                    Text("\(exercises.count) exercises")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(iTuTheme.inkDim)
                    Text("•")
                        .foregroundStyle(iTuTheme.inkFaint)
                    Text("\(totalSets) target sets")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(iTuTheme.inkDim)
                }

                if !exercises.isEmpty {
                    VStack(alignment: .leading, spacing: 3) {
                        ForEach(exercises.prefix(4)) { re in
                            HStack {
                                Text("• \(re.exercise?.name ?? "Exercise")")
                                    .font(.system(size: 11))
                                    .foregroundStyle(iTuTheme.ink.opacity(0.85))
                                Spacer()
                                Text("\(re.setCount) sets")
                                    .font(.system(size: 10, design: .monospaced))
                                    .foregroundStyle(iTuTheme.inkFaint)
                            }
                        }
                    }
                }
            }

            Divider().overlay(iTuTheme.border)

            HStack {
                Spacer()

                Button {
                    onStartWorkout?(routine.id)
                } label: {
                    Label("Start Workout", systemImage: "play.fill")
                        .font(.system(size: 11, weight: .bold))
                }
                .buttonStyle(.borderedProminent)
                .tint(iTuTheme.mint)
            }
        }
        .padding(14)
        .background(iTuTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(iTuTheme.border, lineWidth: 1)
        )
    }

    private var routineEditorSheet: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(editingRoutine == nil ? "Create Routine" : "Edit Routine")
                .font(.system(size: 16, weight: .bold))

            VStack(alignment: .leading, spacing: 4) {
                Text("Routine Name")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(iTuTheme.inkDim)
                TextField("e.g. Push Day", text: $draftName)
                    .textFieldStyle(.roundedBorder)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text("Description (optional)")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(iTuTheme.inkDim)
                TextField("e.g. Chest, Shoulders, and Triceps", text: $draftDescription)
                    .textFieldStyle(.roundedBorder)
            }

            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Exercises")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(iTuTheme.inkDim)
                    Spacer()
                    Picker("Exercise", selection: $selectedExerciseID) {
                        Text("Choose exercise").tag("")
                        ForEach(model.gymExercises.filter { $0.deletedAt == nil }) { exercise in
                            Text(exercise.name).tag(exercise.id)
                        }
                    }
                    .frame(width: 170)
                    Button {
                        guard !selectedExerciseID.isEmpty else { return }
                        draftExercises.append(GymRoutineDraftExercise(id: ULID.generate(), exerciseId: selectedExerciseID, setCount: 3, targetRepsMin: nil, targetRepsMax: nil, restSeconds: nil, note: nil))
                        selectedExerciseID = ""
                    } label: {
                        Image(systemName: "plus.circle.fill")
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(iTuTheme.mint)
                }

                if draftExercises.isEmpty {
                    Text("No exercises yet. Add the movements you want to start with.")
                        .font(.system(size: 11))
                        .foregroundStyle(iTuTheme.inkDim)
                } else {
                    ForEach($draftExercises) { $exercise in
                        HStack(spacing: 8) {
                            Text(model.gymExercises.first(where: { $0.id == exercise.exerciseId })?.name ?? "Exercise")
                                .font(.system(size: 11, weight: .medium))
                                .frame(maxWidth: .infinity, alignment: .leading)
                            Stepper("\(exercise.setCount) sets", value: $exercise.setCount, in: 1...20)
                                .font(.system(size: 11))
                            Button(role: .destructive) {
                                draftExercises.removeAll { $0.id == exercise.id }
                            } label: {
                                Image(systemName: "trash")
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }

            HStack {
                Spacer()
                Button("Cancel") {
                    showingEditor = false
                }
                .buttonStyle(.bordered)

                Button(editingRoutine == nil ? "Create" : "Save") {
                    Task {
                        isSaving = true
                        let exercises = draftExercises.enumerated().map { index, draft -> [String: JSONValue] in
                            ["id": .string(draft.id), "exerciseId": .string(draft.exerciseId), "sortOrder": .number(Double(index)), "setCount": .number(Double(draft.setCount))]
                        }
                        if let editingRoutine {
                            _ = await model.updateGymRoutine(id: editingRoutine.id, patch: ["name": .string(draftName), "description": draftDescription.isEmpty ? .null : .string(draftDescription)], exercises: exercises)
                        } else {
                            _ = await model.createGymRoutine(name: draftName, description: draftDescription.isEmpty ? nil : draftDescription, exercises: exercises)
                        }
                        isSaving = false
                        showingEditor = false
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(iTuTheme.mint)
                .disabled(draftName.trimmingCharacters(in: .whitespaces).isEmpty || isSaving)
            }
        }
        .padding(20)
        .frame(width: 560)
    }

    private func openEditor(_ routine: RoutineModel? = nil) {
        editingRoutine = routine
        draftName = routine?.name ?? ""
        draftDescription = routine?.description ?? ""
        draftExercises = (routine?.exercises ?? []).map { exercise in
            GymRoutineDraftExercise(id: exercise.id, exerciseId: exercise.exerciseId, setCount: exercise.setCount, targetRepsMin: exercise.targetRepsMin, targetRepsMax: exercise.targetRepsMax, restSeconds: exercise.restSeconds, note: exercise.note)
        }
        selectedExerciseID = ""
        showingEditor = true
    }
}
