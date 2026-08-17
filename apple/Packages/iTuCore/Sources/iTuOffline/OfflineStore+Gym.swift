import Foundation
import iTuDomain
public extension OfflineStore {
    private var routineMutationKinds: Set<String> {
        ["gymroutine.create", "gymroutine.update", "gymroutine.delete", "gymroutine.archive", "gymroutine.restore"]
    }

    @discardableResult
    func saveGymRoutine(_ value: RoutineModel, mutations: [SyncMutation] = []) throws -> OfflineSnapshot {
        upsertGymValue(&state.gymRoutines, value)
        mutations.forEach(appendMutation)
        try persist()
        return state
    }

    @discardableResult
    func replaceGymRoutines(_ values: [RoutineModel]) throws -> OfflineSnapshot {
        let optimistic = Dictionary(uniqueKeysWithValues: state.gymRoutines.map { ($0.id, $0) })
        let pendingParentIDs = Set(state.mutations.filter { routineMutationKinds.contains($0.kind) }.map(\.entityId))
        let pendingChildParentIDs = Set(state.mutations.filter { $0.kind.hasPrefix("gymroutineexercise.") }.compactMap { $0.payload["routineId"]?.stringValue })
        let pendingIDs = pendingParentIDs.union(pendingChildParentIDs)
        let fetchedIDs = Set(values.map(\.id))
        state.gymRoutines = values + state.gymRoutines.filter { pendingIDs.contains($0.id) && !fetchedIDs.contains($0.id) }
        reapplyPendingGymRoutineMutations(optimisticByID: optimistic)
        try persist()
        return state
    }

    internal func reapplyPendingGymRoutineMutations(optimisticByID: [String: RoutineModel] = [:]) {
        for mutation in state.mutations where routineMutationKinds.contains(mutation.kind) {
            guard var base = (mutation.kind == "gymroutine.create" ? optimisticByID[mutation.entityId] : nil)
                ?? state.gymRoutines.first(where: { $0.id == mutation.entityId })
                ?? optimisticByID[mutation.entityId] else { continue }
            let payload = mutation.payload
            let archivedAt = mutation.kind == "gymroutine.archive" ? (payload["archivedAt"]?.stringValue ?? mutation.occurredAt) : mutation.kind == "gymroutine.restore" ? nil : base.archivedAt
            let deletedAt = mutation.kind == "gymroutine.delete" ? (payload["deletedAt"]?.stringValue ?? mutation.occurredAt) : mutation.kind == "gymroutine.restore" ? nil : base.deletedAt
            base = RoutineModel(
                id: base.id,
                userId: base.userId,
                name: payload["name"]?.stringValue ?? base.name,
                description: payload.keys.contains("description") ? payload["description"]?.stringValue : base.description,
                sortOrder: payload["sortOrder"]?.numberValue.map(Int.init) ?? base.sortOrder,
                exercises: base.exercises,
                archivedAt: archivedAt,
                deletedAt: deletedAt,
                version: max(base.version ?? 1, (mutation.baseVersion ?? base.version ?? 1) + 1)
            )
            upsertGymValue(&state.gymRoutines, base)
        }

        for mutation in state.mutations where mutation.kind.hasPrefix("gymroutineexercise.") {
            guard let routineID = mutation.payload["routineId"]?.stringValue
                    ?? state.gymRoutines.first(where: { $0.exercises?.contains(where: { $0.id == mutation.entityId }) == true })?.id,
                  let routineIndex = state.gymRoutines.firstIndex(where: { $0.id == routineID }) else { continue }
            let routine = state.gymRoutines[routineIndex]
            var exercises = routine.exercises ?? []
            if mutation.kind.hasSuffix(".delete") {
                exercises.removeAll { $0.id == mutation.entityId }
            } else {
                let existing = exercises.first(where: { $0.id == mutation.entityId })
                let payload = mutation.payload
                guard let exerciseID = payload["exerciseId"]?.stringValue ?? existing?.exerciseId else { continue }
                let value = RoutineExerciseModel(
                    id: mutation.entityId,
                    routineId: routineID,
                    exerciseId: exerciseID,
                    sortOrder: payload["sortOrder"]?.numberValue.map(Int.init) ?? existing?.sortOrder ?? exercises.count,
                    setCount: payload["setCount"]?.numberValue.map(Int.init) ?? existing?.setCount ?? 3,
                    targetRepsMin: payload["targetRepsMin"]?.numberValue.map(Int.init) ?? existing?.targetRepsMin,
                    targetRepsMax: payload["targetRepsMax"]?.numberValue.map(Int.init) ?? existing?.targetRepsMax,
                    targetDurationSeconds: payload["targetDurationSeconds"]?.numberValue.map(Int.init) ?? existing?.targetDurationSeconds,
                    targetDistanceMeters: payload["targetDistanceMeters"]?.numberValue ?? existing?.targetDistanceMeters,
                    restSeconds: payload["restSeconds"]?.numberValue.map(Int.init) ?? existing?.restSeconds,
                    note: payload["note"]?.stringValue ?? existing?.note,
                    exercise: existing?.exercise ?? state.gymExercises.first(where: { $0.id == exerciseID }),
                    version: max(existing?.version ?? 1, (mutation.baseVersion ?? existing?.version ?? 1) + 1)
                )
                upsertGymValue(&exercises, value)
            }
            let ordered = exercises.sorted { $0.sortOrder < $1.sortOrder }
            state.gymRoutines[routineIndex] = RoutineModel(id: routine.id, userId: routine.userId, name: routine.name, description: routine.description, sortOrder: routine.sortOrder, exercises: ordered, archivedAt: routine.archivedAt, deletedAt: routine.deletedAt, version: routine.version)
        }
    }

