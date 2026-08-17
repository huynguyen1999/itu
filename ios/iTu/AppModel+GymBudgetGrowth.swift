import Foundation
import iTuDomain
import iTuOffline

// MARK: - Shared local-first helpers

enum IOSPhase6Clock {
    static func now() -> String { ISO8601DateFormatter().string(from: Date()) }
    static func durationMinutes(start: String?, end: String) -> Int? {
        let formatter = ISO8601DateFormatter()
        guard let start, let startDate = formatter.date(from: start), let endDate = formatter.date(from: end) else { return nil }
        return max(0, Int(endDate.timeIntervalSince(startDate) / 60))
    }
}

private func iosFieldEditedAt(_ patch: [String: JSONValue], at timestamp: String) -> [String: String]? {
    guard !patch.isEmpty else { return nil }
    return Dictionary(uniqueKeysWithValues: patch.keys.map { ($0, timestamp) })
}

private func iosRoutineExercisePayload(_ exercise: RoutineExerciseModel) -> [String: JSONValue] {
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
        "note": exercise.note.map(JSONValue.string) ?? .null
    ]
}

// MARK: - Gym

@MainActor
extension AppModel {
    func updateGymPreferences(patch: [String: JSONValue]) async -> Bool {
        var value = gymPreferences
        if let unit = patch["weightUnit"]?.stringValue { value.weightUnit = unit }
        if let unit = patch["distanceUnit"]?.stringValue { value.distanceUnit = unit }
        if let rest = patch["defaultRestSeconds"]?.numberValue { value.defaultRestSeconds = max(0, Int(rest)) }
        if let auto = patch["autoStartRestTimer"]?.boolValue { value.autoStartRestTimer = auto }
        if let previous = patch["previousPerformanceMode"]?.stringValue { value.previousPerformanceMode = previous }
        if let showRpe = patch["showRpe"]?.boolValue { value.showRpe = showRpe }
        if let sounds = patch["soundsEnabled"]?.boolValue { value.soundsEnabled = sounds }
        if let sounds = patch["restSoundEnabled"]?.boolValue { value.restSoundEnabled = sounds }
        if let sounds = patch["completionSoundEnabled"]?.boolValue { value.completionSoundEnabled = sounds }
        if case let .array(ids)? = patch["favoriteExerciseIDs"] { value.favoriteExerciseIDs = ids.compactMap(\.stringValue) }
        if case let .array(ids)? = patch["recentExerciseIDs"] { value.recentExerciseIDs = ids.compactMap(\.stringValue) }
        let valueToSave = value
        let now = IOSPhase6Clock.now()
        let mutation = SyncMutation(id: ULID.generate(), kind: "gympreferences.update", entityId: "gympreferences", payload: patch, fieldEditedAt: iosFieldEditedAt(patch, at: now), occurredAt: now)
        return await performOfflineMutation { try await $0.saveGymPreferences(valueToSave, mutation: mutation) }
    }

    func createGymExercise(name: String, description: String = "", metricType: String = "WEIGHT_REPS", equipment: String = "", primaryMuscleGroup: String = "", imageData: Data? = nil) async -> Bool {
        let normalizedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedName.isEmpty else { return false }
        let id = ULID.generate()
        let value = ExerciseModel(
            id: id, userId: user?.id ?? "", name: normalizedName, normalizedName: normalizedName.lowercased(),
            description: description.isEmpty ? nil : description, imageStorageKey: nil, imageUrl: nil,
            metricType: metricType, equipment: equipment.isEmpty ? nil : equipment,
            primaryMuscleGroup: primaryMuscleGroup.isEmpty ? nil : primaryMuscleGroup,
            secondaryMuscleGroups: [], defaultWeightUnit: gymPreferences.weightUnit,
            defaultRestSeconds: gymPreferences.defaultRestSeconds, archivedAt: nil, deletedAt: nil, version: 1
        )
        let payload: [String: JSONValue] = [
            "name": .string(normalizedName), "metricType": .string(metricType),
            "description": description.isEmpty ? .null : .string(description),
            "equipment": equipment.isEmpty ? .null : .string(equipment),
            "primaryMuscleGroup": primaryMuscleGroup.isEmpty ? .null : .string(primaryMuscleGroup),
            "defaultWeightUnit": .string(gymPreferences.weightUnit),
            "defaultRestSeconds": .number(Double(gymPreferences.defaultRestSeconds))
        ]
        let mutation = SyncMutation(id: ULID.generate(), kind: "exercisedefinition.create", entityId: id, payload: payload, occurredAt: IOSPhase6Clock.now())
        let saved = await performOfflineMutation { store in
            let snapshot = try await store.saveExercise(value, mutation: mutation)
            if let imageData { return try await store.queueGymExerciseImage(id: id, data: imageData) }
            return snapshot
        }
        return saved
    }

    /// Compatibility overload for callers that carry upload metadata. The
    /// local queue stores bytes and intentionally retains no remote URL until
    /// the authenticated image upload completes.
    func createGymExercise(name: String, description: String, metricType: String, equipment: String, primaryMuscleGroup: String, imageData: Data? = nil, fileName: String, mimeType: String) async -> Bool {
        _ = fileName; _ = mimeType
        return await createGymExercise(name: name, description: description, metricType: metricType, equipment: equipment, primaryMuscleGroup: primaryMuscleGroup, imageData: imageData)
    }

    func updateGymExercise(id: String, patch: [String: JSONValue]) async -> Bool {
        guard let old = gymExercises.first(where: { $0.id == id }) else { return false }
        let name = patch["name"]?.stringValue ?? old.name
        let value = ExerciseModel(
            id: old.id, userId: old.userId, name: name, normalizedName: name.lowercased(),
            description: patch["description"]?.stringValue ?? old.description, imageStorageKey: old.imageStorageKey,
            imageUrl: old.imageUrl, metricType: patch["metricType"]?.stringValue ?? old.metricType,
            equipment: patch["equipment"]?.stringValue ?? old.equipment,
            primaryMuscleGroup: patch["primaryMuscleGroup"]?.stringValue ?? old.primaryMuscleGroup,
            secondaryMuscleGroups: old.secondaryMuscleGroups, defaultWeightUnit: patch["defaultWeightUnit"]?.stringValue ?? old.defaultWeightUnit,
            defaultRestSeconds: patch["defaultRestSeconds"]?.numberValue.map(Int.init) ?? old.defaultRestSeconds,
            origin: old.origin, catalogKey: old.catalogKey, catalogVersion: old.catalogVersion,
            userNotes: old.userNotes, isFavorite: old.isFavorite, archivedAt: old.archivedAt,
            deletedAt: old.deletedAt, version: (old.version ?? 1) + 1, deletedByDeviceId: old.deletedByDeviceId
        )
        let now = IOSPhase6Clock.now()
        let mutation = SyncMutation(id: ULID.generate(), kind: "exercisedefinition.update", entityId: id, baseVersion: old.version, payload: patch, fieldEditedAt: iosFieldEditedAt(patch, at: now), occurredAt: now)
        return await performOfflineMutation { try await $0.saveExercise(value, mutation: mutation) }
    }

