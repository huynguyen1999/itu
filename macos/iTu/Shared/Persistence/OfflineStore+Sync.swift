import Foundation

extension OfflineStore {
    @discardableResult
    func recordMutationFailures(
        _ mutationIDs: [String],
        code: String,
        retryAfter: TimeInterval? = nil,
        retryable: Bool = true
    ) throws -> OfflineSnapshot {
        let ids = Set(mutationIDs)
        guard !ids.isEmpty else { return state }
        let now = ISO8601DateFormatter().string(from: Date())
        for index in state.mutations.indices where ids.contains(state.mutations[index].id) {
            state.mutations[index].attemptCount = (state.mutations[index].attemptCount ?? 0) + 1
            state.mutations[index].lastAttemptAt = now
            state.mutations[index].lastErrorCode = code
            let attempt = state.mutations[index].attemptCount ?? 1
            guard retryable else {
                state.mutations[index].nextRetryAt = nil
                continue
            }
            let baseDelay = min(30, pow(2, Double(max(0, attempt - 1))))
            let delay = retryAfter ?? baseDelay * Double.random(in: 0.5...1.5)
            state.mutations[index].nextRetryAt = ISO8601DateFormatter().string(from: Date().addingTimeInterval(delay))
        }
        try persist()
        return state
    }

    @discardableResult
    func enqueue(_ mutation: SyncMutation) throws -> OfflineSnapshot {
        appendMutation(mutation)
        try persist()
        return state
    }

    @discardableResult
    func applySync(_ response: SyncResponse) throws -> OfflineSnapshot {
        try applySync(
            acknowledgedMutationIds: response.acknowledgedMutationIds,
            conflicts: response.conflicts,
            changes: response.changes,
            cursor: response.cursor,
            lastSyncTime: response.lastSyncTime
        )
    }

