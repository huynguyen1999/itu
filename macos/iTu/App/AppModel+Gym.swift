import Foundation

extension AppModel {
    @MainActor
    func updateGymPreferences(patch: [String: JSONValue]) async -> Bool {
        var value = gymPreferences
        if let unit = patch["weightUnit"]?.stringValue { value.weightUnit = unit }
        if let unit = patch["distanceUnit"]?.stringValue { value.distanceUnit = unit }
        if let rest = patch["defaultRestSeconds"]?.numberValue { value.defaultRestSeconds = Int(rest) }
        if let auto = patch["autoStartRestTimer"]?.boolValue { value.autoStartRestTimer = auto }
        if let previous = patch["previousPerformanceMode"]?.stringValue { value.previousPerformanceMode = previous }
        if let showRpe = patch["showRpe"]?.boolValue { value.showRpe = showRpe }
        if let sounds = patch["soundsEnabled"]?.boolValue { value.soundsEnabled = sounds }
        if let sounds = patch["restSoundEnabled"]?.boolValue { value.restSoundEnabled = sounds }
        if let sounds = patch["completionSoundEnabled"]?.boolValue { value.completionSoundEnabled = sounds }
        if case let .array(ids)? = patch["favoriteExerciseIDs"] { value.favoriteExerciseIDs = ids.compactMap(\.stringValue) }
        if case let .array(ids)? = patch["recentExerciseIDs"] { value.recentExerciseIDs = ids.compactMap(\.stringValue) }
        let now = ISO8601DateFormatter().string(from: Date())
        do { apply(try await offlineStore.saveGymPreferences(value, mutation: SyncMutation(id: ULID.generate(), kind: "gympreferences.update", entityId: "gympreferences", baseVersion: nil, payload: patch, fieldEditedAt: gymFieldEditedAt(patch, at: now), occurredAt: now))); return true } catch { return false }
    }

    @MainActor
    func uploadPendingGymImages() async {
        let runGeneration = sessionGeneration
        let accountID = user?.id
        let store = offlineStore
        let pending = await store.snapshot().pendingGymExerciseImages
        for (id, data) in pending {
            guard !Task.isCancelled,
                  runGeneration == sessionGeneration,
                  offlineStore === store,
                  user?.id == accountID else { return }
            do {
                _ = try await apiClient.uploadGymExerciseImage(id: id, fileData: data, fileName: "reference.jpg", mimeType: "image/jpeg")
                guard !Task.isCancelled,
                      runGeneration == sessionGeneration,
                      offlineStore === store,
                      user?.id == accountID else { return }
                apply(try await store.removeGymExerciseImage(id: id))
            } catch { continue }
        }
    }

    @MainActor
    func loadGymOverview() async {
        do {
            gymOverview = try await apiClient.getGymOverview()
        } catch {}
    }

    @MainActor
    func loadGymExercises() async {
        do {
            apply(try await offlineStore.replaceGymExercises(try await apiClient.getGymExercises()))
        } catch {}
    }

    @MainActor
    func createGymExercise(
        name: String,
        description: String,
        metricType: String,
        equipment: String,
        primaryMuscleGroup: String,
        imageData: Data? = nil,
        fileName: String,
        mimeType: String
    ) async -> Bool {
        let id = ULID.generate()
        let value = ExerciseModel(id: id, userId: user?.id ?? "", name: name, normalizedName: name.lowercased(), description: description.isEmpty ? nil : description, imageStorageKey: nil, imageUrl: nil, metricType: metricType, equipment: equipment.isEmpty ? nil : equipment, primaryMuscleGroup: primaryMuscleGroup.isEmpty ? nil : primaryMuscleGroup, secondaryMuscleGroups: [], defaultWeightUnit: gymPreferences.weightUnit, defaultRestSeconds: gymPreferences.defaultRestSeconds, archivedAt: nil, deletedAt: nil, version: 1)
        let payload: [String: JSONValue] = ["name": .string(name), "metricType": .string(metricType), "description": description.isEmpty ? .null : .string(description), "equipment": equipment.isEmpty ? .null : .string(equipment), "primaryMuscleGroup": primaryMuscleGroup.isEmpty ? .null : .string(primaryMuscleGroup), "defaultWeightUnit": .string(gymPreferences.weightUnit), "defaultRestSeconds": .number(Double(gymPreferences.defaultRestSeconds))]
        do {
            apply(try await offlineStore.saveExercise(value, mutation: SyncMutation(id: ULID.generate(), kind: "exercisedefinition.create", entityId: id, baseVersion: nil, payload: payload, occurredAt: ISO8601DateFormatter().string(from: Date()))))
            if let imageData { apply(try await offlineStore.queueGymExerciseImage(id: id, data: imageData)) }
            return true
        } catch {
            return false
        }
    }