    func archiveGymExercise(id: String) async -> Bool {
        guard let old = gymExercises.first(where: { $0.id == id }) else { return false }
        let now = IOSPhase6Clock.now()
        let value = ExerciseModel(id: old.id, userId: old.userId, name: old.name, normalizedName: old.normalizedName, description: old.description, imageStorageKey: old.imageStorageKey, imageUrl: old.imageUrl, metricType: old.metricType, equipment: old.equipment, primaryMuscleGroup: old.primaryMuscleGroup, secondaryMuscleGroups: old.secondaryMuscleGroups, defaultWeightUnit: old.defaultWeightUnit, defaultRestSeconds: old.defaultRestSeconds, origin: old.origin, catalogKey: old.catalogKey, catalogVersion: old.catalogVersion, userNotes: old.userNotes, isFavorite: old.isFavorite, archivedAt: now, deletedAt: old.deletedAt, version: (old.version ?? 1) + 1, deletedByDeviceId: old.deletedByDeviceId)
        let payload: [String: JSONValue] = ["archivedAt": .string(now)]
        let mutation = SyncMutation(id: ULID.generate(), kind: "exercisedefinition.update", entityId: id, baseVersion: old.version, payload: payload, fieldEditedAt: iosFieldEditedAt(payload, at: now), occurredAt: now)
        return await performOfflineMutation { try await $0.saveExercise(value, mutation: mutation) }
    }

    func deleteGymExercise(id: String) async -> Bool {
        guard let old = gymExercises.first(where: { $0.id == id && $0.deletedAt == nil }) else { return false }
        let now = IOSPhase6Clock.now()
        let value = ExerciseModel(id: old.id, userId: old.userId, name: old.name, normalizedName: old.normalizedName, description: old.description, imageStorageKey: old.imageStorageKey, imageUrl: old.imageUrl, metricType: old.metricType, equipment: old.equipment, primaryMuscleGroup: old.primaryMuscleGroup, secondaryMuscleGroups: old.secondaryMuscleGroups, defaultWeightUnit: old.defaultWeightUnit, defaultRestSeconds: old.defaultRestSeconds, origin: old.origin, catalogKey: old.catalogKey, catalogVersion: old.catalogVersion, userNotes: old.userNotes, isFavorite: old.isFavorite, archivedAt: old.archivedAt, deletedAt: now, version: (old.version ?? 1) + 1, deletedByDeviceId: old.deletedByDeviceId)
        let mutation = SyncMutation(id: ULID.generate(), kind: "exercisedefinition.delete", entityId: id, baseVersion: old.version, payload: ["deletedAt": .string(now)], occurredAt: now)
        return await performOfflineMutation { try await $0.saveExercise(value, mutation: mutation) }
    }

    func createGymRoutine(name: String, description: String? = nil, exercises: [[String: JSONValue]] = []) async -> Bool {
        let normalizedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedName.isEmpty else { return false }
        let id = ULID.generate()
        let values = exercises.enumerated().compactMap { index, payload -> RoutineExerciseModel? in
            guard let exerciseID = payload["exerciseId"]?.stringValue else { return nil }
            return RoutineExerciseModel(
                id: payload["id"]?.stringValue ?? ULID.generate(), routineId: id, exerciseId: exerciseID,
                sortOrder: payload["sortOrder"]?.numberValue.map(Int.init) ?? index,
                setCount: max(1, payload["setCount"]?.numberValue.map(Int.init) ?? 3),
                targetRepsMin: payload["targetRepsMin"]?.numberValue.map(Int.init),
                targetRepsMax: payload["targetRepsMax"]?.numberValue.map(Int.init),
                targetDurationSeconds: payload["targetDurationSeconds"]?.numberValue.map(Int.init),
                targetDistanceMeters: payload["targetDistanceMeters"]?.numberValue,
                restSeconds: payload["restSeconds"]?.numberValue.map(Int.init), note: payload["note"]?.stringValue,
                exercise: gymExercises.first(where: { $0.id == exerciseID })
            )
        }
        let value = RoutineModel(id: id, userId: user?.id ?? "", name: normalizedName, description: description, sortOrder: gymRoutines.count, exercises: values)
        let now = IOSPhase6Clock.now()
        var mutations = [SyncMutation(id: ULID.generate(), kind: "gymroutine.create", entityId: id, payload: ["name": .string(normalizedName), "description": description.map(JSONValue.string) ?? .null, "sortOrder": .number(Double(value.sortOrder))], occurredAt: now)]
        mutations += values.map { SyncMutation(id: ULID.generate(), kind: "gymroutineexercise.create", entityId: $0.id, payload: iosRoutineExercisePayload($0), occurredAt: now) }
        let mutationsToSave = mutations
        return await performOfflineMutation { try await $0.saveGymRoutine(value, mutations: mutationsToSave) }
    }

    func updateGymRoutine(id: String, patch: [String: JSONValue], exercises: [[String: JSONValue]]) async -> Bool {
        guard let old = gymRoutines.first(where: { $0.id == id }) else { return false }
        let existing = Dictionary(uniqueKeysWithValues: (old.exercises ?? []).map { ($0.id, $0) })
        let values = exercises.enumerated().compactMap { index, payload -> RoutineExerciseModel? in
            guard let exerciseID = payload["exerciseId"]?.stringValue else { return nil }
            let childID = payload["id"]?.stringValue ?? ULID.generate(); let prior = existing[childID]
            return RoutineExerciseModel(
                id: childID, routineId: id, exerciseId: exerciseID,
                sortOrder: payload["sortOrder"]?.numberValue.map(Int.init) ?? index,
                setCount: max(1, payload["setCount"]?.numberValue.map(Int.init) ?? prior?.setCount ?? 3),
                targetRepsMin: payload["targetRepsMin"]?.numberValue.map(Int.init) ?? prior?.targetRepsMin,
                targetRepsMax: payload["targetRepsMax"]?.numberValue.map(Int.init) ?? prior?.targetRepsMax,
                targetDurationSeconds: payload["targetDurationSeconds"]?.numberValue.map(Int.init) ?? prior?.targetDurationSeconds,
                targetDistanceMeters: payload["targetDistanceMeters"]?.numberValue ?? prior?.targetDistanceMeters,
                restSeconds: payload["restSeconds"]?.numberValue.map(Int.init) ?? prior?.restSeconds,
                note: payload["note"]?.stringValue ?? prior?.note,
                exercise: prior?.exercise ?? gymExercises.first(where: { $0.id == exerciseID }), version: prior?.version ?? 1
            )
        }
        let now = IOSPhase6Clock.now(); let name = patch["name"]?.stringValue ?? old.name
        let description = patch.keys.contains("description") ? patch["description"]?.stringValue : old.description
        let value = RoutineModel(id: old.id, userId: old.userId, name: name, description: description, sortOrder: patch["sortOrder"]?.numberValue.map(Int.init) ?? old.sortOrder, exercises: values, archivedAt: old.archivedAt, deletedAt: old.deletedAt, version: (old.version ?? 1) + 1)
        var mutations = [SyncMutation(id: ULID.generate(), kind: "gymroutine.update", entityId: id, baseVersion: old.version, payload: patch, fieldEditedAt: iosFieldEditedAt(patch, at: now), occurredAt: now)]
        let updatedIDs = Set(values.map(\.id))
        mutations += (old.exercises ?? []).filter { !updatedIDs.contains($0.id) }.map { SyncMutation(id: ULID.generate(), kind: "gymroutineexercise.delete", entityId: $0.id, baseVersion: $0.version, payload: ["routineId": .string(id)], occurredAt: now) }
        mutations += values.map { child in SyncMutation(id: ULID.generate(), kind: existing[child.id] == nil ? "gymroutineexercise.create" : "gymroutineexercise.update", entityId: child.id, baseVersion: existing[child.id]?.version, payload: iosRoutineExercisePayload(child), occurredAt: now) }
        let mutationsToSave = mutations
        return await performOfflineMutation { try await $0.saveGymRoutine(value, mutations: mutationsToSave) }
    }