    internal func reapplyPendingGymExerciseMutations(optimisticByID: [String: ExerciseModel] = [:]) {
        let kinds = ["exercisedefinition.create", "exercisedefinition.update", "exercisedefinition.delete", "exercisedefinition.restore"]
        for mutation in state.mutations where kinds.contains(mutation.kind) {
            let current = state.gymExercises.first(where: { $0.id == mutation.entityId })
            guard let base = (mutation.kind == "exercisedefinition.create" ? optimisticByID[mutation.entityId] : nil) ?? current ?? optimisticByID[mutation.entityId] else { continue }
            let payload = mutation.payload
            let value = ExerciseModel(
                id: base.id,
                userId: base.userId,
                name: payload["name"]?.stringValue ?? base.name,
                normalizedName: (payload["name"]?.stringValue ?? base.name).lowercased(),
                description: payload["description"]?.stringValue ?? base.description,
                imageStorageKey: base.imageStorageKey,
                imageUrl: base.imageUrl,
                metricType: payload["metricType"]?.stringValue ?? base.metricType,
                equipment: payload["equipment"]?.stringValue ?? base.equipment,
                primaryMuscleGroup: payload["primaryMuscleGroup"]?.stringValue ?? base.primaryMuscleGroup,
                secondaryMuscleGroups: base.secondaryMuscleGroups,
                defaultWeightUnit: payload["defaultWeightUnit"]?.stringValue ?? base.defaultWeightUnit,
                defaultRestSeconds: payload["defaultRestSeconds"]?.numberValue.map(Int.init) ?? base.defaultRestSeconds,
                archivedAt: mutation.kind == "exercisedefinition.delete" ? (payload["deletedAt"]?.stringValue ?? base.archivedAt ?? mutation.occurredAt) : mutation.kind == "exercisedefinition.restore" ? nil : payload["archivedAt"]?.stringValue ?? base.archivedAt,
                deletedAt: mutation.kind == "exercisedefinition.delete" ? (payload["deletedAt"]?.stringValue ?? base.deletedAt ?? mutation.occurredAt) : mutation.kind == "exercisedefinition.restore" ? nil : base.deletedAt,
                version: max(base.version ?? 1, (mutation.baseVersion ?? base.version ?? 1) + 1),
                deletedByDeviceId: mutation.kind == "exercisedefinition.restore" ? nil : base.deletedByDeviceId
            )
            upsertGymValue(&state.gymExercises, value)
        }
    }