    @discardableResult
    func applySync(
        acknowledgedMutationIds: [String],
        conflicts: [SyncConflict],
        changes: [SyncChange],
        cursor: String,
        lastSyncTime: String? = nil
    ) throws -> OfflineSnapshot {
        let localCursor = state.cursor
        let incomingCursorIsNewer = Self.isCursorNewer(cursor, than: localCursor)
        let applicableChanges = changes.filter { change in
            guard let changeCursor = change.cursor else { return incomingCursorIsNewer }
            return Self.isCursorNewer(String(changeCursor), than: localCursor)
        }
        let orderedChanges = applicableChanges.sorted { left, right in
            switch (left.cursor, right.cursor) {
            case let (left?, right?): return left < right
            case (nil, nil): return false
            case (nil, _): return true
            case (_, nil): return false
            }
        }
        let optimisticTasksByID = Dictionary(uniqueKeysWithValues: state.tasks.map { ($0.id, $0) })
        let optimisticFocusByID = Dictionary(uniqueKeysWithValues: state.focusSessions.map { ($0.id, $0) })
        let optimisticOccurrencesByID = Dictionary(uniqueKeysWithValues: state.habitOccurrences.map { ($0.id, $0) })
        let optimisticSkillsByID = Dictionary(uniqueKeysWithValues: state.skills.map { ($0.id, $0) })
        let optimisticCardsByID = Dictionary(
            uniqueKeysWithValues: state.cardsByDeckId.values.flatMap { $0 }.map { ($0.id, $0) }
        )
        let optimisticTaskListsByID = Dictionary(uniqueKeysWithValues: state.taskLists.map { ($0.id, $0) })
        let optimisticMappingsBySkillID = state.growthAttributeMappings
        let acknowledged = Set(acknowledgedMutationIds)
        state.mutations.removeAll { acknowledged.contains($0.id) }
        state.conflicts.removeAll { acknowledged.contains($0.mutationId) }
        var rebasedConflictIDs = Set<String>()
        for conflict in conflicts where Self.isStatusOnlyTaskConflict(conflict) {
            guard let mutation = state.mutations.first(where: { $0.id == conflict.mutationId }) else { continue }
            guard mutation.kind == "task.update" else { continue }
            let serverVersion: Int? = {
                guard case let .object(fields) = conflict.serverData ?? .null,
                      case let .number(value) = fields["version"] else { return nil }
                return Int(value)
            }()
            let baseValues: [String: JSONValue]? = {
                guard case let .object(fields) = conflict.serverData ?? .null else { return nil }
                let values = (conflict.conflictingFields ?? []).reduce(into: [String: JSONValue]()) { result, key in
                    if let value = fields[key] { result[key] = value }
                }
                return values.isEmpty ? nil : values
            }()
            state.mutations.removeAll { $0.id == mutation.id }
            appendMutation(SyncMutation(
                id: ULID.generate(),
                kind: mutation.kind,
                entityId: mutation.entityId,
                baseVersion: serverVersion,
                baseValues: baseValues,
                payload: conflict.localDraft,
                occurredAt: ISO8601DateFormatter().string(from: Date())
            ))
            rebasedConflictIDs.insert(conflict.mutationId)
        }
        state.conflicts.append(contentsOf: conflicts.filter { conflict in
            guard !rebasedConflictIDs.contains(conflict.mutationId) else { return false }
            return !state.conflicts.contains(where: { $0.mutationId == conflict.mutationId })
        })
        let conflictNow = ISO8601DateFormatter().string(from: Date())
        for conflict in conflicts {
            if rebasedConflictIDs.contains(conflict.mutationId) { continue }
            guard let index = state.mutations.firstIndex(where: { $0.id == conflict.mutationId }) else { continue }
            state.mutations[index].attemptCount = (state.mutations[index].attemptCount ?? 0) + 1
            state.mutations[index].lastAttemptAt = conflictNow
            state.mutations[index].lastErrorCode = conflict.reason
            state.mutations[index].nextRetryAt = nil
        }

        for change in orderedChanges where change.entityType == "task" {
            if change.deleted {
                state.tasks.removeAll { $0.id == change.entityId }
                continue
            }
            guard let resource = change.data else { continue }
            let data = try encoder.encode(resource)
            let task = try decoder.decode(ProductivityTask.self, from: data)
            if let index = state.tasks.firstIndex(where: { $0.id == task.id }) {
                state.tasks[index] = task
            } else {
                state.tasks.append(task)
            }
        }
        for change in orderedChanges where change.entityType == "tasklist" {
            if change.deleted {
                state.taskLists.removeAll { $0.id == change.entityId }
                continue
            }
            guard let resource = change.data,
                  let data = try? encoder.encode(resource),
                  let list = try? decoder.decode(TaskListModel.self, from: data) else { continue }
            if let index = state.taskLists.firstIndex(where: { $0.id == list.id }) {
                state.taskLists[index] = list
            } else {
                state.taskLists.append(list)
            }
        }
        for change in orderedChanges where change.entityType == "focussession" {
            if change.deleted {
                state.focusSessions.removeAll { $0.id == change.entityId }
                continue
            }
            guard let resource = change.data else { continue }
            let data = try encoder.encode(resource)
            let incoming = try decoder.decode(FocusSession.self, from: data)
            if let local = optimisticFocusByID[incoming.id], local.version >= incoming.version {
                upsertFocusSession(local)
            } else {
                upsertFocusSession(incoming)
            }
        }
        for change in orderedChanges where change.entityType == "habit" {
            if change.deleted {
                state.habits.removeAll { $0.id == change.entityId }
                continue
            }
            guard let resource = change.data else { continue }
            if let data = try? encoder.encode(resource),
               let habit = try? decoder.decode(HabitModel.self, from: data) {
                if let index = state.habits.firstIndex(where: { $0.id == habit.id }) {
                    state.habits[index] = habit
                } else {
                    state.habits.append(habit)
                }
            }
        }
        for change in orderedChanges where change.entityType == "habitoccurrence" {
            if change.deleted {
                state.habitOccurrences.removeAll { $0.id == change.entityId }
                continue
            }
            guard let resource = change.data else { continue }
            if let data = try? encoder.encode(resource),
               let occurrence = try? decoder.decode(HabitOccurrenceModel.self, from: data) {
                if let index = state.habitOccurrences.firstIndex(where: { $0.id == occurrence.id }) {
                    state.habitOccurrences[index] = occurrence
                } else {
                    state.habitOccurrences.append(occurrence)
                }
            }
        }
        for change in orderedChanges where change.entityType == "deck" {
            if change.deleted {
                state.decks.removeAll { $0.id == change.entityId }
                continue
            }
            guard let resource = change.data else { continue }
            if let data = try? encoder.encode(resource),
               let deck = try? decoder.decode(DeckModel.self, from: data) {
                if let index = state.decks.firstIndex(where: { $0.id == deck.id }) {
                    state.decks[index] = deck
                } else {
                    state.decks.append(deck)
                }
            }
        }
        for change in orderedChanges where change.entityType == "card" {
            if change.deleted {
                for deckID in state.cardsByDeckId.keys {
                    state.cardsByDeckId[deckID]?.removeAll { $0.id == change.entityId }
                }
                continue
            }
            guard let resource = change.data,
                  let data = try? encoder.encode(resource),
                  let card = try? decoder.decode(CardModel.self, from: data) else { continue }
            var cards = state.cardsByDeckId[card.deckId] ?? []
            if let index = cards.firstIndex(where: { $0.id == card.id }) {
                cards[index] = card
            } else {
                cards.append(card)
            }
            state.cardsByDeckId[card.deckId] = cards
            updateDeckCardCount(deckId: card.deckId, cards: cards)
        }
        for change in orderedChanges where change.entityType == "growthskill" {
            if change.deleted {
                state.skills.removeAll { $0.id == change.entityId }
                continue
            }
            guard let resource = change.data else { continue }
            if let data = try? encoder.encode(resource),
               let dto = try? decoder.decode(GrowthSkillDTO.self, from: data) {
                let skill = Self.skillNode(dto)
                if let index = state.skills.firstIndex(where: { $0.id == skill.id }) {
                    state.skills[index] = skill
                } else {
                    state.skills.append(skill)
                }
            }
        }
        for change in orderedChanges where change.entityType == "growthprofile" {
            if change.deleted {
                state.growthProfile = nil
                continue
            }
            guard let resource = change.data,
                  let data = try? encoder.encode(resource),
                  let profile = try? decoder.decode(GrowthProfileDTO.self, from: data) else { continue }
            state.growthProfile = profile
        }
        for change in orderedChanges where change.entityType == "growthattributemapping" {
            if change.deleted {
                state.growthAttributeMappings.removeValue(forKey: change.entityId)
                continue
            }
            guard let mappings = Self.decodeGrowthAttributeMappings(change.data) else { continue }
            state.growthAttributeMappings[change.entityId] = mappings
        }
        try applyBudgetGymChanges(orderedChanges)
        try applyJournalChanges(orderedChanges)
        try applyCalendarChanges(orderedChanges)
        reapplyPendingJournalMutations()
        try reapplyPendingTaskMutations(optimisticTasksByID: optimisticTasksByID)
        try reapplyPendingTaskListMutations(optimisticByID: optimisticTaskListsByID)
        for mutation in state.mutations where mutation.kind.hasPrefix("focussession.") {
            if let optimistic = optimisticFocusByID[mutation.entityId] {
                upsertFocusSession(optimistic)
            }
        }
        for mutation in state.mutations where mutation.kind.hasPrefix("habitoccurrence.") {
            if let optimistic = optimisticOccurrencesByID[mutation.entityId],
               let index = state.habitOccurrences.firstIndex(where: { $0.id == optimistic.id }) {
                state.habitOccurrences[index] = optimistic
            }
        }
        for mutation in state.mutations where mutation.kind.hasPrefix("growthskill.") {
            if let optimistic = optimisticSkillsByID[mutation.entityId],
               let index = state.skills.firstIndex(where: { $0.id == optimistic.id }) {
                state.skills[index] = optimistic
            }
        }
        for mutation in state.mutations where mutation.kind == "growthprofile.update" {
            if let accountBaseXp = mutation.payload["accountBaseXp"]?.numberValue {
                state.growthProfile?.accountBaseXp = Int(accountBaseXp)
            }
            if let rewardPreset = mutation.payload["rewardPreset"]?.stringValue,
               let preset = GrowthRewardPreset(rawValue: rewardPreset) {
                state.growthProfile?.rewardPreset = preset
            }
        }
        for mutation in state.mutations where mutation.kind == "growthattributemapping.upsert" {
            guard let mappings = Self.growthAttributeMappings(from: mutation) else { continue }
            state.growthAttributeMappings[mutation.entityId] = mappings
        }
        // A grouped mapping change is the server snapshot for one skill. Pending
        // mutations always win until acknowledged, preserving offline edits.
        for skillID in Set(optimisticMappingsBySkillID.keys).union(state.growthAttributeMappings.keys) {
            guard state.mutations.contains(where: { $0.kind == "growthattributemapping.upsert" && $0.entityId == skillID }),
                  let optimistic = optimisticMappingsBySkillID[skillID] else { continue }
            state.growthAttributeMappings[skillID] = optimistic
        }
        reapplyPendingGrowthRewardPresetMutations()
        let cardDeckIDs = Set(state.cardsByDeckId.keys).union(
            state.mutations.compactMap { mutation in
                guard mutation.kind.hasPrefix("card."),
                      case let .string(deckID)? = mutation.payload["deckId"] else { return nil }
                return deckID
            }
        )
        for deckID in cardDeckIDs {
            try reapplyPendingCardMutations(deckId: deckID, optimisticCardsByID: optimisticCardsByID)
        }
        if incomingCursorIsNewer {
            state.cursor = cursor
            state.lastSyncTime = lastSyncTime
        } else if cursor == localCursor, let lastSyncTime {
            state.lastSyncTime = lastSyncTime
        }
        try persist()
        return state
    }