    func deleteGymRoutine(id: String) async -> Bool {
        guard let old = gymRoutines.first(where: { $0.id == id && $0.deletedAt == nil }) else { return false }
        let now = IOSPhase6Clock.now()
        let value = RoutineModel(id: old.id, userId: old.userId, name: old.name, description: old.description, sortOrder: old.sortOrder, exercises: old.exercises, archivedAt: old.archivedAt, deletedAt: now, version: (old.version ?? 1) + 1)
        return await performOfflineMutation { try await $0.saveGymRoutine(value, mutations: [SyncMutation(id: ULID.generate(), kind: "gymroutine.delete", entityId: id, baseVersion: old.version, payload: ["deletedAt": .string(now)], occurredAt: now)]) }
    }

    func archiveGymRoutine(id: String) async -> Bool {
        guard let old = gymRoutines.first(where: { $0.id == id && $0.deletedAt == nil }) else { return false }
        let now = IOSPhase6Clock.now()
        let value = RoutineModel(id: old.id, userId: old.userId, name: old.name, description: old.description, sortOrder: old.sortOrder, exercises: old.exercises, archivedAt: now, deletedAt: old.deletedAt, version: (old.version ?? 1) + 1)
        return await performOfflineMutation { try await $0.saveGymRoutine(value, mutations: [SyncMutation(id: ULID.generate(), kind: "gymroutine.archive", entityId: id, baseVersion: old.version, payload: ["archivedAt": .string(now)], occurredAt: now)]) }
    }

    func createGymRoutineFromWorkout(workoutId: String, name: String? = nil) async -> Bool {
        guard let workout = gymWorkouts.first(where: { $0.id == workoutId }) else { return false }
        let exercises = (workout.exercises ?? []).map { exercise -> [String: JSONValue] in
            ["exerciseId": .string(exercise.exerciseId), "sortOrder": .number(Double(exercise.sortOrder)), "setCount": .number(Double(exercise.sets?.count ?? 3)), "restSeconds": exercise.restSeconds.map { .number(Double($0)) } ?? .null, "note": exercise.note.map(JSONValue.string) ?? .null]
        }
        return await createGymRoutine(name: name ?? workout.title, exercises: exercises)
    }

    func updateGymRoutineFromWorkout(routineId: String, workoutId: String) async -> Bool {
        guard let workout = gymWorkouts.first(where: { $0.id == workoutId }), let routine = gymRoutines.first(where: { $0.id == routineId }) else { return false }
        let previous = routine.exercises ?? []
        let exercises = (workout.exercises ?? []).enumerated().map { index, exercise -> [String: JSONValue] in
            var payload: [String: JSONValue] = ["exerciseId": .string(exercise.exerciseId), "sortOrder": .number(Double(index)), "setCount": .number(Double(exercise.sets?.count ?? 3)), "restSeconds": exercise.restSeconds.map { .number(Double($0)) } ?? .null, "note": exercise.note.map(JSONValue.string) ?? .null]
            if index < previous.count { payload["id"] = .string(previous[index].id) }
            return payload
        }
        return await updateGymRoutine(id: routineId, patch: [:], exercises: exercises)
    }

    func startGymWorkout(title: String? = nil) async -> WorkoutModel? {
        if let active = gymWorkouts.first(where: { ["IN_PROGRESS", "ACTIVE"].contains($0.status) }) { return active }
        let id = ULID.generate(); let now = IOSPhase6Clock.now()
        let workout = WorkoutModel(id: id, userId: user?.id ?? "", title: title?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false ? title! : "Workout", status: "IN_PROGRESS", startedAt: now, endedAt: nil, durationMinutes: nil, exercises: [], version: 1, deletedAt: nil)
        let mutation = SyncMutation(id: ULID.generate(), kind: "workout.create", entityId: id, payload: ["title": .string(workout.title), "startedAt": .string(now)], occurredAt: now)
        return await performOfflineMutation { try await $0.saveWorkout(workout, mutation: mutation) } ? workout : nil
    }

    func startGymWorkoutFromRoutine(routineId: String) async -> WorkoutModel? {
        guard !gymWorkouts.contains(where: { ["IN_PROGRESS", "ACTIVE"].contains($0.status) }), let routine = gymRoutines.first(where: { $0.id == routineId && $0.deletedAt == nil && $0.archivedAt == nil }) else { return nil }
        let workoutID = ULID.generate(); let now = IOSPhase6Clock.now()
        let exercises = (routine.exercises ?? []).map { template -> WorkoutExerciseModel in
            let exerciseID = ULID.generate()
            let sets = (0..<max(1, template.setCount)).map { index in
                WorkoutSetModel(id: ULID.generate(), workoutExerciseId: exerciseID, sortOrder: index, type: "NORMAL", reps: template.targetRepsMin, weight: nil, durationSeconds: template.targetDurationSeconds, distanceMeters: template.targetDistanceMeters, rpe: nil, completedAt: nil)
            }
            return WorkoutExerciseModel(id: exerciseID, workoutEntryId: workoutID, exerciseId: template.exerciseId, sortOrder: template.sortOrder, note: template.note, restSeconds: template.restSeconds, exercise: template.exercise ?? gymExercises.first(where: { $0.id == template.exerciseId }), sets: sets)
        }
        let workout = WorkoutModel(id: workoutID, userId: user?.id ?? routine.userId, routineId: routine.id, title: routine.name, status: "IN_PROGRESS", startedAt: now, endedAt: nil, durationMinutes: nil, exercises: exercises, version: 1, deletedAt: nil)
        let workoutMutation = SyncMutation(id: ULID.generate(), kind: "workout.create", entityId: workoutID, payload: ["title": .string(workout.title), "routineId": .string(routine.id), "startedAt": .string(now)], occurredAt: now)
        return await performOfflineMutation { store in
            var snapshot = try await store.saveWorkout(workout, mutation: workoutMutation)
            for exercise in exercises {
                let payload: [String: JSONValue] = ["workoutId": .string(workoutID), "exerciseId": .string(exercise.exerciseId), "sortOrder": .number(Double(exercise.sortOrder)), "note": exercise.note.map(JSONValue.string) ?? .null, "restSeconds": exercise.restSeconds.map { .number(Double($0)) } ?? .null]
                snapshot = try await store.saveWorkoutExercise(exercise, workoutID: workoutID, mutation: SyncMutation(id: ULID.generate(), kind: "workout-exercise.create", entityId: exercise.id, payload: payload, occurredAt: now))
                for set in exercise.sets ?? [] {
                    let setPayload: [String: JSONValue] = ["workoutExerciseId": .string(exercise.id), "sortOrder": .number(Double(set.sortOrder)), "type": .string(set.type), "reps": set.reps.map { .number(Double($0)) } ?? .null, "weight": set.weight.map(JSONValue.number) ?? .null, "durationSeconds": set.durationSeconds.map { .number(Double($0)) } ?? .null, "distanceMeters": set.distanceMeters.map(JSONValue.number) ?? .null]
                    snapshot = try await store.saveWorkoutSet(set, workoutID: workoutID, mutation: SyncMutation(id: ULID.generate(), kind: "workout-set.create", entityId: set.id, payload: setPayload, occurredAt: now))
                }
            }
            return snapshot
        } ? workout : nil
    }