    @MainActor
    func loadGymWorkouts() async {
        do {
            apply(try await offlineStore.replaceGymWorkouts(try await apiClient.getGymWorkouts()))
        } catch {}
    }

    @MainActor
    func startGymWorkout(title: String? = nil) async -> WorkoutModel? {
        let id = ULID.generate()
        let now = ISO8601DateFormatter().string(from: Date())
        let workout = WorkoutModel(id: id, userId: user?.id ?? "", title: title ?? "Workout", status: "IN_PROGRESS", startedAt: now, endedAt: nil, durationMinutes: nil, exercises: [], version: 1, deletedAt: nil)
        do {
            guard !gymWorkouts.contains(where: { ["IN_PROGRESS", "ACTIVE"].contains($0.status) }) else { return gymWorkouts.first(where: { ["IN_PROGRESS", "ACTIVE"].contains($0.status) }) }
            apply(try await offlineStore.saveWorkout(workout, mutation: SyncMutation(id: ULID.generate(), kind: "workout.create", entityId: id, baseVersion: nil, payload: ["title": .string(workout.title), "startedAt": .string(now)], occurredAt: now)))
            return workout
        } catch { return nil }
    }

    @MainActor
    func updateGymExercise(id: String, patch: [String: JSONValue]) async -> Bool {
        guard let old = gymExercises.first(where: { $0.id == id }) else { return false }
        let value = ExerciseModel(id: old.id, userId: old.userId, name: patch["name"]?.stringValue ?? old.name, normalizedName: (patch["name"]?.stringValue ?? old.name).lowercased(), description: patch["description"]?.stringValue ?? old.description, imageStorageKey: old.imageStorageKey, imageUrl: old.imageUrl, metricType: patch["metricType"]?.stringValue ?? old.metricType, equipment: patch["equipment"]?.stringValue ?? old.equipment, primaryMuscleGroup: patch["primaryMuscleGroup"]?.stringValue ?? old.primaryMuscleGroup, secondaryMuscleGroups: old.secondaryMuscleGroups, defaultWeightUnit: patch["defaultWeightUnit"]?.stringValue ?? old.defaultWeightUnit, defaultRestSeconds: patch["defaultRestSeconds"]?.numberValue.map(Int.init) ?? old.defaultRestSeconds, archivedAt: old.archivedAt, deletedAt: old.deletedAt, version: (old.version ?? 1) + 1)
        let now = ISO8601DateFormatter().string(from: Date())
        do { apply(try await offlineStore.saveExercise(value, mutation: SyncMutation(id: ULID.generate(), kind: "exercisedefinition.update", entityId: id, baseVersion: old.version, payload: patch, fieldEditedAt: gymFieldEditedAt(patch, at: now), occurredAt: now))); return true } catch { return false }
    }

    @MainActor
    func archiveGymExercise(id: String) async -> Bool {
        guard let old = gymExercises.first(where: { $0.id == id }) else { return false }
        let archivedAt = ISO8601DateFormatter().string(from: Date())
        let value = ExerciseModel(id: old.id, userId: old.userId, name: old.name, normalizedName: old.normalizedName, description: old.description, imageStorageKey: old.imageStorageKey, imageUrl: old.imageUrl, metricType: old.metricType, equipment: old.equipment, primaryMuscleGroup: old.primaryMuscleGroup, secondaryMuscleGroups: old.secondaryMuscleGroups, defaultWeightUnit: old.defaultWeightUnit, defaultRestSeconds: old.defaultRestSeconds, archivedAt: archivedAt, deletedAt: old.deletedAt, version: (old.version ?? 1) + 1, deletedByDeviceId: old.deletedByDeviceId)
        let patch: [String: JSONValue] = ["archivedAt": .string(archivedAt)]
        do { apply(try await offlineStore.saveExercise(value, mutation: SyncMutation(id: ULID.generate(), kind: "exercisedefinition.update", entityId: id, baseVersion: old.version, payload: patch, fieldEditedAt: gymFieldEditedAt(patch, at: archivedAt), occurredAt: archivedAt))); return true } catch { return false }
    }

    @MainActor
    func loadGymExerciseStats(id: String) async {
        gymExerciseStats[id] = try? await apiClient.getGymExerciseStats(id: id)
    }

