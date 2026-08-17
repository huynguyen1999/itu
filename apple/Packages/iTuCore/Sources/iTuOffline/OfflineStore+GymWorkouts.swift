import Foundation
import iTuDomain
public extension OfflineStore {
    @discardableResult
    func saveWorkout(_ value: WorkoutModel, mutation: SyncMutation? = nil) throws -> OfflineSnapshot {
        upsertGymValue(&state.gymWorkouts, value)
        if let mutation {
            appendMutation(mutation)
        }
        try persist()
        return state
    }

    @discardableResult
    func replaceGymWorkouts(_ values: [WorkoutModel]) throws -> OfflineSnapshot {
        let optimistic = Dictionary(uniqueKeysWithValues: state.gymWorkouts.map { ($0.id, $0) })
        let pendingIDs = Set(state.mutations.filter {
            $0.kind == "workout.create" || $0.kind == "workout.update" || $0.kind == "workout.finish"
                || $0.kind == "gymworkout.create" || $0.kind == "gymworkout.update"
                || $0.kind == "gymworkout.delete" || $0.kind == "gymworkout.restore"
        }.map(\.entityId))
        let pendingWorkoutIDs = pendingIDs.union(pendingGranularGymWorkoutIDs(optimisticByID: optimistic))
        let fetchedIDs = Set(values.map(\.id))
        state.gymWorkouts = values + state.gymWorkouts.filter { pendingWorkoutIDs.contains($0.id) && !fetchedIDs.contains($0.id) }
        reapplyPendingGymWorkoutMutations(optimisticByID: optimistic)
        reapplyPendingGranularGymMutations(optimisticByID: optimistic)
        try persist()
        return state
    }

    @discardableResult
    func permanentlyRemoveGymWorkout(id: String) throws -> OfflineSnapshot {
        state.gymWorkouts.removeAll { $0.id == id }
        state.mutations.removeAll { $0.entityId == id && ($0.kind == "gymworkout.delete" || $0.kind == "gymworkout.restore") }
        try persist()
        return state
    }
}
