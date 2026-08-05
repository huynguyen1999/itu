import Foundation

extension OfflineStore {
    @discardableResult
    func saveFocusSession(_ session: FocusSession, mutation: SyncMutation) throws -> OfflineSnapshot {
        upsertFocusSession(session)
        appendMutation(mutation)
        try persist()
        return state
    }

    @discardableResult
    func hydrateFocus(active: FocusSession?, history: [FocusSession]) throws -> OfflineSnapshot {
        let pendingEntityIDs = Set(
            state.mutations
                .filter { $0.kind.hasPrefix("focussession.") }
                .map(\.entityId)
        )
        let localByID = Dictionary(uniqueKeysWithValues: state.focusSessions.map { ($0.id, $0) })
        var fetchedByID = Dictionary(uniqueKeysWithValues: history.map { ($0.id, $0) })
        if let active {
            if fetchedByID[active.id]?.version ?? -1 <= active.version {
                fetchedByID[active.id] = active
            }
        }

        // Focus endpoints can briefly lag the push/pull response. Keep the
        // newer local version (and any pending mutation) instead of flashing
        // back to stale active/paused state.
        for (id, local) in localByID {
            guard pendingEntityIDs.contains(id) || local.status == .active || local.status == .paused else {
                continue
            }
            if let fetched = fetchedByID[id], local.version >= fetched.version {
                fetchedByID[id] = local
            } else if fetchedByID[id] == nil {
                fetchedByID[id] = local
            }
        }
        state.focusSessions = history.compactMap { fetchedByID[$0.id] }
        for session in fetchedByID.values where !state.focusSessions.contains(where: { $0.id == session.id }) {
            state.focusSessions.append(session)
        }
        try persist()
        return state
    }


}