    @MainActor
    func completeGymWorkout(id: String) async -> Bool {
        guard let old = gymWorkouts.first(where: { $0.id == id }), ["IN_PROGRESS", "ACTIVE"].contains(old.status) else { return false }
        let endedAt = ISO8601DateFormatter().string(from: Date())
        let durationMinutes = gymDurationMinutes(startedAt: old.startedAt, endedAt: endedAt) ?? old.durationMinutes
        let completedExercises = (old.exercises ?? []).compactMap { exercise -> WorkoutExerciseModel? in
            let completedSets = (exercise.sets ?? []).filter { $0.completedAt != nil }
            guard !completedSets.isEmpty else { return nil }
            return WorkoutExerciseModel(id: exercise.id, workoutEntryId: exercise.workoutEntryId, exerciseId: exercise.exerciseId, sortOrder: exercise.sortOrder, note: exercise.note, restSeconds: exercise.restSeconds, exercise: exercise.exercise, sets: completedSets, version: exercise.version, deletedAt: exercise.deletedAt)
        }
        let value = WorkoutModel(id: old.id, userId: old.userId, title: old.title, status: "COMPLETED", startedAt: old.startedAt, endedAt: endedAt, durationMinutes: durationMinutes, exercises: completedExercises, version: (old.version ?? 1) + 1, deletedAt: old.deletedAt, deletedByDeviceId: old.deletedByDeviceId)
        let payload: [String: JSONValue] = ["status": .string("COMPLETED"), "endedAt": .string(endedAt), "durationMinutes": durationMinutes.map { .number(Double($0)) } ?? .null]
        do {
            apply(try await offlineStore.saveWorkout(value, mutation: SyncMutation(id: ULID.generate(), kind: "workout.finish", entityId: id, baseVersion: old.version, payload: payload, fieldEditedAt: gymFieldEditedAt(payload, at: endedAt), occurredAt: endedAt)))
            return true
        } catch { return false }
    }

    @MainActor
    func addGymExercise(workoutID: String, exerciseID: String) async -> WorkoutExerciseModel? {
        guard let workout = gymWorkouts.first(where: { $0.id == workoutID }),
              let exercise = gymExercises.first(where: { $0.id == exerciseID && $0.deletedAt == nil }) else { return nil }
        let existing = workout.exercises ?? []
        guard !existing.contains(where: { $0.exerciseId == exerciseID }) else { return existing.first(where: { $0.exerciseId == exerciseID }) }
        let id = ULID.generate()
        let value = WorkoutExerciseModel(id: id, workoutEntryId: workoutID, exerciseId: exerciseID, sortOrder: existing.count, note: nil, restSeconds: exercise.defaultRestSeconds ?? gymPreferences.defaultRestSeconds, exercise: exercise, sets: [])
        let payload: [String: JSONValue] = ["workoutId": .string(workoutID), "exerciseId": .string(exerciseID), "sortOrder": .number(Double(value.sortOrder)), "restSeconds": .number(Double(value.restSeconds ?? gymPreferences.defaultRestSeconds))]
        do {
            apply(try await offlineStore.saveWorkoutExercise(value, workoutID: workoutID, mutation: SyncMutation(id: ULID.generate(), kind: "workout-exercise.create", entityId: id, baseVersion: nil, payload: payload, occurredAt: ISO8601DateFormatter().string(from: Date()))))
            var recent = gymPreferences.recentExerciseIDs.filter { $0 != exerciseID }
            recent.insert(exerciseID, at: 0); recent = Array(recent.prefix(12))
            _ = await updateGymPreferences(patch: ["recentExerciseIDs": .array(recent.map(JSONValue.string))])
            return value
        } catch { return nil }
    }

    @MainActor
    func addGymSet(workoutID: String, workoutExerciseID: String) async -> WorkoutSetModel? {
        guard let workout = gymWorkouts.first(where: { $0.id == workoutID }),
              let exercise = workout.exercises?.first(where: { $0.id == workoutExerciseID }) else { return nil }
        let previous = exercise.sets?.last
        let metric = exercise.exercise?.metricType ?? "WEIGHT_REPS"
        let set = WorkoutSetModel(id: ULID.generate(), workoutExerciseId: workoutExerciseID, sortOrder: exercise.sets?.count ?? 0, type: "NORMAL", reps: metric == "DURATION" || metric == "DISTANCE_DURATION" ? nil : previous?.reps, weight: metric == "WEIGHT_REPS" ? previous?.weight : nil, durationSeconds: ["DURATION", "DISTANCE_DURATION"].contains(metric) ? previous?.durationSeconds : nil, distanceMeters: metric == "DISTANCE_DURATION" ? previous?.distanceMeters : nil, rpe: nil, completedAt: nil)
        let payload: [String: JSONValue] = ["workoutExerciseId": .string(workoutExerciseID), "sortOrder": .number(Double(set.sortOrder)), "type": .string(set.type), "reps": set.reps.map { .number(Double($0)) } ?? .null, "weight": set.weight.map(JSONValue.number) ?? .null, "durationSeconds": set.durationSeconds.map { .number(Double($0)) } ?? .null, "distanceMeters": set.distanceMeters.map(JSONValue.number) ?? .null]
        do {
            apply(try await offlineStore.saveWorkoutSet(set, workoutID: workoutID, mutation: SyncMutation(id: ULID.generate(), kind: "workout-set.create", entityId: set.id, baseVersion: nil, payload: payload, occurredAt: ISO8601DateFormatter().string(from: Date()))))
            return set
        } catch { return nil }
    }

