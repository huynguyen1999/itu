import Foundation

extension OfflineStore {
    func applyHydratedTasks(_ fetched: [ProductivityTask]) throws {
        let optimistic = Dictionary(uniqueKeysWithValues: state.tasks.map { ($0.id, $0) })
        let fetchedIDs = Set(fetched.map(\.id))
        let pending = Set(state.mutations.filter { $0.kind == "task.create" || $0.kind == "task.update" }.map(\.entityId))
        state.tasks = fetched + state.tasks.filter { !fetchedIDs.contains($0.id) && pending.contains($0.id) }
        try reapplyPendingTaskMutations(optimisticTasksByID: optimistic)
    }

    func applyHydratedLists(_ fetched: [TaskListModel]) throws {
        let optimistic = Dictionary(uniqueKeysWithValues: state.taskLists.map { ($0.id, $0) })
        state.taskLists = fetched
        try reapplyPendingTaskListMutations(optimisticByID: optimistic)
    }
}
