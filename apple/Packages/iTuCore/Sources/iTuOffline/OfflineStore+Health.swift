import Foundation
import iTuDomain

private enum HealthMutationKind {
    static let summary = "healthsummary.upsert"
    static let workout = "healthworkout.upsert"
    static let workoutDelete = "healthworkout.delete"
}

public extension OfflineStore {
    func healthDailySummaries() -> [HealthDailySummaryModel] { state.healthDailySummaries }

    func healthWorkouts() -> [HealthWorkoutSummaryModel] { state.healthWorkouts }

    func healthImportState() -> HealthImportState { state.healthImportState }

    /// Atomically applies normalized HealthKit data and advances its anchors.
    ///
    /// Daily summaries are absolute values. Only identities present in the
    /// input are replaced, so a partial import cannot erase another date or
    /// device. Workout deletions are scoped by each workout's full identity.
    /// Anchors are changed in the same durable write as the records.
    @discardableResult
    func applyHealthImport(
        dailySummaries: [HealthDailySummaryModel] = [],
        workouts: [HealthWorkoutSummaryModel] = [],
        deletedWorkouts: [HealthWorkoutSummaryModel] = [],
        importState: HealthImportState? = nil,
        occurredAt: String? = nil
    ) throws -> OfflineSnapshot {
        try healthTransaction {
            let timestamp = occurredAt ?? ISO8601DateFormatter().string(from: Date())
            replaceDailySummaries(dailySummaries, occurredAt: timestamp)
            upsertWorkouts(workouts, occurredAt: timestamp)
            deleteWorkouts(deletedWorkouts, occurredAt: timestamp)
            if let importState { state.healthImportState = importState }
        }
    }

    @discardableResult
    func replaceHealthDailySummaries(
        _ summaries: [HealthDailySummaryModel],
        importState: HealthImportState? = nil,
        occurredAt: String? = nil
    ) throws -> OfflineSnapshot {
        try applyHealthImport(dailySummaries: summaries, importState: importState, occurredAt: occurredAt)
    }

    @discardableResult
    func upsertHealthDailySummary(
        _ summary: HealthDailySummaryModel,
        importState: HealthImportState? = nil,
        occurredAt: String? = nil
    ) throws -> OfflineSnapshot {
        try replaceHealthDailySummaries([summary], importState: importState, occurredAt: occurredAt)
    }

    @discardableResult
    func replaceHealthWorkouts(
        _ workouts: [HealthWorkoutSummaryModel],
        deletedWorkouts: [HealthWorkoutSummaryModel] = [],
        importState: HealthImportState? = nil,
        occurredAt: String? = nil
    ) throws -> OfflineSnapshot {
        try applyHealthImport(
            workouts: workouts,
            deletedWorkouts: deletedWorkouts,
            importState: importState,
            occurredAt: occurredAt
        )
    }

    @discardableResult
    func upsertHealthWorkout(
        _ workout: HealthWorkoutSummaryModel,
        importState: HealthImportState? = nil,
        occurredAt: String? = nil
    ) throws -> OfflineSnapshot {
        try replaceHealthWorkouts([workout], importState: importState, occurredAt: occurredAt)
    }

    @discardableResult
    func deleteHealthWorkouts(
        _ workouts: [HealthWorkoutSummaryModel],
        importState: HealthImportState? = nil,
        occurredAt: String? = nil
    ) throws -> OfflineSnapshot {
        try applyHealthImport(deletedWorkouts: workouts, importState: importState, occurredAt: occurredAt)
    }

    @discardableResult
    func deleteHealthWorkout(
        source: HealthSource = .healthKit,
        deviceId: String,
        healthKitUUID: String,
        importState: HealthImportState? = nil,
        occurredAt: String? = nil
    ) throws -> OfflineSnapshot {
        let tombstone = HealthWorkoutSummaryModel(
            source: source,
            deviceId: deviceId,
            healthKitUUID: healthKitUUID,
            activityType: "",
            startAt: "",
            endAt: "",
            durationSeconds: 0
        )
        return try deleteHealthWorkouts([tombstone], importState: importState, occurredAt: occurredAt)
    }

    private func healthTransaction(_ body: () throws -> Void) throws -> OfflineSnapshot {
        let previousState = state
        do {
            try body()
            try persist()
            return state
        } catch {
            state = previousState
            throw error
        }
    }

    private func replaceDailySummaries(_ summaries: [HealthDailySummaryModel], occurredAt: String) {
        var latestByID: [String: HealthDailySummaryModel] = [:]
        for summary in summaries { latestByID[summary.id] = summary }

        for summary in latestByID.values {
            let existing = state.healthDailySummaries.first(where: { $0.id == summary.id })
            guard existing != summary else { continue }
            state.healthDailySummaries.removeAll { $0.id == summary.id }
            state.healthDailySummaries.append(summary)
            queueHealthUpsert(
                kind: HealthMutationKind.summary,
                entityID: summary.id,
                payload: healthSummaryPayload(summary),
                occurredAt: occurredAt
            )
        }
    }