    @MainActor
    func updateGymSet(workoutID: String, workoutExerciseID: String, setID: String, patch: [String: JSONValue], complete: Bool = false) async -> Bool {
        guard let workout = gymWorkouts.first(where: { $0.id == workoutID }), let exercise = workout.exercises?.first(where: { $0.id == workoutExerciseID }), let old = exercise.sets?.first(where: { $0.id == setID }) else { return false }
        let completedAt: String?
        if case .null? = patch["completedAt"] {
            completedAt = nil
        } else {
            completedAt = patch["completedAt"]?.stringValue ?? old.completedAt
        }
        let value = WorkoutSetModel(id: old.id, workoutExerciseId: old.workoutExerciseId, sortOrder: old.sortOrder, type: patch["type"]?.stringValue ?? old.type, reps: patch["reps"]?.numberValue.map(Int.init) ?? old.reps, weight: patch["weight"]?.numberValue ?? old.weight, durationSeconds: patch["durationSeconds"]?.numberValue.map(Int.init) ?? old.durationSeconds, distanceMeters: patch["distanceMeters"]?.numberValue ?? old.distanceMeters, rpe: patch["rpe"]?.numberValue ?? old.rpe, completedAt: completedAt, version: (old.version ?? 1) + 1, deletedAt: old.deletedAt)
        let mutationKind = complete ? "workout-set.complete" : "workout-set.update"
        let now = ISO8601DateFormatter().string(from: Date())
        do { apply(try await offlineStore.saveWorkoutSet(value, workoutID: workoutID, mutation: SyncMutation(id: ULID.generate(), kind: mutationKind, entityId: setID, baseVersion: old.version, payload: patch, fieldEditedAt: gymFieldEditedAt(patch, at: now), occurredAt: now))); return true } catch { return false }
    }

    @MainActor
    func removeGymSet(workoutID: String, workoutExerciseID: String, setID: String) async -> Bool {
        guard let old = gymWorkouts.first(where: { $0.id == workoutID })?.exercises?.first(where: { $0.id == workoutExerciseID })?.sets?.first(where: { $0.id == setID }) else { return false }
        do { apply(try await offlineStore.removeWorkoutSet(id: setID, workoutID: workoutID, workoutExerciseID: workoutExerciseID, mutation: SyncMutation(id: ULID.generate(), kind: "workout-set.delete", entityId: setID, baseVersion: old.version, payload: [:], occurredAt: ISO8601DateFormatter().string(from: Date())))); return true } catch { return false }
    }

    @MainActor
    func removeGymExercise(workoutID: String, workoutExerciseID: String) async -> Bool {
        guard let old = gymWorkouts.first(where: { $0.id == workoutID })?.exercises?.first(where: { $0.id == workoutExerciseID }) else { return false }
        do { apply(try await offlineStore.removeWorkoutExercise(id: workoutExerciseID, workoutID: workoutID, mutation: SyncMutation(id: ULID.generate(), kind: "workout-exercise.delete", entityId: workoutExerciseID, baseVersion: old.version, payload: [:], occurredAt: ISO8601DateFormatter().string(from: Date())))); return true } catch { return false }
    }

    @MainActor
    func gymPreviousSet(exerciseID: String) -> WorkoutSetModel? {
        gymWorkouts.filter { $0.status == "COMPLETED" }.sorted { ($0.endedAt ?? $0.startedAt ?? "") > ($1.endedAt ?? $1.startedAt ?? "") }.lazy.compactMap { workout in workout.exercises?.first(where: { $0.exerciseId == exerciseID })?.sets?.filter { $0.completedAt != nil }.last }.first
    }

    @MainActor
    func gymStats(exerciseID: String) -> ExerciseStatsModel {
        let completed = gymWorkouts.filter { $0.status == "COMPLETED" }
        let sets = completed.flatMap { $0.exercises ?? [] }.filter { $0.exerciseId == exerciseID }.flatMap { $0.sets ?? [] }.filter { $0.completedAt != nil }
        let weightSets = sets.compactMap { set -> (Double, Int)? in guard let weight = set.weight, let reps = set.reps else { return nil }; return (weight, reps) }
        let bestWeight = weightSets.map(\.0).max()
        let bestReps = weightSets.map(\.1).max()
        let volume = weightSets.reduce(0) { $0 + $1.0 * Double($1.1) }
        let estimated = weightSets.map { $0.0 * (1 + Double($0.1) / 30) }.max()
        let trend = completed.sorted { ($0.startedAt ?? "") < ($1.startedAt ?? "") }.map { workout in
            (workout.exercises ?? []).first(where: { $0.exerciseId == exerciseID })?.sets?.filter { $0.completedAt != nil }.reduce(0) { total, set in total + (set.weight ?? 0) * Double(set.reps ?? 0) } ?? 0
        }
        var recentSets: [WorkoutSetModel] = []
        for workout in completed {
            for exercise in workout.exercises ?? [] where exercise.exerciseId == exerciseID {
                recentSets.append(contentsOf: (exercise.sets ?? []).filter { $0.completedAt != nil })
            }
        }
        recentSets.sort { ($0.completedAt ?? "") > ($1.completedAt ?? "") }
        return ExerciseStatsModel(exercise: gymExercises.first(where: { $0.id == exerciseID }), totalSets: sets.count, totalVolumeKg: volume, bestWeight: bestWeight, bestReps: bestReps, lastPerformedAt: completed.sorted { ($0.startedAt ?? "") > ($1.startedAt ?? "") }.first?.startedAt, estimated1RM: estimated, volumeTrend: trend, recentSets: Array(recentSets.prefix(8)))
    }

