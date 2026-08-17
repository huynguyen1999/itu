import Foundation
import iTuDomain
public extension OfflineStore {
    /// Granular Gym writes keep the parent aggregate optimistic while the
    /// outbox carries a stable child mutation. This is deliberately one actor
    /// transaction so a restart cannot expose a set without its queued change.
    @discardableResult
    func saveWorkoutExercise(_ value: WorkoutExerciseModel, workoutID: String, mutation: SyncMutation) throws -> OfflineSnapshot {
        guard let index = state.gymWorkouts.firstIndex(where: { $0.id == workoutID }) else { throw NSError(domain: "OfflineStore", code: 404) }
        let workout = state.gymWorkouts[index]
        var exercises = workout.exercises ?? []
        upsertGymValue(&exercises, value)
        state.gymWorkouts[index] = WorkoutModel(id: workout.id, userId: workout.userId, title: workout.title, status: workout.status, startedAt: workout.startedAt, endedAt: workout.endedAt, durationMinutes: workout.durationMinutes, exercises: exercises.sorted { $0.sortOrder < $1.sortOrder }, version: workout.version, deletedAt: workout.deletedAt, deletedByDeviceId: workout.deletedByDeviceId)
        appendMutation(mutation)
        try persist()
        return state
    }

    @discardableResult
    func saveWorkoutSet(_ value: WorkoutSetModel, workoutID: String, mutation: SyncMutation) throws -> OfflineSnapshot {
        guard let workoutIndex = state.gymWorkouts.firstIndex(where: { $0.id == workoutID }) else { throw NSError(domain: "OfflineStore", code: 404) }
        let workout = state.gymWorkouts[workoutIndex]
        var exercises = workout.exercises ?? []
        guard let exerciseIndex = exercises.firstIndex(where: { $0.id == value.workoutExerciseId }) else { throw NSError(domain: "OfflineStore", code: 404) }
        let exercise = exercises[exerciseIndex]
        var sets = exercise.sets ?? []
        upsertGymValue(&sets, value)
        exercises[exerciseIndex] = WorkoutExerciseModel(id: exercise.id, workoutEntryId: exercise.workoutEntryId, exerciseId: exercise.exerciseId, sortOrder: exercise.sortOrder, note: exercise.note, restSeconds: exercise.restSeconds, exercise: exercise.exercise, sets: sets.sorted { $0.sortOrder < $1.sortOrder }, version: exercise.version, deletedAt: exercise.deletedAt)
        state.gymWorkouts[workoutIndex] = WorkoutModel(id: workout.id, userId: workout.userId, title: workout.title, status: workout.status, startedAt: workout.startedAt, endedAt: workout.endedAt, durationMinutes: workout.durationMinutes, exercises: exercises, version: workout.version, deletedAt: workout.deletedAt, deletedByDeviceId: workout.deletedByDeviceId)
        appendMutation(mutation)
        try persist()
        return state
    }

    @discardableResult
    func removeWorkoutExercise(id: String, workoutID: String, mutation: SyncMutation) throws -> OfflineSnapshot {
        guard let index = state.gymWorkouts.firstIndex(where: { $0.id == workoutID }) else { throw NSError(domain: "OfflineStore", code: 404) }
        let workout = state.gymWorkouts[index]
        let exercises = (workout.exercises ?? []).filter { $0.id != id }
        state.gymWorkouts[index] = WorkoutModel(id: workout.id, userId: workout.userId, title: workout.title, status: workout.status, startedAt: workout.startedAt, endedAt: workout.endedAt, durationMinutes: workout.durationMinutes, exercises: exercises, version: workout.version, deletedAt: workout.deletedAt, deletedByDeviceId: workout.deletedByDeviceId)
        appendMutation(mutation)
        try persist()
        return state
    }

    @discardableResult
    func removeWorkoutSet(id: String, workoutID: String, workoutExerciseID: String, mutation: SyncMutation) throws -> OfflineSnapshot {
        guard let workoutIndex = state.gymWorkouts.firstIndex(where: { $0.id == workoutID }) else { throw NSError(domain: "OfflineStore", code: 404) }
        let workout = state.gymWorkouts[workoutIndex]
        var exercises = workout.exercises ?? []
        guard let exerciseIndex = exercises.firstIndex(where: { $0.id == workoutExerciseID }) else { throw NSError(domain: "OfflineStore", code: 404) }
        let exercise = exercises[exerciseIndex]
        exercises[exerciseIndex] = WorkoutExerciseModel(id: exercise.id, workoutEntryId: exercise.workoutEntryId, exerciseId: exercise.exerciseId, sortOrder: exercise.sortOrder, note: exercise.note, restSeconds: exercise.restSeconds, exercise: exercise.exercise, sets: (exercise.sets ?? []).filter { $0.id != id }, version: exercise.version, deletedAt: exercise.deletedAt)
        state.gymWorkouts[workoutIndex] = WorkoutModel(id: workout.id, userId: workout.userId, title: workout.title, status: workout.status, startedAt: workout.startedAt, endedAt: workout.endedAt, durationMinutes: workout.durationMinutes, exercises: exercises, version: workout.version, deletedAt: workout.deletedAt, deletedByDeviceId: workout.deletedByDeviceId)
        appendMutation(mutation)
        try persist()
        return state
    }
}