    /// Replays pending Gym workout mutations over a stale server response.
    /// Nested exercises remain attached to optimistic creates while field-level
    /// updates merge into the latest server aggregate.
    internal func reapplyPendingGymWorkoutMutations(optimisticByID: [String: WorkoutModel] = [:]) {
        let kinds = ["workout.create", "workout.update", "workout.finish", "gymworkout.create", "gymworkout.update", "gymworkout.delete", "gymworkout.restore"]
        for mutation in state.mutations where kinds.contains(mutation.kind) {
            let current = state.gymWorkouts.first(where: { $0.id == mutation.entityId })
            guard var base = (mutation.kind == "workout.create" || mutation.kind == "gymworkout.create" ? optimisticByID[mutation.entityId] : nil) ?? current ?? optimisticByID[mutation.entityId] else { continue }
            let payload = mutation.payload
            let status = mutation.kind == "workout.finish" ? "COMPLETED" : base.status
            let value = WorkoutModel(
                id: base.id,
                userId: base.userId,
                title: payload["title"]?.stringValue ?? base.title,
                status: status,
                startedAt: payload["startedAt"]?.stringValue ?? base.startedAt,
                endedAt: payload["endedAt"]?.stringValue ?? base.endedAt,
                durationMinutes: payload["durationMinutes"]?.numberValue.map(Int.init) ?? base.durationMinutes,
                exercises: base.exercises,
                version: max(base.version ?? 1, (mutation.baseVersion ?? base.version ?? 1) + 1),
                deletedAt: mutation.kind == "gymworkout.delete" ? (payload["deletedAt"]?.stringValue ?? base.deletedAt ?? mutation.occurredAt) : mutation.kind == "gymworkout.restore" ? nil : base.deletedAt,
                deletedByDeviceId: mutation.kind == "gymworkout.restore" ? nil : base.deletedByDeviceId
            )
            base = value
            upsertGymValue(&state.gymWorkouts, base)
        }
    }