    @MainActor
    func updateGymWorkout(id: String, patch: [String: JSONValue]) async -> Bool {
        guard let old = gymWorkouts.first(where: { $0.id == id }) else { return false }
        let value: WorkoutModel
        if let encoded = try? JSONEncoder().encode(old), case let .object(fields) = (try? JSONDecoder().decode(JSONValue.self, from: encoded)), let merged = try? JSONEncoder().encode(JSONValue.object(fields.merging(patch) { _, latest in latest })), let decoded = try? JSONDecoder().decode(WorkoutModel.self, from: merged) {
            var copy = decoded
            copy = WorkoutModel(id: copy.id, userId: copy.userId, title: copy.title, status: copy.status, startedAt: copy.startedAt, endedAt: copy.endedAt, durationMinutes: copy.durationMinutes, exercises: copy.exercises, version: (old.version ?? 1) + 1, deletedAt: copy.deletedAt, deletedByDeviceId: copy.deletedByDeviceId)
            value = copy
        } else { return false }
        let now = ISO8601DateFormatter().string(from: Date())
        do { apply(try await offlineStore.saveWorkout(value, mutation: SyncMutation(id: ULID.generate(), kind: "workout.update", entityId: id, baseVersion: old.version, payload: patch, fieldEditedAt: gymFieldEditedAt(patch, at: now), occurredAt: now))); return true } catch { return false }
    }

    @MainActor
    func deleteGymWorkout(id: String) async -> Bool {
        guard let old = currentSnapshot.gymWorkouts.first(where: { $0.id == id }), old.deletedAt == nil else { return false }
        let now = ISO8601DateFormatter().string(from: Date())
        let value = WorkoutModel(id: old.id, userId: old.userId, title: old.title, status: old.status, startedAt: old.startedAt, endedAt: old.endedAt, durationMinutes: old.durationMinutes, exercises: old.exercises, version: (old.version ?? 1) + 1, deletedAt: now, deletedByDeviceId: old.deletedByDeviceId)
        let mutation = SyncMutation(id: ULID.generate(), kind: "gymworkout.delete", entityId: id, baseVersion: old.version, payload: ["deletedAt": .string(now)], occurredAt: now)
        do { apply(try await offlineStore.saveWorkout(value, mutation: mutation)); syncPhase = .pending; return true } catch { return false }
    }

    @MainActor
    func deleteGymExercise(id: String) async -> Bool {
        guard let old = currentSnapshot.gymExercises.first(where: { $0.id == id }), old.deletedAt == nil else { return false }
        let now = ISO8601DateFormatter().string(from: Date())
        let value = ExerciseModel(id: old.id, userId: old.userId, name: old.name, normalizedName: old.normalizedName, description: old.description, imageStorageKey: old.imageStorageKey, imageUrl: old.imageUrl, metricType: old.metricType, equipment: old.equipment, primaryMuscleGroup: old.primaryMuscleGroup, secondaryMuscleGroups: old.secondaryMuscleGroups, defaultWeightUnit: old.defaultWeightUnit, defaultRestSeconds: old.defaultRestSeconds, origin: old.origin, catalogKey: old.catalogKey, catalogVersion: old.catalogVersion, userNotes: old.userNotes, isFavorite: old.isFavorite, archivedAt: old.archivedAt, deletedAt: now, version: (old.version ?? 1) + 1, deletedByDeviceId: old.deletedByDeviceId)
        let mutation = SyncMutation(id: ULID.generate(), kind: "exercisedefinition.delete", entityId: id, baseVersion: old.version, payload: ["deletedAt": .string(now)], occurredAt: now)
        do { apply(try await offlineStore.saveExercise(value, mutation: mutation)); syncPhase = .pending; return true } catch { return false }
    }

    @MainActor
    func loadGymRoutines() async {
        do { apply(try await offlineStore.replaceGymRoutines(try await apiClient.getGymRoutines())) } catch {}
    }