    func addGymExercise(workoutID: String, exerciseID: String) async -> WorkoutExerciseModel? {
        guard let workout = gymWorkouts.first(where: { $0.id == workoutID }), let exercise = gymExercises.first(where: { $0.id == exerciseID && $0.deletedAt == nil }), !(workout.exercises ?? []).contains(where: { $0.exerciseId == exerciseID }) else {
            return gymWorkouts.first(where: { $0.id == workoutID })?.exercises?.first(where: { $0.exerciseId == exerciseID })
        }
        let value = WorkoutExerciseModel(id: ULID.generate(), workoutEntryId: workoutID, exerciseId: exerciseID, sortOrder: workout.exercises?.count ?? 0, note: nil, restSeconds: exercise.defaultRestSeconds ?? gymPreferences.defaultRestSeconds, exercise: exercise, sets: [])
        let payload: [String: JSONValue] = ["workoutId": .string(workoutID), "exerciseId": .string(exerciseID), "sortOrder": .number(Double(value.sortOrder)), "restSeconds": .number(Double(value.restSeconds ?? gymPreferences.defaultRestSeconds))]
        let saved = await performOfflineMutation { try await $0.saveWorkoutExercise(value, workoutID: workoutID, mutation: SyncMutation(id: ULID.generate(), kind: "workout-exercise.create", entityId: value.id, payload: payload, occurredAt: IOSPhase6Clock.now())) }
        return saved ? value : nil
    }

    func addGymSet(workoutID: String, workoutExerciseID: String) async -> WorkoutSetModel? {
        guard let exercise = gymWorkouts.first(where: { $0.id == workoutID })?.exercises?.first(where: { $0.id == workoutExerciseID }) else { return nil }
        let previous = exercise.sets?.last
        let metric = exercise.exercise?.metricType ?? "WEIGHT_REPS"
        let set = WorkoutSetModel(id: ULID.generate(), workoutExerciseId: workoutExerciseID, sortOrder: exercise.sets?.count ?? 0, type: "NORMAL", reps: ["DURATION", "DISTANCE_DURATION"].contains(metric) ? nil : previous?.reps, weight: metric == "WEIGHT_REPS" ? previous?.weight : nil, durationSeconds: ["DURATION", "DISTANCE_DURATION"].contains(metric) ? previous?.durationSeconds : nil, distanceMeters: metric == "DISTANCE_DURATION" ? previous?.distanceMeters : nil, rpe: nil, completedAt: nil)
        let payload: [String: JSONValue] = ["workoutExerciseId": .string(workoutExerciseID), "sortOrder": .number(Double(set.sortOrder)), "type": .string(set.type), "reps": set.reps.map { .number(Double($0)) } ?? .null, "weight": set.weight.map(JSONValue.number) ?? .null, "durationSeconds": set.durationSeconds.map { .number(Double($0)) } ?? .null, "distanceMeters": set.distanceMeters.map(JSONValue.number) ?? .null]
        let saved = await performOfflineMutation { try await $0.saveWorkoutSet(set, workoutID: workoutID, mutation: SyncMutation(id: ULID.generate(), kind: "workout-set.create", entityId: set.id, payload: payload, occurredAt: IOSPhase6Clock.now())) }
        return saved ? set : nil
    }

    func updateGymSet(workoutID: String, workoutExerciseID: String, setID: String, patch: [String: JSONValue], complete: Bool = false) async -> Bool {
        guard let old = gymWorkouts.first(where: { $0.id == workoutID })?.exercises?.first(where: { $0.id == workoutExerciseID })?.sets?.first(where: { $0.id == setID }) else { return false }
        let now = IOSPhase6Clock.now()
        var normalizedPatch = patch
        if complete, normalizedPatch["completedAt"] == nil {
            normalizedPatch["completedAt"] = .string(now)
        }
        let completedAt: String?
        if case .null? = normalizedPatch["completedAt"] { completedAt = nil } else { completedAt = normalizedPatch["completedAt"]?.stringValue ?? old.completedAt }
        let value = WorkoutSetModel(id: old.id, workoutExerciseId: old.workoutExerciseId, sortOrder: old.sortOrder, type: normalizedPatch["type"]?.stringValue ?? old.type, reps: normalizedPatch["reps"]?.numberValue.map(Int.init) ?? old.reps, weight: normalizedPatch["weight"]?.numberValue ?? old.weight, durationSeconds: normalizedPatch["durationSeconds"]?.numberValue.map(Int.init) ?? old.durationSeconds, distanceMeters: normalizedPatch["distanceMeters"]?.numberValue ?? old.distanceMeters, rpe: normalizedPatch["rpe"]?.numberValue ?? old.rpe, completedAt: completedAt, version: (old.version ?? 1) + 1, deletedAt: old.deletedAt)
        let kind = complete ? "workout-set.complete" : "workout-set.update"
        let mutation = SyncMutation(id: ULID.generate(), kind: kind, entityId: setID, baseVersion: old.version, payload: normalizedPatch, fieldEditedAt: iosFieldEditedAt(normalizedPatch, at: now), occurredAt: now)
        return await performOfflineMutation { try await $0.saveWorkoutSet(value, workoutID: workoutID, mutation: mutation) }
    }

    func removeGymSet(workoutID: String, workoutExerciseID: String, setID: String) async -> Bool {
        guard let old = gymWorkouts.first(where: { $0.id == workoutID })?.exercises?.first(where: { $0.id == workoutExerciseID })?.sets?.first(where: { $0.id == setID }) else { return false }
        let mutation = SyncMutation(id: ULID.generate(), kind: "workout-set.delete", entityId: setID, baseVersion: old.version, payload: ["workoutExerciseId": .string(workoutExerciseID)], occurredAt: IOSPhase6Clock.now())
        return await performOfflineMutation { try await $0.removeWorkoutSet(id: setID, workoutID: workoutID, workoutExerciseID: workoutExerciseID, mutation: mutation) }
    }

    func removeGymExercise(workoutID: String, workoutExerciseID: String) async -> Bool {
        guard let old = gymWorkouts.first(where: { $0.id == workoutID })?.exercises?.first(where: { $0.id == workoutExerciseID }) else { return false }
        let mutation = SyncMutation(id: ULID.generate(), kind: "workout-exercise.delete", entityId: workoutExerciseID, baseVersion: old.version, payload: ["workoutId": .string(workoutID)], occurredAt: IOSPhase6Clock.now())
        return await performOfflineMutation { try await $0.removeWorkoutExercise(id: workoutExerciseID, workoutID: workoutID, mutation: mutation) }
    }

    func restoreGymExercise(workoutID: String, exercise: WorkoutExerciseModel) async -> Bool {
        guard gymWorkouts.contains(where: { $0.id == workoutID }), exercise.workoutEntryId == workoutID else { return false }
        let payload: [String: JSONValue] = [
            "workoutId": .string(workoutID), "exerciseId": .string(exercise.exerciseId),
            "sortOrder": .number(Double(exercise.sortOrder)),
            "note": exercise.note.map(JSONValue.string) ?? .null,
            "restSeconds": exercise.restSeconds.map { .number(Double($0)) } ?? .null
        ]
        let mutation = SyncMutation(id: ULID.generate(), kind: "workout-exercise.create", entityId: exercise.id, payload: payload, occurredAt: IOSPhase6Clock.now())
        return await performOfflineMutation { try await $0.saveWorkoutExercise(exercise, workoutID: workoutID, mutation: mutation) }
    }