    private func upsertWorkouts(_ workouts: [HealthWorkoutSummaryModel], occurredAt: String) {
        var latestByID: [String: HealthWorkoutSummaryModel] = [:]
        for workout in workouts { latestByID[workout.id] = workout }

        for workout in latestByID.values {
            let existing = state.healthWorkouts.first(where: { $0.id == workout.id })
            guard existing != workout else { continue }
            state.healthWorkouts.removeAll { $0.id == workout.id }
            state.healthWorkouts.append(workout)
            queueHealthUpsert(
                kind: HealthMutationKind.workout,
                entityID: workout.id,
                payload: healthWorkoutPayload(workout),
                occurredAt: occurredAt
            )
        }
    }

    private func deleteWorkouts(_ workouts: [HealthWorkoutSummaryModel], occurredAt: String) {
        var deletedIDs = Set<String>()
        for workout in workouts {
            guard deletedIDs.insert(workout.id).inserted else { continue }
            state.healthWorkouts.removeAll { $0.id == workout.id }
            removePendingHealthUpsert(for: workout.id)
            queueHealthDelete(workout, occurredAt: occurredAt)
        }
    }

    private func queueHealthUpsert(
        kind: String,
        entityID: String,
        payload: [String: JSONValue],
        occurredAt: String
    ) {
        let existingIndex = state.mutations.lastIndex { mutation in
            mutation.kind == kind && mutation.entityId == entityID &&
                mutation.attemptCount == nil && mutation.lastErrorCode == nil
        }
        let id = existingIndex.map { state.mutations[$0].id } ?? ULID.generate()
        let idempotencyKey = existingIndex.flatMap { state.mutations[$0].payload["idempotencyKey"]?.stringValue } ?? id
        var payload = payload
        payload["idempotencyKey"] = .string(idempotencyKey)
        let mutation = SyncMutation(
            id: id,
            kind: kind,
            entityId: entityID,
            payload: payload,
            occurredAt: occurredAt
        )
        if let existingIndex {
            // Re-append through the store's normal outbox path so a mutation
            // loaded from disk still wakes an active sync observer when its
            // absolute payload changes.
            state.mutations.remove(at: existingIndex)
            appendMutation(mutation)
        } else {
            appendMutation(mutation)
        }
    }

    private func queueHealthDelete(_ workout: HealthWorkoutSummaryModel, occurredAt: String) {
        let kind = HealthMutationKind.workoutDelete
        guard !state.mutations.contains(where: {
            $0.kind == kind && $0.entityId == workout.id &&
                $0.attemptCount == nil && $0.lastErrorCode == nil
        }) else { return }
        queueHealthUpsert(
            kind: kind,
            entityID: workout.id,
            payload: [
                "source": .string(workout.source.rawValue),
                "healthKitUUID": .string(workout.healthKitUUID)
            ],
            occurredAt: occurredAt
        )
    }

    private func removePendingHealthUpsert(for entityID: String) {
        state.mutations.removeAll { mutation in
            (mutation.kind == HealthMutationKind.workout || mutation.kind == HealthMutationKind.summary) &&
                mutation.entityId == entityID && mutation.attemptCount == nil && mutation.lastErrorCode == nil
        }
    }

    private func healthSummaryPayload(_ summary: HealthDailySummaryModel) -> [String: JSONValue] {
        [
            "source": .string(summary.source.rawValue),
            "localDate": .string(summary.localDate),
            "steps": .number(Double(summary.steps)),
            "walkingRunningDistanceMeters": .number(summary.walkingRunningDistanceMeters),
            "activeEnergyKcal": .number(summary.activeEnergyKcal),
            "exerciseMinutes": .number(Double(summary.exerciseMinutes)),
            "standHours": summary.standHours.map(JSONValue.number) ?? .null,
            "sleepMinutes": .number(Double(summary.sleepMinutes)),
            "sleepStart": summary.sleepStartAt.map(JSONValue.string) ?? .null,
            "sleepEnd": summary.sleepEndAt.map(JSONValue.string) ?? .null,
            "restingHeartRateBpm": summary.restingHeartRateBpm.map(JSONValue.number) ?? .null,
            "hrvMilliseconds": summary.hrvMilliseconds.map(JSONValue.number) ?? .null,
            "workoutCount": .number(Double(summary.workoutCount)),
            "workoutMinutes": .number(Double(summary.workoutMinutes)),
            "workoutEnergyKcal": .number(summary.workoutEnergyKcal)
        ]
    }

    private func healthWorkoutPayload(_ workout: HealthWorkoutSummaryModel) -> [String: JSONValue] {
        [
            "source": .string(workout.source.rawValue),
            "healthKitUUID": .string(workout.healthKitUUID),
            "activityType": .string(workout.activityType),
            "startedAt": .string(workout.startAt),
            "endedAt": .string(workout.endAt),
            "durationSeconds": .number(Double(workout.durationSeconds)),
            "energyKcal": workout.energyKcal.map(JSONValue.number) ?? .null,
            "sourceBundleId": workout.sourceBundle.map(JSONValue.string) ?? .null,
            "deviceName": workout.deviceName.map(JSONValue.string) ?? .null
        ]
    }
}