    @MainActor
    func startGymWorkoutFromRoutine(routineId: String) async -> WorkoutModel? {
        do {
            let workout = try await apiClient.startWorkoutFromRoutine(routineId: routineId)
            apply(try await offlineStore.saveWorkout(workout, mutation: nil))
            return workout
        } catch {
            guard !gymWorkouts.contains(where: { ["IN_PROGRESS", "ACTIVE"].contains($0.status) }),
                  let routine = gymRoutines.first(where: { $0.id == routineId }) else { return nil }
            let now = ISO8601DateFormatter().string(from: Date())
            let workoutID = ULID.generate()
            let workoutExercises = (routine.exercises ?? []).map { routineExercise in
                let workoutExerciseID = ULID.generate()
                let sets = (0..<max(1, routineExercise.setCount)).map { index in
                    WorkoutSetModel(id: ULID.generate(), workoutExerciseId: workoutExerciseID, sortOrder: index, type: "NORMAL", reps: routineExercise.targetRepsMin, weight: nil, durationSeconds: routineExercise.targetDurationSeconds, distanceMeters: routineExercise.targetDistanceMeters, rpe: nil, completedAt: nil)
                }
                return WorkoutExerciseModel(id: workoutExerciseID, workoutEntryId: workoutID, exerciseId: routineExercise.exerciseId, sortOrder: routineExercise.sortOrder, note: routineExercise.note, restSeconds: routineExercise.restSeconds, exercise: routineExercise.exercise ?? gymExercises.first(where: { $0.id == routineExercise.exerciseId }), sets: sets)
            }
            let workout = WorkoutModel(id: workoutID, userId: user?.id ?? routine.userId, routineId: routine.id, title: routine.name, status: "IN_PROGRESS", startedAt: now, endedAt: nil, durationMinutes: nil, exercises: workoutExercises, version: 1, deletedAt: nil)
            do {
                apply(try await offlineStore.saveWorkout(workout, mutation: SyncMutation(id: ULID.generate(), kind: "workout.create", entityId: workoutID, baseVersion: nil, payload: ["title": .string(workout.title), "routineId": .string(routine.id), "startedAt": .string(now)], occurredAt: now)))
                for exercise in workoutExercises {
                    let exercisePayload: [String: JSONValue] = ["workoutId": .string(workoutID), "exerciseId": .string(exercise.exerciseId), "sortOrder": .number(Double(exercise.sortOrder)), "note": exercise.note.map(JSONValue.string) ?? .null, "restSeconds": exercise.restSeconds.map { .number(Double($0)) } ?? .null]
                    apply(try await offlineStore.saveWorkoutExercise(exercise, workoutID: workoutID, mutation: SyncMutation(id: ULID.generate(), kind: "workout-exercise.create", entityId: exercise.id, baseVersion: nil, payload: exercisePayload, occurredAt: now)))
                    for set in exercise.sets ?? [] {
                        let setPayload: [String: JSONValue] = ["workoutExerciseId": .string(exercise.id), "sortOrder": .number(Double(set.sortOrder)), "type": .string(set.type), "reps": set.reps.map { .number(Double($0)) } ?? .null, "durationSeconds": set.durationSeconds.map { .number(Double($0)) } ?? .null, "distanceMeters": set.distanceMeters.map(JSONValue.number) ?? .null]
                        apply(try await offlineStore.saveWorkoutSet(set, workoutID: workoutID, mutation: SyncMutation(id: ULID.generate(), kind: "workout-set.create", entityId: set.id, baseVersion: nil, payload: setPayload, occurredAt: now)))
                    }
                }
                syncPhase = .pending
                return workout
            } catch { return nil }
        }
    }

    @MainActor
    func repeatGymWorkout(workoutId: String) async -> WorkoutModel? {
        do {
            let workout = try await apiClient.repeatGymWorkout(workoutId: workoutId)
            apply(try await offlineStore.saveWorkout(workout, mutation: nil))
            return workout
        } catch {
            return nil
        }
    }