    func completeGymWorkout(id: String) async -> Bool {
        guard let old = gymWorkouts.first(where: { $0.id == id }), ["IN_PROGRESS", "ACTIVE"].contains(old.status) else { return false }
        let endedAt = IOSPhase6Clock.now(); let duration = IOSPhase6Clock.durationMinutes(start: old.startedAt, end: endedAt)
        let value = WorkoutModel(id: old.id, userId: old.userId, routineId: old.routineId, title: old.title, status: "COMPLETED", startedAt: old.startedAt, endedAt: endedAt, durationMinutes: duration, exercises: old.exercises, version: (old.version ?? 1) + 1, deletedAt: old.deletedAt, deletedByDeviceId: old.deletedByDeviceId)
        let payload: [String: JSONValue] = ["status": .string("COMPLETED"), "endedAt": .string(endedAt), "durationMinutes": duration.map { .number(Double($0)) } ?? .null]
        let mutation = SyncMutation(id: ULID.generate(), kind: "workout.finish", entityId: id, baseVersion: old.version, payload: payload, fieldEditedAt: iosFieldEditedAt(payload, at: endedAt), occurredAt: endedAt)
        return await performOfflineMutation { try await $0.saveWorkout(value, mutation: mutation) }
    }

    func updateGymWorkout(id: String, patch: [String: JSONValue]) async -> Bool {
        guard let old = gymWorkouts.first(where: { $0.id == id }) else { return false }
        let value = WorkoutModel(
            id: old.id, userId: old.userId, routineId: old.routineId,
            title: patch["title"]?.stringValue ?? old.title,
            status: patch["status"]?.stringValue ?? old.status,
            startedAt: patch["startedAt"]?.stringValue ?? old.startedAt,
            endedAt: patch["endedAt"]?.stringValue ?? old.endedAt,
            durationMinutes: patch["durationMinutes"]?.numberValue.map(Int.init) ?? old.durationMinutes,
            exercises: old.exercises, version: (old.version ?? 1) + 1,
            deletedAt: old.deletedAt, deletedByDeviceId: old.deletedByDeviceId
        )
        let now = IOSPhase6Clock.now()
        return await performOfflineMutation { try await $0.saveWorkout(value, mutation: SyncMutation(id: ULID.generate(), kind: "workout.update", entityId: id, baseVersion: old.version, payload: patch, fieldEditedAt: iosFieldEditedAt(patch, at: now), occurredAt: now)) }
    }

    func deleteGymWorkout(id: String) async -> Bool {
        guard let old = gymWorkouts.first(where: { $0.id == id && $0.deletedAt == nil }) else { return false }
        let now = IOSPhase6Clock.now(); let value = WorkoutModel(id: old.id, userId: old.userId, routineId: old.routineId, title: old.title, status: old.status, startedAt: old.startedAt, endedAt: old.endedAt, durationMinutes: old.durationMinutes, exercises: old.exercises, version: (old.version ?? 1) + 1, deletedAt: now, deletedByDeviceId: old.deletedByDeviceId)
        let mutation = SyncMutation(id: ULID.generate(), kind: "gymworkout.delete", entityId: id, baseVersion: old.version, payload: ["deletedAt": .string(now)], occurredAt: now)
        return await performOfflineMutation { try await $0.saveWorkout(value, mutation: mutation) }
    }

    func gymPreviousSet(exerciseID: String) -> WorkoutSetModel? {
        gymWorkouts.filter { $0.status == "COMPLETED" }.sorted { ($0.endedAt ?? $0.startedAt ?? "") > ($1.endedAt ?? $1.startedAt ?? "") }.compactMap { workout in workout.exercises?.first(where: { $0.exerciseId == exerciseID })?.sets?.last(where: { $0.completedAt != nil }) }.first
    }
}

// MARK: - Budget

public enum IOSBudgetMoney {
    public static func decimal(_ value: String) -> Decimal? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let value = Decimal(string: trimmed, locale: Locale(identifier: "en_US_POSIX")), value >= 0 else { return nil }
        return value
    }

    public static func normalized(_ value: String, positive: Bool = false) -> String? {
        guard let decimal = decimal(value), (!positive || decimal > 0) else { return nil }
        return NSDecimalNumber(decimal: decimal).stringValue
    }

    public static func sum(_ values: [String]) -> Decimal {
        values.compactMap(decimal).reduce(Decimal.zero, +)
    }

    public static func sum(_ expenses: [ExpenseModel]) -> Decimal {
        expenses.reduce(Decimal.zero) { total, expense in
            total + (Decimal(string: String(expense.amount), locale: Locale(identifier: "en_US_POSIX")) ?? .zero)
        }
    }
}

public struct IOSBudgetOverview: Equatable, Sendable {
    public let period: String
    public let spent: Decimal
    public let overallLimit: Decimal?
    public let remaining: Decimal?

    public init(period: String, spent: Decimal, overallLimit: Decimal?, remaining: Decimal?) {
        self.period = period; self.spent = spent; self.overallLimit = overallLimit; self.remaining = remaining
    }
}

@MainActor
extension AppModel {
    func budgetOverview(period: String) -> IOSBudgetOverview {
        let active = expenses.filter { $0.deletedAt == nil && String($0.expenseDate.prefix(7)) == period }
        let spent = IOSBudgetMoney.sum(active)
        let limit = monthlyBudgets.first(where: { $0.period == period })?.overallLimit.flatMap { Decimal(string: String($0), locale: Locale(identifier: "en_US_POSIX")) }
        return IOSBudgetOverview(period: period, spent: spent, overallLimit: limit, remaining: limit.map { $0 - spent })
    }

    func updateBudgetPreferences(patch: [String: JSONValue]) async -> Bool {
        var value = budgetPreferences
        if let currency = patch["defaultCurrency"]?.stringValue { value.defaultCurrency = currency }
        if let remember = patch["rememberPaymentMethod"]?.boolValue { value.rememberPaymentMethod = remember }
        if let suggestions = patch["merchantSuggestionsEnabled"]?.boolValue { value.merchantSuggestionsEnabled = suggestions }
        if let threshold = patch["budgetWarningThreshold"]?.numberValue { value.budgetWarningThreshold = Int(threshold) }
        if let alerts = patch["budgetAlertsEnabled"]?.boolValue { value.budgetAlertsEnabled = alerts }
        let valueToSave = value
        let mutation = SyncMutation(id: ULID.generate(), kind: "budgetpreferences.update", entityId: "budgetpreferences", payload: patch, occurredAt: IOSPhase6Clock.now())
        return await performOfflineMutation { try await $0.saveBudgetPreferences(valueToSave, mutation: mutation) }
    }