    /// Compares protocol cursors without changing their wire or storage form.
    /// Numeric cursors use numeric ordering; legacy opaque cursors retain their
    /// existing lexical ordering.
    internal static func isCursorNewer(_ incoming: String, than local: String) -> Bool {
        if let incomingNumber = UInt64(incoming), let localNumber = UInt64(local) {
            return incomingNumber > localNumber
        }
        return incoming != local && incoming > local
    }

    private static func isStatusOnlyTaskConflict(_ conflict: SyncConflict) -> Bool {
        guard conflict.entityType == "task",
              let fields = conflict.conflictingFields,
              !fields.isEmpty else { return false }
        if let kind = conflict.kind, kind != "task.update" { return false }
        return Set(fields).isSubset(of: ["status", "completedAt"])
    }

    internal func reapplyPendingTaskListMutations(optimisticByID: [String: TaskListModel]) throws {
        for mutation in state.mutations where mutation.kind.hasPrefix("tasklist.") {
            if mutation.kind == "tasklist.delete" {
                state.taskLists.removeAll { $0.id == mutation.entityId }
                continue
            }
            guard var list = optimisticByID[mutation.entityId] else { continue }
            if mutation.kind == "tasklist.create" {
                list.name = mutation.payload["title"]?.stringValue ?? list.name
                list.description = mutation.payload["description"]?.stringValue
                list.color = mutation.payload["color"]?.stringValue ?? list.color
                if !state.taskLists.contains(where: { $0.id == list.id }) {
                    state.taskLists.append(list)
                }
                continue
            }
            if mutation.kind == "tasklist.update" {
                list.name = mutation.payload["title"]?.stringValue ?? list.name
                list.description = mutation.payload["description"]?.stringValue
                list.color = mutation.payload["color"]?.stringValue ?? list.color
                list.version = max(list.version, (mutation.baseVersion ?? list.version) + 1)
                if let index = state.taskLists.firstIndex(where: { $0.id == list.id }) {
                    state.taskLists[index] = list
                } else {
                    state.taskLists.append(list)
                }
            }
        }
    }