    @MainActor
    func createGymRoutine(name: String, description: String? = nil, exercises: [[String: JSONValue]] = []) async -> Bool {
        let routineID = ULID.generate()
        let now = ISO8601DateFormatter().string(from: Date())
        let routineExercises = exercises.enumerated().compactMap { index, payload -> RoutineExerciseModel? in
            guard let exerciseID = payload["exerciseId"]?.stringValue else { return nil }
            return RoutineExerciseModel(id: payload["id"]?.stringValue ?? ULID.generate(), routineId: routineID, exerciseId: exerciseID, sortOrder: payload["sortOrder"]?.numberValue.map(Int.init) ?? index, setCount: payload["setCount"]?.numberValue.map(Int.init) ?? 3, targetRepsMin: payload["targetRepsMin"]?.numberValue.map(Int.init), targetRepsMax: payload["targetRepsMax"]?.numberValue.map(Int.init), targetDurationSeconds: payload["targetDurationSeconds"]?.numberValue.map(Int.init), targetDistanceMeters: payload["targetDistanceMeters"]?.numberValue, restSeconds: payload["restSeconds"]?.numberValue.map(Int.init), note: payload["note"]?.stringValue, exercise: gymExercises.first(where: { $0.id == exerciseID }))
        }
        let routine = RoutineModel(id: routineID, userId: user?.id ?? "", name: name.trimmingCharacters(in: .whitespacesAndNewlines), description: description, sortOrder: gymRoutines.count, exercises: routineExercises)
        var mutations = [SyncMutation(id: ULID.generate(), kind: "gymroutine.create", entityId: routineID, baseVersion: nil, payload: ["name": .string(routine.name), "description": description.map(JSONValue.string) ?? .null, "sortOrder": .number(Double(routine.sortOrder))], occurredAt: now)]
        mutations += routineExercises.map { exercise in
            SyncMutation(id: ULID.generate(), kind: "gymroutineexercise.create", entityId: exercise.id, baseVersion: nil, payload: routineExercisePayload(exercise), occurredAt: now)
        }
        do { apply(try await offlineStore.saveGymRoutine(routine, mutations: mutations)); syncPhase = .pending; return true } catch { return false }
    }

    @MainActor
    func updateGymRoutine(id: String, patch: [String: JSONValue], exercises: [[String: JSONValue]]) async -> Bool {
        guard let old = gymRoutines.first(where: { $0.id == id }) else { return false }
        let now = ISO8601DateFormatter().string(from: Date())
        let existing = Dictionary(uniqueKeysWithValues: (old.exercises ?? []).map { ($0.id, $0) })
        let updatedExercises = exercises.enumerated().compactMap { index, payload -> RoutineExerciseModel? in
            guard let exerciseID = payload["exerciseId"]?.stringValue else { return nil }
            let childID = payload["id"]?.stringValue ?? ULID.generate()
            let prior = existing[childID]
            return RoutineExerciseModel(id: childID, routineId: id, exerciseId: exerciseID, sortOrder: payload["sortOrder"]?.numberValue.map(Int.init) ?? index, setCount: payload["setCount"]?.numberValue.map(Int.init) ?? prior?.setCount ?? 3, targetRepsMin: payload["targetRepsMin"]?.numberValue.map(Int.init) ?? prior?.targetRepsMin, targetRepsMax: payload["targetRepsMax"]?.numberValue.map(Int.init) ?? prior?.targetRepsMax, targetDurationSeconds: payload["targetDurationSeconds"]?.numberValue.map(Int.init) ?? prior?.targetDurationSeconds, targetDistanceMeters: payload["targetDistanceMeters"]?.numberValue ?? prior?.targetDistanceMeters, restSeconds: payload["restSeconds"]?.numberValue.map(Int.init) ?? prior?.restSeconds, note: payload["note"]?.stringValue ?? prior?.note, exercise: prior?.exercise ?? gymExercises.first(where: { $0.id == exerciseID }), version: prior?.version ?? 1)
        }
        let name = patch["name"]?.stringValue ?? old.name
        let description = patch.keys.contains("description") ? patch["description"]?.stringValue : old.description
        let updatedRoutine = RoutineModel(id: old.id, userId: old.userId, name: name, description: description, sortOrder: patch["sortOrder"]?.numberValue.map(Int.init) ?? old.sortOrder, exercises: updatedExercises, archivedAt: old.archivedAt, deletedAt: old.deletedAt, version: (old.version ?? 1) + 1)
        var mutations = [SyncMutation(id: ULID.generate(), kind: "gymroutine.update", entityId: id, baseVersion: old.version, payload: patch, fieldEditedAt: gymFieldEditedAt(patch, at: now), occurredAt: now)]
        let updatedIDs = Set(updatedExercises.map(\.id))
        mutations += (old.exercises ?? []).filter { !updatedIDs.contains($0.id) }.map { exercise in
            SyncMutation(id: ULID.generate(), kind: "gymroutineexercise.delete", entityId: exercise.id, baseVersion: exercise.version, payload: ["routineId": .string(id)], occurredAt: now)
        }
        mutations += updatedExercises.map { exercise in
            let kind = existing[exercise.id] == nil ? "gymroutineexercise.create" : "gymroutineexercise.update"
            return SyncMutation(id: ULID.generate(), kind: kind, entityId: exercise.id, baseVersion: existing[exercise.id]?.version, payload: routineExercisePayload(exercise), occurredAt: now)
        }
        do { apply(try await offlineStore.saveGymRoutine(updatedRoutine, mutations: mutations)); syncPhase = .pending; return true } catch { return false }
    }