    func createBudgetCategory(name: String, icon: String? = nil, color: String? = nil) async -> Bool {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines); guard !trimmed.isEmpty else { return false }
        let id = ULID.generate(); let value = ExpenseCategoryModel(id: id, userId: user?.id ?? "", name: trimmed, icon: icon, color: color, sortOrder: expenseCategories.count, archivedAt: nil, version: 1)
        let payload: [String: JSONValue] = ["name": .string(trimmed), "icon": icon.map(JSONValue.string) ?? .null, "color": color.map(JSONValue.string) ?? .null, "sortOrder": .number(Double(value.sortOrder))]
        return await performOfflineMutation { try await $0.saveBudgetCategory(value, mutation: SyncMutation(id: ULID.generate(), kind: "expensecategory.create", entityId: id, payload: payload, occurredAt: IOSPhase6Clock.now())) }
    }

    func updateBudgetCategory(id: String, name: String, icon: String? = nil, color: String? = nil) async -> Bool {
        guard let old = expenseCategories.first(where: { $0.id == id }), !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        let value = ExpenseCategoryModel(id: old.id, userId: old.userId, name: name.trimmingCharacters(in: .whitespacesAndNewlines), icon: icon, color: color, sortOrder: old.sortOrder, archivedAt: old.archivedAt, version: (old.version ?? 1) + 1)
        let payload: [String: JSONValue] = ["name": .string(value.name), "icon": icon.map(JSONValue.string) ?? .null, "color": color.map(JSONValue.string) ?? .null]
        return await performOfflineMutation { try await $0.saveBudgetCategory(value, mutation: SyncMutation(id: ULID.generate(), kind: "expensecategory.update", entityId: id, baseVersion: old.version, payload: payload, occurredAt: IOSPhase6Clock.now())) }
    }

    func reorderBudgetCategories(_ ids: [String]) async -> Bool {
        let order = Dictionary(uniqueKeysWithValues: ids.enumerated().map { ($1, $0) })
        let values = expenseCategories.map { category in
            ExpenseCategoryModel(id: category.id, userId: category.userId, name: category.name, icon: category.icon, color: category.color, sortOrder: order[category.id] ?? category.sortOrder, archivedAt: category.archivedAt, version: category.version)
        }
        let payload: [String: JSONValue] = ["categoryIds": .array(ids.map(JSONValue.string))]
        return await performOfflineMutation { try await $0.replaceBudgetCategories(values, mutation: SyncMutation(id: ULID.generate(), kind: "expensecategory.reorder", entityId: "expensecategories", payload: payload, occurredAt: IOSPhase6Clock.now())) }
    }

    func archiveBudgetCategory(id: String) async -> Bool {
        guard let old = expenseCategories.first(where: { $0.id == id && $0.archivedAt == nil }) else { return false }
        let now = IOSPhase6Clock.now(); let value = ExpenseCategoryModel(id: old.id, userId: old.userId, name: old.name, icon: old.icon, color: old.color, sortOrder: old.sortOrder, archivedAt: now, version: (old.version ?? 1) + 1)
        let mutation = SyncMutation(id: ULID.generate(), kind: "expensecategory.archive", entityId: id, baseVersion: old.version, payload: ["archivedAt": .string(now)], occurredAt: now)
        return await performOfflineMutation { try await $0.saveBudgetCategory(value, mutation: mutation) }
    }

    func createBudgetExpense(amount: String, categoryID: String, merchant: String? = nil, paymentMethod: String = "OTHER", expenseDate: String, note: String? = nil) async -> Bool {
        guard let normalized = IOSBudgetMoney.normalized(amount, positive: true), let decimal = IOSBudgetMoney.decimal(normalized), let category = expenseCategories.first(where: { $0.id == categoryID && $0.archivedAt == nil }) else { return false }
        let id = ULID.generate(); let now = IOSPhase6Clock.now(); let value = ExpenseModel(id: id, userId: user?.id ?? "", amount: NSDecimalNumber(decimal: decimal).doubleValue, category: category.name, categoryId: categoryID, merchant: merchant, paymentMethod: paymentMethod, expenseDate: String(expenseDate.prefix(10)), note: note, version: 1, createdAt: now, updatedAt: now)
        let payload: [String: JSONValue] = ["amount": .string(normalized), "categoryId": .string(categoryID), "merchant": merchant.map(JSONValue.string) ?? .null, "paymentMethod": .string(paymentMethod), "expenseDate": .string(value.expenseDate), "note": note.map(JSONValue.string) ?? .null]
        return await performOfflineMutation { try await $0.saveExpense(value, mutation: SyncMutation(id: ULID.generate(), kind: "expense.create", entityId: id, payload: payload, occurredAt: now)) }
    }

    func updateBudgetExpense(id: String, patch: [String: JSONValue]) async -> Bool {
        guard let old = expenses.first(where: { $0.id == id && $0.deletedAt == nil }), let categoryID = patch["categoryId"]?.stringValue ?? Optional(old.categoryId), let category = expenseCategories.first(where: { $0.id == categoryID }) else { return false }
        let amountString = patch["amount"]?.stringValue ?? String(old.amount)
        guard let normalized = IOSBudgetMoney.normalized(amountString, positive: true), let decimal = IOSBudgetMoney.decimal(normalized) else { return false }
        let now = IOSPhase6Clock.now(); let value = ExpenseModel(id: old.id, userId: old.userId, amount: NSDecimalNumber(decimal: decimal).doubleValue, category: category.name, categoryId: categoryID, merchant: patch["merchant"]?.stringValue ?? old.merchant, paymentMethod: patch["paymentMethod"]?.stringValue ?? old.paymentMethod, expenseDate: String((patch["expenseDate"]?.stringValue ?? old.expenseDate).prefix(10)), note: patch["note"]?.stringValue ?? old.note, recurringExpenseId: old.recurringExpenseId, recurringOccurrenceDate: old.recurringOccurrenceDate, version: (old.version ?? 1) + 1, createdAt: old.createdAt, updatedAt: now)
        var payload = patch; payload["amount"] = .string(normalized); payload["categoryId"] = .string(categoryID); payload["expenseDate"] = .string(value.expenseDate)
        let mutation = SyncMutation(id: ULID.generate(), kind: "expense.update", entityId: id, baseVersion: old.version, payload: payload, occurredAt: now)
        return await performOfflineMutation { try await $0.saveExpense(value, mutation: mutation) }
    }

    func deleteBudgetExpense(id: String) async -> Bool {
        guard let old = expenses.first(where: { $0.id == id && $0.deletedAt == nil }) else { return false }
        let now = IOSPhase6Clock.now(); let value = ExpenseModel(id: old.id, userId: old.userId, amount: old.amount, category: old.category, categoryId: old.categoryId, merchant: old.merchant, paymentMethod: old.paymentMethod, expenseDate: old.expenseDate, note: old.note, recurringExpenseId: old.recurringExpenseId, recurringOccurrenceDate: old.recurringOccurrenceDate, version: (old.version ?? 1) + 1, createdAt: old.createdAt, updatedAt: now, deletedAt: now, deletedByDeviceId: old.deletedByDeviceId)
        let mutation = SyncMutation(id: ULID.generate(), kind: "expense.delete", entityId: id, baseVersion: old.version, payload: ["deletedAt": .string(now)], occurredAt: now)
        return await performOfflineMutation { try await $0.saveExpense(value, mutation: mutation) }
    }

    func restoreBudgetExpense(id: String) async -> Bool {
        guard let old = expenses.first(where: { $0.id == id && $0.deletedAt != nil }) else { return false }
        let now = IOSPhase6Clock.now(); let value = ExpenseModel(id: old.id, userId: old.userId, amount: old.amount, category: old.category, categoryId: old.categoryId, merchant: old.merchant, paymentMethod: old.paymentMethod, expenseDate: old.expenseDate, note: old.note, recurringExpenseId: old.recurringExpenseId, recurringOccurrenceDate: old.recurringOccurrenceDate, version: (old.version ?? 1) + 1, createdAt: old.createdAt, updatedAt: now)
        let mutation = SyncMutation(id: ULID.generate(), kind: "expense.restore", entityId: id, baseVersion: old.version, payload: ["deletedAt": .null], occurredAt: now)
        return await performOfflineMutation { try await $0.saveExpense(value, mutation: mutation) }
    }

    func updateMonthlyBudget(period: String, overallLimit: String?) async -> Bool {
        let normalized = overallLimit.flatMap { IOSBudgetMoney.normalized($0) }; if overallLimit != nil && normalized == nil { return false }
        let old = monthlyBudgets.first(where: { $0.period == period }); let id = old?.id ?? ULID.generate(); let limit = normalized.flatMap { IOSBudgetMoney.decimal($0) }
        let value = MonthlyBudgetModel(id: id, userId: old?.userId ?? user?.id ?? "", period: period, overallLimit: limit.map { NSDecimalNumber(decimal: $0).doubleValue }, categoryLimits: old?.categoryLimits ?? [], version: (old?.version ?? 0) + 1)
        let mutation = SyncMutation(id: ULID.generate(), kind: "monthlybudget.update", entityId: id, baseVersion: old?.version, payload: ["period": .string(period), "overallLimit": normalized.map(JSONValue.string) ?? .null], occurredAt: IOSPhase6Clock.now())
        return await performOfflineMutation { try await $0.saveMonthlyBudget(value, mutation: mutation) }
    }

    func updateBudgetCategoryLimit(period: String, categoryID: String, limit: String) async -> Bool {
        guard let normalized = IOSBudgetMoney.normalized(limit), let decimal = IOSBudgetMoney.decimal(normalized), expenseCategories.contains(where: { $0.id == categoryID }) else { return false }
        let monthly = monthlyBudgets.first(where: { $0.period == period }) ?? MonthlyBudgetModel(id: ULID.generate(), userId: user?.id ?? "", period: period, overallLimit: nil)
        let needsMonthly = monthlyBudgets.first(where: { $0.period == period }) == nil
        let item = CategoryBudgetLimitModel(id: "\(monthly.id):\(categoryID)", monthlyBudgetId: monthly.id, categoryId: categoryID, limit: NSDecimalNumber(decimal: decimal).doubleValue)
        let value = MonthlyBudgetModel(id: monthly.id, userId: monthly.userId, period: period, overallLimit: monthly.overallLimit, categoryLimits: monthly.categoryLimits.filter { $0.categoryId != categoryID } + [item], version: monthly.version)
        let mutation = SyncMutation(id: ULID.generate(), kind: "categorybudget.upsert", entityId: item.id, payload: ["period": .string(period), "categoryId": .string(categoryID), "limit": .string(normalized)], occurredAt: IOSPhase6Clock.now())
        return await performOfflineMutation { store in
            if needsMonthly { _ = try await store.saveMonthlyBudget(monthly, mutation: SyncMutation(id: ULID.generate(), kind: "monthlybudget.update", entityId: monthly.id, payload: ["period": .string(period), "overallLimit": .null], occurredAt: IOSPhase6Clock.now())) }
            return try await store.saveMonthlyBudget(value, mutation: mutation)
        }
    }

    func deleteBudgetCategoryLimit(period: String, categoryID: String) async -> Bool {
        guard let monthly = monthlyBudgets.first(where: { $0.period == period }), monthly.categoryLimits.contains(where: { $0.categoryId == categoryID }) else { return false }
        let value = MonthlyBudgetModel(id: monthly.id, userId: monthly.userId, period: monthly.period, overallLimit: monthly.overallLimit, categoryLimits: monthly.categoryLimits.filter { $0.categoryId != categoryID }, version: monthly.version)
        let mutation = SyncMutation(id: ULID.generate(), kind: "categorybudget.delete", entityId: "\(monthly.id):\(categoryID)", payload: ["period": .string(period), "categoryId": .string(categoryID)], occurredAt: IOSPhase6Clock.now())
        return await performOfflineMutation { try await $0.saveMonthlyBudget(value, mutation: mutation) }
    }

    func createRecurringExpense(name: String? = nil, categoryID: String, amount: String, merchant: String? = nil, paymentMethod: String = "OTHER", note: String? = nil, frequency: String, startDate: String) async -> Bool {
        guard let normalized = IOSBudgetMoney.normalized(amount, positive: true), let decimal = IOSBudgetMoney.decimal(normalized), let category = expenseCategories.first(where: { $0.id == categoryID }) else { return false }
        let id = ULID.generate(); let value = RecurringExpenseModel(id: id, userId: user?.id ?? "", name: name, categoryId: categoryID, category: category.name, amount: NSDecimalNumber(decimal: decimal).doubleValue, merchant: merchant, paymentMethod: paymentMethod, note: note, frequency: frequency, startDate: String(startDate.prefix(10)), nextDueDate: String(startDate.prefix(10)), isActive: true, archivedAt: nil, version: 1)
        let payload: [String: JSONValue] = ["name": name.map(JSONValue.string) ?? .null, "categoryId": .string(categoryID), "amount": .string(normalized), "merchant": merchant.map(JSONValue.string) ?? .null, "paymentMethod": .string(paymentMethod), "note": note.map(JSONValue.string) ?? .null, "frequency": .string(frequency), "startDate": .string(value.startDate)]
        return await performOfflineMutation { try await $0.saveRecurringExpense(value, mutation: SyncMutation(id: ULID.generate(), kind: "recurringexpense.create", entityId: id, payload: payload, occurredAt: IOSPhase6Clock.now())) }
    }

    func skipRecurringExpense(id: String) async -> Bool {
        guard let old = recurringExpenses.first(where: { $0.id == id && $0.isActive && $0.archivedAt == nil }) else { return false }
        let next = IOSBudgetRecurring.nextDate(current: old.nextDueDate, frequency: old.frequency, anchor: old.startDate)
        let value = RecurringExpenseModel(id: old.id, userId: old.userId, name: old.name, categoryId: old.categoryId, category: old.category, amount: old.amount, merchant: old.merchant, paymentMethod: old.paymentMethod, note: old.note, frequency: old.frequency, startDate: old.startDate, nextDueDate: next, isActive: old.isActive, archivedAt: old.archivedAt, version: (old.version ?? 1) + 1)
        let mutation = SyncMutation(id: ULID.generate(), kind: "recurringexpense.skip", entityId: id, baseVersion: old.version, payload: ["occurrenceDate": .string(String(old.nextDueDate.prefix(10)))], occurredAt: IOSPhase6Clock.now())
        return await performOfflineMutation { try await $0.saveRecurringExpense(value, mutation: mutation) }
    }

    func updateRecurringExpense(id: String, patch: [String: JSONValue]) async -> Bool {
        guard let old = recurringExpenses.first(where: { $0.id == id }),
              let categoryID = patch["categoryId"]?.stringValue ?? Optional(old.categoryId),
              let category = expenseCategories.first(where: { $0.id == categoryID }) else { return false }
        let amountString = patch["amount"]?.stringValue ?? String(old.amount)
        guard let normalized = IOSBudgetMoney.normalized(amountString, positive: true), let decimal = IOSBudgetMoney.decimal(normalized) else { return false }
        let value = RecurringExpenseModel(id: old.id, userId: old.userId, name: patch["name"]?.stringValue ?? old.name, categoryId: categoryID, category: category.name, amount: NSDecimalNumber(decimal: decimal).doubleValue, merchant: patch["merchant"]?.stringValue ?? old.merchant, paymentMethod: patch["paymentMethod"]?.stringValue ?? old.paymentMethod, note: patch["note"]?.stringValue ?? old.note, frequency: patch["frequency"]?.stringValue ?? old.frequency, startDate: patch["startDate"]?.stringValue ?? old.startDate, nextDueDate: patch["nextDueDate"]?.stringValue ?? old.nextDueDate, isActive: patch["isActive"]?.boolValue ?? old.isActive, archivedAt: old.archivedAt, version: (old.version ?? 1) + 1)
        var payload = patch; payload["amount"] = .string(normalized); payload["categoryId"] = .string(categoryID)
        let payloadToSave = payload
        return await performOfflineMutation { try await $0.saveRecurringExpense(value, mutation: SyncMutation(id: ULID.generate(), kind: "recurringexpense.update", entityId: id, baseVersion: old.version, payload: payloadToSave, occurredAt: IOSPhase6Clock.now())) }
    }

    func confirmRecurringExpense(id: String) async -> Bool {
        guard let old = recurringExpenses.first(where: { $0.id == id && $0.isActive && $0.archivedAt == nil }), let category = expenseCategories.first(where: { $0.id == old.categoryId }) else { return false }
        let occurrence = String(old.nextDueDate.prefix(10)); let now = IOSPhase6Clock.now(); let expenseID = ULID.generate(); let next = IOSBudgetRecurring.nextDate(current: occurrence, frequency: old.frequency, anchor: old.startDate)
        let expense = ExpenseModel(id: expenseID, userId: old.userId, amount: old.amount, category: category.name, categoryId: old.categoryId, merchant: old.merchant, paymentMethod: old.paymentMethod, expenseDate: occurrence, note: old.note, recurringExpenseId: old.id, recurringOccurrenceDate: occurrence, version: 1, createdAt: now, updatedAt: now)
        let recurring = RecurringExpenseModel(id: old.id, userId: old.userId, name: old.name, categoryId: old.categoryId, category: old.category, amount: old.amount, merchant: old.merchant, paymentMethod: old.paymentMethod, note: old.note, frequency: old.frequency, startDate: old.startDate, nextDueDate: next, isActive: old.isActive, archivedAt: old.archivedAt, version: (old.version ?? 1) + 1)
        let mutation = SyncMutation(id: ULID.generate(), kind: "recurringexpense.confirm", entityId: id, baseVersion: old.version, payload: ["occurrenceDate": .string(occurrence), "expenseId": .string(expenseID)], occurredAt: now)
        return await performOfflineMutation { store in
            _ = try await store.saveExpense(expense)
            return try await store.saveRecurringExpense(recurring, mutation: mutation)
        }
    }

    func archiveRecurringExpense(id: String) async -> Bool {
        guard let old = recurringExpenses.first(where: { $0.id == id }) else { return false }
        let now = IOSPhase6Clock.now(); let value = RecurringExpenseModel(id: old.id, userId: old.userId, name: old.name, categoryId: old.categoryId, category: old.category, amount: old.amount, merchant: old.merchant, paymentMethod: old.paymentMethod, note: old.note, frequency: old.frequency, startDate: old.startDate, nextDueDate: old.nextDueDate, isActive: false, archivedAt: now, version: (old.version ?? 1) + 1)
        return await performOfflineMutation { try await $0.saveRecurringExpense(value, mutation: SyncMutation(id: ULID.generate(), kind: "recurringexpense.archive", entityId: id, baseVersion: old.version, payload: ["archivedAt": .string(now)], occurredAt: now)) }
    }
}