    internal func reapplyPendingTaskMutations(
        optimisticTasksByID: [String: ProductivityTask]
    ) throws {
        for mutation in state.mutations where mutation.kind.hasPrefix("task.") {
            switch mutation.kind {
            case "task.create":
                guard !state.tasks.contains(where: { $0.id == mutation.entityId }),
                      let optimisticTask = optimisticTasksByID[mutation.entityId] else {
                    continue
                }
                state.tasks.append(optimisticTask)
            case "task.update":
                guard let index = state.tasks.firstIndex(where: { $0.id == mutation.entityId }) else {
                    continue
                }
                let serverVersion = state.tasks[index].version
                let encoded = try encoder.encode(state.tasks[index])
                let value = try decoder.decode(JSONValue.self, from: encoded)
                guard case var .object(fields) = value else { continue }
                fields.merge(mutation.payload) { _, pending in pending }
                let mergedData = try encoder.encode(JSONValue.object(fields))
                var mergedTask = try decoder.decode(ProductivityTask.self, from: mergedData)
                mergedTask.version = max(
                    serverVersion,
                    optimisticTasksByID[mutation.entityId]?.version ?? serverVersion
                )
                state.tasks[index] = mergedTask
                if case let .array(tagValues)? = mutation.payload["tagIds"] {
                    state.tagIdsByTaskID[mutation.entityId] = tagValues.compactMap(\.stringValue)
                }
            case "task.delete":
                state.tasks.removeAll { $0.id == mutation.entityId }
                state.tagIdsByTaskID.removeValue(forKey: mutation.entityId)
            default:
                continue
            }
        }
    }