    /// Replays child mutations after a reconnect or restart. The server's
    /// workout list can predate a pending child write, so the optimistic
    /// nested row must survive replacement of its parent aggregate.
    internal func reapplyPendingGranularGymMutations(optimisticByID: [String: WorkoutModel] = [:]) {
        for mutation in state.mutations where isGranularGymMutation(mutation.kind) {
            guard let workoutID = granularGymWorkoutID(for: mutation, optimisticByID: optimisticByID),
                  let workoutIndex = state.gymWorkouts.firstIndex(where: { $0.id == workoutID }) else { continue }

            let workout = state.gymWorkouts[workoutIndex]
            var exercises = workout.exercises ?? []
            if mutation.kind.hasPrefix("workout-exercise.") || mutation.kind.hasPrefix("workoutexercise.") || mutation.kind.hasPrefix("workout_exercise.") {
                let existingIndex = exercises.firstIndex { $0.id == mutation.entityId }
                let fallback = optimisticByID[workoutID]?.exercises?.first { $0.id == mutation.entityId }
                if mutation.kind.hasSuffix(".delete") {
                    exercises.removeAll { $0.id == mutation.entityId }
                } else if mutation.kind.hasSuffix(".create") {
                    guard let value = fallback ?? granularExerciseValue(mutation) else { continue }
                    if let existingIndex { exercises[existingIndex] = value } else { exercises.append(value) }
                } else if let base = (existingIndex.map { exercises[$0] } ?? fallback) {
                    let payload = mutation.payload
                    let value = WorkoutExerciseModel(
                        id: base.id,
                        workoutEntryId: base.workoutEntryId,
                        exerciseId: payload["exerciseId"]?.stringValue ?? base.exerciseId,
                        sortOrder: payload["sortOrder"]?.numberValue.map(Int.init) ?? base.sortOrder,
                        note: patchedString(payload, key: "note", current: base.note),
                        restSeconds: payload["restSeconds"]?.numberValue.map(Int.init) ?? base.restSeconds,
                        exercise: base.exercise,
                        sets: base.sets,
                        version: max(base.version ?? 1, (mutation.baseVersion ?? base.version ?? 1) + 1),
                        deletedAt: base.deletedAt
                    )
                    if let existingIndex { exercises[existingIndex] = value } else { exercises.append(value) }
                }
                state.gymWorkouts[workoutIndex] = WorkoutModel(id: workout.id, userId: workout.userId, title: workout.title, status: workout.status, startedAt: workout.startedAt, endedAt: workout.endedAt, durationMinutes: workout.durationMinutes, exercises: exercises.sorted { $0.sortOrder < $1.sortOrder }, version: workout.version, deletedAt: workout.deletedAt, deletedByDeviceId: workout.deletedByDeviceId)
                continue
            }

            guard let workoutExerciseID = mutation.payload["workoutExerciseId"]?.stringValue ?? exercises.first(where: { $0.sets?.contains(where: { $0.id == mutation.entityId }) == true })?.id,
                  let exerciseIndex = exercises.firstIndex(where: { $0.id == workoutExerciseID }) else { continue }
            let exercise = exercises[exerciseIndex]
            var sets = exercise.sets ?? []
            let existingIndex = sets.firstIndex { $0.id == mutation.entityId }
            let fallback = optimisticByID[workoutID]?.exercises?.first(where: { $0.id == workoutExerciseID })?.sets?.first(where: { $0.id == mutation.entityId })
            if mutation.kind.hasSuffix(".delete") {
                sets.removeAll { $0.id == mutation.entityId }
            } else if mutation.kind.hasSuffix(".create") {
                guard let value = fallback ?? granularSetValue(mutation) else { continue }
                if let existingIndex { sets[existingIndex] = value } else { sets.append(value) }
            } else if let base = (existingIndex.map { sets[$0] } ?? fallback) {
                let payload = mutation.payload
                let value = WorkoutSetModel(
                    id: base.id,
                    workoutExerciseId: base.workoutExerciseId,
                    sortOrder: payload["sortOrder"]?.numberValue.map(Int.init) ?? base.sortOrder,
                    type: payload["type"]?.stringValue ?? base.type,
                    reps: patchedInt(payload, key: "reps", current: base.reps),
                    weight: patchedDouble(payload, key: "weight", current: base.weight),
                    durationSeconds: patchedInt(payload, key: "durationSeconds", current: base.durationSeconds),
                    distanceMeters: patchedDouble(payload, key: "distanceMeters", current: base.distanceMeters),
                    rpe: patchedDouble(payload, key: "rpe", current: base.rpe),
                    completedAt: patchedString(payload, key: "completedAt", current: base.completedAt),
                    version: max(base.version ?? 1, (mutation.baseVersion ?? base.version ?? 1) + 1),
                    deletedAt: base.deletedAt
                )
                if let existingIndex { sets[existingIndex] = value } else { sets.append(value) }
            }
            exercises[exerciseIndex] = WorkoutExerciseModel(id: exercise.id, workoutEntryId: exercise.workoutEntryId, exerciseId: exercise.exerciseId, sortOrder: exercise.sortOrder, note: exercise.note, restSeconds: exercise.restSeconds, exercise: exercise.exercise, sets: sets.sorted { $0.sortOrder < $1.sortOrder }, version: exercise.version, deletedAt: exercise.deletedAt)
            state.gymWorkouts[workoutIndex] = WorkoutModel(id: workout.id, userId: workout.userId, title: workout.title, status: workout.status, startedAt: workout.startedAt, endedAt: workout.endedAt, durationMinutes: workout.durationMinutes, exercises: exercises, version: workout.version, deletedAt: workout.deletedAt, deletedByDeviceId: workout.deletedByDeviceId)
        }
    }

