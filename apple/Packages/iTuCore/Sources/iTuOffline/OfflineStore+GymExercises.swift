import Foundation
import iTuDomain
public extension OfflineStore {
    @discardableResult
    func saveExercise(_ value: ExerciseModel, mutation: SyncMutation) throws -> OfflineSnapshot {
        upsertGymValue(&state.gymExercises, value)
        appendMutation(mutation)
        try persist()
        return state
    }

    @discardableResult
    func replaceGymExercises(_ values: [ExerciseModel]) throws -> OfflineSnapshot {
        let optimistic = Dictionary(uniqueKeysWithValues: state.gymExercises.map { ($0.id, $0) })
        let pendingIDs = Set(state.mutations.filter { $0.kind == "exercisedefinition.create" || $0.kind == "exercisedefinition.delete" || $0.kind == "exercisedefinition.restore" || $0.kind == "exercisedefinition.update" }.map(\.entityId))
        let fetchedIDs = Set(values.map(\.id))
        state.gymExercises = values + state.gymExercises.filter { pendingIDs.contains($0.id) && !fetchedIDs.contains($0.id) }
        reapplyPendingGymExerciseMutations(optimisticByID: optimistic)
        try persist()
        return state
    }

    @discardableResult
    func permanentlyRemoveGymExercise(id: String) throws -> OfflineSnapshot {
        state.gymExercises.removeAll { $0.id == id }
        state.mutations.removeAll { $0.entityId == id && ($0.kind == "exercisedefinition.delete" || $0.kind == "exercisedefinition.restore") }
        try persist()
        return state
    }
}