private enum IOSBudgetRecurring {
    static func nextDate(current: String, frequency: String, anchor: String) -> String {
        let formatter = DateFormatter(); formatter.calendar = Calendar(identifier: .gregorian); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.timeZone = iTuCalendarSupport.timezone; formatter.dateFormat = "yyyy-MM-dd"
        guard let date = formatter.date(from: String(current.prefix(10))) else { return current }
        var calendar = Calendar(identifier: .gregorian); calendar.timeZone = iTuCalendarSupport.timezone
        let normalized = frequency.uppercased()
        if normalized.contains("DAY") { return formatter.string(from: calendar.date(byAdding: .day, value: 1, to: date) ?? date) }
        if normalized.contains("WEEK") { return formatter.string(from: calendar.date(byAdding: .day, value: 7, to: date) ?? date) }
        if normalized.contains("YEAR") {
            let anchorDay = anchor.prefix(10).split(separator: "-").last.flatMap { Int($0) } ?? calendar.component(.day, from: date)
            let next = calendar.date(byAdding: .year, value: 1, to: date) ?? date
            let yearMonth = calendar.dateComponents([.year, .month], from: next)
            let first = calendar.date(from: DateComponents(year: yearMonth.year, month: yearMonth.month, day: 1)) ?? next
            let maxDay = calendar.range(of: .day, in: .month, for: first)?.count ?? anchorDay
            return formatter.string(from: calendar.date(from: DateComponents(year: yearMonth.year, month: yearMonth.month, day: min(anchorDay, maxDay))) ?? next)
        }
        let next = calendar.date(byAdding: .month, value: 1, to: date) ?? date
        let yearMonth = calendar.dateComponents([.year, .month], from: next)
        let anchorDay = anchor.prefix(10).split(separator: "-").last.flatMap { Int($0) } ?? calendar.component(.day, from: date)
        let first = calendar.date(from: DateComponents(year: yearMonth.year, month: yearMonth.month, day: 1)) ?? next
        let maxDay = calendar.range(of: .day, in: .month, for: first)?.count ?? anchorDay
        return formatter.string(from: calendar.date(from: DateComponents(year: yearMonth.year, month: yearMonth.month, day: min(anchorDay, maxDay))) ?? next)
    }
}