    @discardableResult
    func discardConflict(_ mutationId: String) throws -> OfflineSnapshot {
        state.conflicts.removeAll { $0.mutationId == mutationId }
        state.mutations.removeAll { $0.id == mutationId }
        try persist()
        return state
    }

    @discardableResult
    func retryMutation(_ mutationId: String, keepLocal: Bool = false) throws -> OfflineSnapshot {
        guard let mutation = state.mutations.first(where: { $0.id == mutationId }) else { return state }
        let replacement = SyncMutation(
            id: keepLocal ? ULID.generate() : mutation.id,
            kind: mutation.kind,
            entityId: mutation.entityId,
            baseVersion: keepLocal ? nil : mutation.baseVersion,
            baseValues: keepLocal ? nil : mutation.baseValues,
            payload: mutation.payload,
            occurredAt: ISO8601DateFormatter().string(from: Date())
        )
        state.mutations.removeAll { $0.id == mutationId }
        appendMutation(replacement)
        try persist()
        return state
    }

    @discardableResult
    func discardMutation(_ mutationId: String) throws -> OfflineSnapshot {
        state.mutations.removeAll { $0.id == mutationId }
        state.conflicts.removeAll { $0.mutationId == mutationId }
        try persist()
        return state
    }

    @discardableResult
    func discardFailedMutations() throws -> OfflineSnapshot {
        let failedIDs = Set(state.mutations.filter { $0.attemptCount != nil || $0.lastErrorCode != nil }.map(\.id))
        state.mutations.removeAll { failedIDs.contains($0.id) }
        state.conflicts.removeAll { failedIDs.contains($0.mutationId) }
        try persist()
        return state
    }

    @discardableResult
    func keepConflict(_ conflict: SyncConflict) throws -> OfflineSnapshot {
        let serverFields: [String: JSONValue]
        let serverVersion: Int?
        if case let .object(fields) = conflict.serverData ?? .null {
            serverFields = fields
            if case let .number(value) = fields["version"] {
                serverVersion = Int(value)
            } else {
                serverVersion = nil
            }
        } else {
            serverFields = [:]
            serverVersion = nil
        }

        let baseValues = conflict.conflictingFields?.reduce(into: [String: JSONValue]()) { values, field in
            if let value = serverFields[field] {
                values[field] = value
            }
        }
        let kind = conflict.kind ?? "(conflict.entityType).update"
        let now = ISO8601DateFormatter().string(from: Date())

        state.conflicts.removeAll { $0.mutationId == conflict.mutationId }
        state.mutations.removeAll { $0.id == conflict.mutationId }
        appendMutation(
            SyncMutation(
                id: ULID.generate(),
                kind: kind,
                entityId: conflict.entityId,
                baseVersion: serverVersion,
                baseValues: baseValues?.isEmpty == false ? baseValues : nil,
                payload: conflict.localDraft,
                occurredAt: now
            )
        )
        try persist()
        return state
    }


}
