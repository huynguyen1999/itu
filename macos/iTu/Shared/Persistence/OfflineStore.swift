import Foundation

actor OfflineStore {
    let fileURL: URL
    var state: OfflineSnapshot
    let encoder: JSONEncoder
    let decoder: JSONDecoder
    private var lastPersistedMutationIDs: Set<String> = []
    internal var suppressPersistence = false
    private var outboxChanged = false
    private var outboxObservers: [UUID: AsyncStream<OutboxEvent>.Continuation] = [:]

    init(accountID: String = "anonymous", baseURL: URL? = nil) {
        let root = baseURL ?? FileManager.default
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("iTu", isDirectory: true)
        let safeAccountID = accountID.replacingOccurrences(
            of: "[^A-Za-z0-9_-]",
            with: "_",
            options: .regularExpression
        )
        fileURL = root.appendingPathComponent("offline-\(safeAccountID)-v1.json")
        encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        decoder = JSONDecoder()
        state = OfflineSnapshot()
    }

    func load() throws -> OfflineSnapshot {
        let directory = fileURL.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            try persist()
            return state
        }
        let data = try Data(contentsOf: fileURL)
        // An unreadable snapshot is a recoverable load failure, not an empty
        // account. Keep both the in-memory state and the original bytes intact
        // so callers can surface the error or retry after a migration.
        state = try decoder.decode(OfflineSnapshot.self, from: data)
        
        // Migrate legacy "habit.checkin" mutations to "habitoccurrence.*"
        var migrated = false
        for i in 0..<state.mutations.count {
            let mutation = state.mutations[i]
            if mutation.kind == "habit.checkin" {
                let habitId = mutation.entityId
                let isCompleted = mutation.payload["isCompletedToday"]?.boolValue ?? false
                let occurredAt = mutation.payload["occurredAt"]?.stringValue ?? mutation.occurredAt
                let dateStr = String(occurredAt.prefix(10))
                
                let occurrenceId: String
                if let existing = state.habitOccurrences.first(where: { $0.habitId == habitId && $0.localDayString == dateStr }) {
                    occurrenceId = existing.id
                } else {
                    let newId = ULID.generate()
                    let occurrenceDateISO = "\(dateStr)T00:00:00.000Z"
                    let newOccurrence = HabitOccurrenceModel(
                        id: newId,
                        habitId: habitId,
                        occurrenceDate: occurrenceDateISO,
                        status: isCompleted ? .completed : .pending,
                        value: isCompleted ? 1.0 : 0.0
                    )
                    state.habitOccurrences.append(newOccurrence)
                    occurrenceId = newId
                }
                
                if isCompleted {
                    state.mutations[i] = SyncMutation(
                        id: mutation.id,
                        kind: "habitoccurrence.checkin",
                        entityId: occurrenceId,
                        baseVersion: nil,
                        payload: [
                            "value": .number(1.0),
                            "idempotencyKey": .string(ULID.generate()),
                            "occurredAt": .string(occurredAt)
                        ],
                        occurredAt: occurredAt
                    )
                } else {
                    state.mutations[i] = SyncMutation(
                        id: mutation.id,
                        kind: "habitoccurrence.action",
                        entityId: occurrenceId,
                        baseVersion: nil,
                        payload: [
                            "action": .string("undo"),
                            "idempotencyKey": .string(ULID.generate())
                        ],
                        occurredAt: occurredAt
                    )
                }
                migrated = true
            }
        }
        if migrated {
            try persist()
        }
        
        lastPersistedMutationIDs = Set(state.mutations.map(\.id))
        return state
    }

    func snapshot() -> OfflineSnapshot {
        state
    }

    func outboxEvents() -> AsyncStream<OutboxEvent> {
        let id = UUID()
        return AsyncStream { continuation in
            outboxObservers[id] = continuation
            continuation.onTermination = { _ in
                Task { await self.removeOutboxObserver(id) }
            }
        }
    }

    private func removeOutboxObserver(_ id: UUID) {
        outboxObservers.removeValue(forKey: id)
    }

    func persist() throws {
        guard !suppressPersistence else { return }
        let data = try encoder.encode(state)
        try data.write(to: fileURL, options: .atomic)
        if outboxChanged {
            let urgent = state.mutations.last.map(Self.isUrgent) ?? false
            outboxObservers.values.forEach { $0.yield(.enqueued(urgent: urgent)) }
            outboxChanged = false
        }
        lastPersistedMutationIDs = Set(state.mutations.map(\.id))
    }

    func upsertFocusSession(_ session: FocusSession) {
        if let index = state.focusSessions.firstIndex(where: { $0.id == session.id }) {
            state.focusSessions[index] = session
        } else {
            state.focusSessions.append(session)
        }
    }

    func addChange(
        _ key: String,
        old: JSONValue,
        new: JSONValue,
        payload: inout [String: JSONValue],
        baseValues: inout [String: JSONValue]
    ) {
        guard old != new else { return }
        payload[key] = new
        baseValues[key] = old
    }

    /// Appends one outbox entry while compacting consecutive compatible updates.
    /// Callers mutate the snapshot and persist once, so the optimistic entity and
    /// outbox entry become durable together inside this actor.
    func appendMutation(_ mutation: SyncMutation) {
        outboxChanged = true
        guard mutation.kind.hasSuffix(".update") else {
            state.mutations.append(mutation)
            return
        }
        guard let index = state.mutations.indices.last,
              state.mutations[index].kind == mutation.kind,
              state.mutations[index].entityId == mutation.entityId,
              state.mutations[index].attemptCount == nil,
              state.mutations[index].lastErrorCode == nil else {
            state.mutations.append(mutation)
            return
        }
        let previous = state.mutations[index]
        state.mutations[index].payload.merge(mutation.payload) { _, latest in latest }
        if previous.baseValues == nil {
            state.mutations[index].baseValues = mutation.baseValues
        } else if let latestBaseValues = mutation.baseValues {
            state.mutations[index].baseValues = previous.baseValues!.merging(latestBaseValues) { original, _ in original }
        }
        if previous.fieldEditedAt == nil {
            state.mutations[index].fieldEditedAt = mutation.fieldEditedAt
        } else if let latestFieldEditedAt = mutation.fieldEditedAt {
            state.mutations[index].fieldEditedAt = previous.fieldEditedAt!.merging(latestFieldEditedAt) { _, latest in latest }
        }
        state.mutations[index].occurredAt = mutation.occurredAt
    }

    private static func isUrgent(_ mutation: SyncMutation) -> Bool {
        if mutation.kind.hasSuffix(".delete") { return true }
        if mutation.kind == "task.update", mutation.payload["status"] != nil { return true }
        return mutation.kind.hasSuffix(".action") || mutation.kind.hasSuffix(".checkin")
    }
}