// MARK: - Growth

@MainActor
extension AppModel {
    func updateGrowthProfile(accountBaseXp: Int, rewardPreset: GrowthRewardPreset) async -> Bool {
        await performOfflineMutation { try await $0.updateGrowthProfile(accountBaseXp: accountBaseXp, rewardPreset: rewardPreset) }
    }

    func updateGrowthRewardPreset(preset: GrowthRewardPreset, rules: [String: GrowthRewardRuleDTO]) async -> Bool {
        await performOfflineMutation { try await $0.updateGrowthRewardPreset(preset: preset, rules: rules) }
    }

    func applyGrowthPreset(_ preset: GrowthRewardPreset) async -> Bool {
        await performOfflineMutation { try await $0.applyGrowthPreset(preset) }
    }

    func updateGrowthSkill(id: String, name: String, description: String, icon: String) async -> Bool {
        await performOfflineMutation { try await $0.updateSkill(id: id, name: name, description: description, icon: icon) }
    }

    func upsertGrowthAttributeMappings(skillID: String, mappings: [GrowthAttributeMappingDraft]) async -> Bool {
        await performOfflineMutation { try await $0.upsertGrowthAttributeMappings(skillID: skillID, mappings: mappings) }
    }

    func redeemGrowthReward(_ item: ShopItem) async -> Bool {
        guard let current = shopItems.first(where: { $0.id == item.id }),
              current.costCoins >= 0,
              userCoins >= current.costCoins,
              current.repeatable || !current.isPurchased else { return false }
        return await performOfflineMutation { try await $0.redeemGrowthReward(id: current.id) }
    }

    func previewGrowthReset(scope: GrowthResetScope, skillID: String?) async -> GrowthResetPreviewDTO? {
        guard isOnline else {
            setFeatureError("Growth reset requires an internet connection.")
            return nil
        }
        do {
            return try await apiClient.previewGrowthReset(scope: scope, skillId: skillID)
        } catch {
            setFeatureError("Could not preview Growth reset: \(error.localizedDescription)")
            return nil
        }
    }

    func executeGrowthReset(
        scope: GrowthResetScope,
        skillID: String?,
        keepEarningRules: Bool,
        keepShopRewards: Bool
    ) async -> Bool {
        guard isOnline else {
            setFeatureError("Growth reset requires an internet connection.")
            return false
        }
        do {
            try await apiClient.executeGrowthReset(
                scope: scope,
                skillId: skillID,
                idempotencyKey: "ios-reset-\(ULID.generate())",
                keepEarningRules: keepEarningRules,
                keepShopRewards: keepShopRewards
            )
            await reconcileForeground()
            return true
        } catch {
            setFeatureError("Could not reset Growth: \(error.localizedDescription)")
            return false
        }
    }
}