    @MainActor
    func createGymRoutineFromWorkout(workoutId: String, name: String? = nil) async -> Bool {
        guard let workout = gymWorkouts.first(where: { $0.id == workoutId }) else { return false }
        let routineExercises = (workout.exercises ?? []).map { exercise -> [String: JSONValue] in
            ["exerciseId": .string(exercise.exerciseId), "sortOrder": .number(Double(exercise.sortOrder)), "setCount": .number(Double(exercise.sets?.count ?? 3)), "restSeconds": exercise.restSeconds.map { .number(Double($0)) } ?? .null, "note": exercise.note.map(JSONValue.string) ?? .null]
        }
        return await createGymRoutine(name: name ?? workout.title, description: nil, exercises: routineExercises)
    }

    @MainActor
    func updateGymRoutineFromWorkout(routineId: String, workoutId: String) async -> Bool {
        guard let workout = gymWorkouts.first(where: { $0.id == workoutId }), let routine = gymRoutines.first(where: { $0.id == routineId }) else { return false }
        let payloads = (workout.exercises ?? []).enumerated().map { index, exercise -> [String: JSONValue] in
            var payload: [String: JSONValue] = ["exerciseId": .string(exercise.exerciseId), "sortOrder": .number(Double(index)), "setCount": .number(Double(exercise.sets?.count ?? 3)), "restSeconds": exercise.restSeconds.map { .number(Double($0)) } ?? .null, "note": exercise.note.map(JSONValue.string) ?? .null]
            if index < (routine.exercises ?? []).count { payload["id"] = .string((routine.exercises ?? [])[index].id) }
            return payload
        }
        return await updateGymRoutine(id: routineId, patch: [:], exercises: payloads)
    }

    @MainActor
    func deleteGymRoutine(id: String) async -> Bool {
        guard let old = gymRoutines.first(where: { $0.id == id }) else { return false }
        let now = ISO8601DateFormatter().string(from: Date())
        let value = RoutineModel(id: old.id, userId: old.userId, name: old.name, description: old.description, sortOrder: old.sortOrder, exercises: old.exercises, archivedAt: old.archivedAt, deletedAt: now, version: (old.version ?? 1) + 1)
        let mutation = SyncMutation(id: ULID.generate(), kind: "gymroutine.delete", entityId: id, baseVersion: old.version, payload: ["deletedAt": .string(now)], occurredAt: now)
        do { apply(try await offlineStore.saveGymRoutine(value, mutations: [mutation])); syncPhase = .pending; return true } catch { return false }
    }

    @MainActor
    func archiveGymRoutine(id: String) async -> Bool {
        guard let old = gymRoutines.first(where: { $0.id == id }) else { return false }
        let now = ISO8601DateFormatter().string(from: Date())
        let value = RoutineModel(id: old.id, userId: old.userId, name: old.name, description: old.description, sortOrder: old.sortOrder, exercises: old.exercises, archivedAt: now, deletedAt: old.deletedAt, version: (old.version ?? 1) + 1)
        let mutation = SyncMutation(id: ULID.generate(), kind: "gymroutine.archive", entityId: id, baseVersion: old.version, payload: ["archivedAt": .string(now)], occurredAt: now)
        do { apply(try await offlineStore.saveGymRoutine(value, mutations: [mutation])); syncPhase = .pending; return true } catch { return false }
    }
}

private func routineExercisePayload(_ exercise: RoutineExerciseModel) -> [String: JSONValue] {
    [
        "routineId": .string(exercise.routineId),
        "exerciseId": .string(exercise.exerciseId),
        "sortOrder": .number(Double(exercise.sortOrder)),
        "setCount": .number(Double(exercise.setCount)),
        "targetRepsMin": exercise.targetRepsMin.map { .number(Double($0)) } ?? .null,
        "targetRepsMax": exercise.targetRepsMax.map { .number(Double($0)) } ?? .null,
        "targetDurationSeconds": exercise.targetDurationSeconds.map { .number(Double($0)) } ?? .null,
        "targetDistanceMeters": exercise.targetDistanceMeters.map(JSONValue.number) ?? .null,
        "restSeconds": exercise.restSeconds.map { .number(Double($0)) } ?? .null,
        "note": exercise.note.map(JSONValue.string) ?? .null,
    ]
}

private func gymFieldEditedAt(_ patch: [String: JSONValue], at timestamp: String) -> [String: String]? {
    guard !patch.isEmpty else { return nil }
    return Dictionary(uniqueKeysWithValues: patch.keys.map { ($0, timestamp) })
}

private func gymDurationMinutes(startedAt: String?, endedAt: String) -> Int? {
    guard let startedAt,
          let start = ISO8601DateFormatter().date(from: startedAt),
          let end = ISO8601DateFormatter().date(from: endedAt) else { return nil }
    return max(0, Int(end.timeIntervalSince(start) / 60.0))
}