    private func isGranularGymMutation(_ kind: String) -> Bool {
        kind.hasPrefix("workout-exercise.") || kind.hasPrefix("workoutexercise.") || kind.hasPrefix("workout_exercise.")
            || kind.hasPrefix("workout-set.") || kind.hasPrefix("workoutset.") || kind.hasPrefix("workout_set.")
    }

    internal func pendingGranularGymWorkoutIDs(optimisticByID: [String: WorkoutModel]) -> Set<String> {
        Set(state.mutations.filter { isGranularGymMutation($0.kind) }.compactMap { granularGymWorkoutID(for: $0, optimisticByID: optimisticByID) })
    }

    private func granularGymWorkoutID(for mutation: SyncMutation, optimisticByID: [String: WorkoutModel]) -> String? {
        if let workoutID = mutation.payload["workoutId"]?.stringValue { return workoutID }
        let exerciseID = mutation.payload["workoutExerciseId"]?.stringValue
        let allWorkouts = state.gymWorkouts + Array(optimisticByID.values)
        return allWorkouts.first(where: { workout in
            workout.exercises?.contains(where: { exercise in
                exercise.id == (exerciseID ?? mutation.entityId) || exercise.sets?.contains(where: { $0.id == mutation.entityId }) == true
            }) == true
        })?.id
    }

    private func granularExerciseValue(_ mutation: SyncMutation) -> WorkoutExerciseModel? {
        guard let exerciseID = mutation.payload["exerciseId"]?.stringValue else { return nil }
        return WorkoutExerciseModel(id: mutation.entityId, workoutEntryId: mutation.payload["workoutId"]?.stringValue ?? "", exerciseId: exerciseID, sortOrder: mutation.payload["sortOrder"]?.numberValue.map(Int.init) ?? 0, note: mutation.payload["note"]?.stringValue, restSeconds: mutation.payload["restSeconds"]?.numberValue.map(Int.init), exercise: nil, sets: [])
    }

    private func granularSetValue(_ mutation: SyncMutation) -> WorkoutSetModel? {
        guard let workoutExerciseID = mutation.payload["workoutExerciseId"]?.stringValue else { return nil }
        return WorkoutSetModel(id: mutation.entityId, workoutExerciseId: workoutExerciseID, sortOrder: mutation.payload["sortOrder"]?.numberValue.map(Int.init) ?? 0, type: mutation.payload["type"]?.stringValue ?? "NORMAL", reps: mutation.payload["reps"]?.numberValue.map(Int.init), weight: mutation.payload["weight"]?.numberValue, durationSeconds: mutation.payload["durationSeconds"]?.numberValue.map(Int.init), distanceMeters: mutation.payload["distanceMeters"]?.numberValue, rpe: mutation.payload["rpe"]?.numberValue, completedAt: mutation.payload["completedAt"]?.stringValue)
    }

    private func patchedString(_ payload: [String: JSONValue], key: String, current: String?) -> String? {
        guard let value = payload[key] else { return current }
        return value.stringValue
    }

    private func patchedInt(_ payload: [String: JSONValue], key: String, current: Int?) -> Int? {
        guard let value = payload[key] else { return current }
        return value.numberValue.map(Int.init)
    }

    private func patchedDouble(_ payload: [String: JSONValue], key: String, current: Double?) -> Double? {
        guard let value = payload[key] else { return current }
        return value.numberValue
    }

    @discardableResult
    func saveGymPreferences(_ value: GymPreferencesModel, mutation: SyncMutation) throws -> OfflineSnapshot {
        state.gymPreferences = value
        appendMutation(mutation)
        try persist()
        return state
    }

    @discardableResult
    func queueGymExerciseImage(id: String, data: Data) throws -> OfflineSnapshot {
        state.pendingGymExerciseImages[id] = data
        try persist()
        return state
    }

    @discardableResult
    func removeGymExerciseImage(id: String) throws -> OfflineSnapshot {
        state.pendingGymExerciseImages.removeValue(forKey: id)
        try persist()
        return state
    }

    func upsertGymValue<Value: Identifiable>(_ values: inout [Value], _ value: Value) where Value.ID: Equatable {
        if let index = values.firstIndex(where: { $0.id == value.id }) { values[index] = value } else { values.append(value) }
    }

    internal func applyGymChanges(_ changes: [SyncChange], pending: Set<String>) {
        for change in changes {
            let prefix = change.entityType.lowercased()
            let key = "\(prefix):\(change.entityId)"
            guard !pending.contains(key) else { continue }
            if prefix == "gymroutine" {
                if change.deleted { state.gymRoutines.removeAll { $0.id == change.entityId }; continue }
                if let data = change.data, let value = try? decoder.decode(RoutineModel.self, from: encoder.encode(data)) { upsertGymValue(&state.gymRoutines, value) }
            } else if prefix == "gymroutineexercise" {
                if change.deleted {
                    for index in state.gymRoutines.indices {
                        let routine = state.gymRoutines[index]
                        guard let exercises = routine.exercises, exercises.contains(where: { $0.id == change.entityId }) else { continue }
                        state.gymRoutines[index] = RoutineModel(id: routine.id, userId: routine.userId, name: routine.name, description: routine.description, sortOrder: routine.sortOrder, exercises: exercises.filter { $0.id != change.entityId }, archivedAt: routine.archivedAt, deletedAt: routine.deletedAt, version: routine.version)
                    }
                    continue
                }
                guard let data = change.data, let value = try? decoder.decode(RoutineExerciseModel.self, from: encoder.encode(data)), let index = state.gymRoutines.firstIndex(where: { $0.id == value.routineId }) else { continue }
                let routine = state.gymRoutines[index]
                var exercises = routine.exercises ?? []
                upsertGymValue(&exercises, value)
                state.gymRoutines[index] = RoutineModel(id: routine.id, userId: routine.userId, name: routine.name, description: routine.description, sortOrder: routine.sortOrder, exercises: exercises.sorted { $0.sortOrder < $1.sortOrder }, archivedAt: routine.archivedAt, deletedAt: routine.deletedAt, version: routine.version)
            } else if prefix == "exercisedefinition" {
                if change.deleted {
                    if state.gymExercises.first(where: { $0.id == change.entityId })?.deletedAt == nil {
                        state.gymExercises.removeAll { $0.id == change.entityId }
                    }
                    continue
                }
                if let data = change.data, let value = try? decoder.decode(ExerciseModel.self, from: encoder.encode(data)) { upsertGymValue(&state.gymExercises, value) }
            } else if prefix == "gymworkout" {
                if change.deleted {
                    if state.gymWorkouts.first(where: { $0.id == change.entityId })?.deletedAt == nil {
                        state.gymWorkouts.removeAll { $0.id == change.entityId }
                    }
                    continue
                }
                if let data = change.data, let value = try? decoder.decode(WorkoutModel.self, from: encoder.encode(data)) { upsertGymValue(&state.gymWorkouts, value) }
            } else if prefix == "workout" {
                if change.deleted { state.gymWorkouts.removeAll { $0.id == change.entityId }; continue }
                if let data = change.data, let value = try? decoder.decode(WorkoutModel.self, from: encoder.encode(data)) { upsertGymValue(&state.gymWorkouts, value) }
            } else if prefix == "workout-exercise" || prefix == "workoutexercise" {
                if change.deleted {
                    for workoutIndex in state.gymWorkouts.indices {
                        let workout = state.gymWorkouts[workoutIndex]
                        guard let exercises = workout.exercises,
                              exercises.contains(where: { $0.id == change.entityId }) else { continue }
                        let remaining = exercises.filter { $0.id != change.entityId }
                        state.gymWorkouts[workoutIndex] = WorkoutModel(id: workout.id, userId: workout.userId, title: workout.title, status: workout.status, startedAt: workout.startedAt, endedAt: workout.endedAt, durationMinutes: workout.durationMinutes, exercises: remaining, version: workout.version, deletedAt: workout.deletedAt, deletedByDeviceId: workout.deletedByDeviceId)
                    }
                    continue
                }
                guard let data = change.data,
                      let value = try? decoder.decode(WorkoutExerciseModel.self, from: encoder.encode(data)) else { continue }
                let workoutID = value.workoutEntryId
                guard let workoutIndex = state.gymWorkouts.firstIndex(where: { $0.id == workoutID }) else { continue }
                let workout = state.gymWorkouts[workoutIndex]
                var exercises = workout.exercises ?? []
                upsertGymValue(&exercises, value)
                state.gymWorkouts[workoutIndex] = WorkoutModel(id: workout.id, userId: workout.userId, title: workout.title, status: workout.status, startedAt: workout.startedAt, endedAt: workout.endedAt, durationMinutes: workout.durationMinutes, exercises: exercises.sorted { $0.sortOrder < $1.sortOrder }, version: workout.version, deletedAt: workout.deletedAt, deletedByDeviceId: workout.deletedByDeviceId)
            } else if prefix == "workout-set" || prefix == "workoutset" {
                if change.deleted {
                    for workoutIndex in state.gymWorkouts.indices {
                        let workout = state.gymWorkouts[workoutIndex]
                        guard var exercises = workout.exercises else { continue }
                        var changed = false
                        for exerciseIndex in exercises.indices {
                            let exercise = exercises[exerciseIndex]
                            guard let sets = exercise.sets, sets.contains(where: { $0.id == change.entityId }) else { continue }
                            let remaining = sets.filter { $0.id != change.entityId }
                            exercises[exerciseIndex] = WorkoutExerciseModel(id: exercise.id, workoutEntryId: exercise.workoutEntryId, exerciseId: exercise.exerciseId, sortOrder: exercise.sortOrder, note: exercise.note, restSeconds: exercise.restSeconds, exercise: exercise.exercise, sets: remaining, version: exercise.version, deletedAt: exercise.deletedAt)
                            changed = true
                        }
                        if changed {
                            state.gymWorkouts[workoutIndex] = WorkoutModel(id: workout.id, userId: workout.userId, title: workout.title, status: workout.status, startedAt: workout.startedAt, endedAt: workout.endedAt, durationMinutes: workout.durationMinutes, exercises: exercises, version: workout.version, deletedAt: workout.deletedAt, deletedByDeviceId: workout.deletedByDeviceId)
                        }
                    }
                    continue
                }
                guard let data = change.data,
                      let value = try? decoder.decode(WorkoutSetModel.self, from: encoder.encode(data)) else { continue }
                for workoutIndex in state.gymWorkouts.indices {
                    let workout = state.gymWorkouts[workoutIndex]
                    guard var exercises = workout.exercises, let exerciseIndex = exercises.firstIndex(where: { $0.id == value.workoutExerciseId }) else { continue }
                    let exercise = exercises[exerciseIndex]
                    var sets = exercise.sets ?? []
                    upsertGymValue(&sets, value)
                    exercises[exerciseIndex] = WorkoutExerciseModel(id: exercise.id, workoutEntryId: exercise.workoutEntryId, exerciseId: exercise.exerciseId, sortOrder: exercise.sortOrder, note: exercise.note, restSeconds: exercise.restSeconds, exercise: exercise.exercise, sets: sets.sorted { $0.sortOrder < $1.sortOrder }, version: exercise.version, deletedAt: exercise.deletedAt)
                    state.gymWorkouts[workoutIndex] = WorkoutModel(id: workout.id, userId: workout.userId, title: workout.title, status: workout.status, startedAt: workout.startedAt, endedAt: workout.endedAt, durationMinutes: workout.durationMinutes, exercises: exercises, version: workout.version, deletedAt: workout.deletedAt, deletedByDeviceId: workout.deletedByDeviceId)
                    break
                }
            }
        }
    }
}
