import Foundation
import iTuOffline

public final class SyncCoordinatorCore: @unchecked Sendable {
    public typealias FailureRecordingPolicy = @Sendable () async -> Bool

    private struct Run: Sendable {
        let store: OfflineStore
        let generation: Int
        let readyMutations: [SyncMutation]
        let before: OfflineSnapshot
    }

    private enum Begin {
        case detached
        case coalesced(OfflineStore)
        case started(store: OfflineStore, generation: Int)
    }

    private let lock = NSLock()
    private let transport: any SyncTransport
    private let deviceId: String
    private let clientInstanceId: String
    private var store: OfflineStore?
    private var generation: Int
    private var isSyncing = false
    private var syncingGeneration: Int?
    private var followupRequested = false

    public init(
        store: OfflineStore? = nil,
        transport: any SyncTransport,
        deviceId: String,
        clientInstanceId: String,
        generation: Int = 0
    ) {
        self.store = store
        self.transport = transport
        self.deviceId = deviceId
        self.clientInstanceId = clientInstanceId
        self.generation = generation
    }

    /// Replaces the account store and invalidates any in-flight response.
    public func attach(store: OfflineStore, generation: Int) {
        lock.lock()
        self.store = store
        self.generation = generation
        isSyncing = false
        syncingGeneration = nil
        followupRequested = false
        lock.unlock()
    }

    /// Invalidates in-flight work while retaining the current store.
    public func invalidate() {
        lock.lock()
        generation &+= 1
        isSyncing = false
        syncingGeneration = nil
        followupRequested = false
        lock.unlock()
    }

    /// Runs one REST sync pass. Concurrent calls are coalesced into the
    /// active pass and request one follow-up pass when it completes.
    public func synchronize(
        recordFailures: @escaping FailureRecordingPolicy = { true }
    ) async throws -> SyncOutcome {
        switch begin() {
        case .detached:
            throw SyncCoordinatorCoreError.notAttached
        case let .coalesced(store):
            let snapshot = await store.snapshot()
            return SyncOutcome(
                result: SyncResult(snapshot: snapshot, outcomes: [], conflicts: snapshot.conflicts, cursor: snapshot.cursor),
                performed: false
            )
        case let .started(store, generation):
            let before = await store.snapshot()
            let run = Run(
                store: store,
                generation: generation,
                readyMutations: before.mutations.filter(Self.isReady),
                before: before
            )
            defer { finish(run.generation) }
            do {
                let response = try await transport.synchronize(SyncRequest(
                    deviceId: deviceId,
                    clientInstanceId: clientInstanceId,
                    cursor: run.before.cursor,
                    mutations: run.readyMutations.map(SyncMutationPayload.init)
                ))
                guard isCurrent(run) else {
                    return SyncOutcome(result: await currentResult(fallback: run.before), performed: false)
                }
                let snapshot = try await run.store.applySync(response)
                guard isCurrent(run) else {
                    return SyncOutcome(result: await currentResult(fallback: snapshot), performed: false)
                }
                return SyncOutcome(
                    result: SyncResult(
                        snapshot: snapshot,
                        outcomes: response.mutationOutcomes ?? [],
                        conflicts: response.conflicts,
                        cursor: response.cursor,
                        changes: response.changes
                    ),
                    performed: true
                )
            } catch {
                if await recordFailures(), isCurrent(run) {
                    let metadata = Self.failureMetadata(error)
                    let recoverableIDs = Set(metadata.recoverableMutationIDs)
                    let acknowledgedIDs = Set(metadata.acknowledgedMutationIDs)
                    if !acknowledgedIDs.isEmpty {
                        let current = await run.store.snapshot()
                        _ = try? await run.store.applySync(
                            acknowledgedMutationIds: Array(acknowledgedIDs),
                            conflicts: [],
                            changes: [],
                            cursor: current.cursor
                        )
                    }
                    for mutationID in recoverableIDs where run.readyMutations.contains(where: { $0.id == mutationID }) {
                        _ = try? await run.store.retryMutation(mutationID, keepLocal: true)
                    }
                    let failedIDs = run.readyMutations
                        .map(\.id)
                        .filter { !recoverableIDs.contains($0) && !acknowledgedIDs.contains($0) }
                    _ = try? await run.store.recordMutationFailures(
                        failedIDs,
                        code: metadata.code,
                        retryAfter: metadata.retryAfter,
                        retryable: metadata.retryable || !recoverableIDs.isEmpty
                    )
                }
                throw error
            }
        }
    }

    /// Returns and clears the coalescing marker for the lifecycle wrapper.
    public func consumeFollowupRequest() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        let requested = followupRequested
        followupRequested = false
        return requested
    }

    private func begin() -> Begin {
        lock.lock()
        defer { lock.unlock() }
        guard let store else { return .detached }
        if isSyncing {
            followupRequested = true
            return .coalesced(store)
        }
        isSyncing = true
        syncingGeneration = generation
        return .started(store: store, generation: generation)
    }

    private func finish(_ runGeneration: Int) {
        lock.lock()
        defer { lock.unlock() }
        guard syncingGeneration == runGeneration else { return }
        isSyncing = false
        syncingGeneration = nil
    }

    private func isCurrent(_ run: Run) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        return generation == run.generation && store === run.store
    }

    private func currentStore() -> OfflineStore? {
        lock.lock()
        defer { lock.unlock() }
        return store
    }

    private func currentResult(fallback: OfflineSnapshot) async -> SyncResult {
        guard let store = currentStore() else {
            return SyncResult(snapshot: fallback, outcomes: [], conflicts: fallback.conflicts, cursor: fallback.cursor)
        }
        let snapshot = await store.snapshot()
        return SyncResult(snapshot: snapshot, outcomes: [], conflicts: snapshot.conflicts, cursor: snapshot.cursor)
    }

    private static func failureMetadata(_ error: Error) -> (
        code: String,
        retryAfter: TimeInterval?,
        retryable: Bool,
        recoverableMutationIDs: [String],
        acknowledgedMutationIDs: [String]
    ) {
        guard let failure = error as? any SyncTransportFailure else {
            return ("SYNC_FAILED", nil, true, [], [])
        }
        return (
            failure.syncFailureCode,
            failure.syncRetryAfter,
            failure.syncRetryable,
            failure.syncRecoverableMutationIDs,
            failure.syncAcknowledgedMutationIDs
        )
    }

    private static func isReady(_ mutation: SyncMutation) -> Bool {
        guard mutation.lastErrorCode == nil || mutation.nextRetryAt != nil else { return false }
        guard let value = mutation.nextRetryAt,
              let date = ISO8601DateFormatter().date(from: value) else { return true }
        return date <= Date()
    }
}

public struct SyncOutcome: Sendable {
    public let result: SyncResult
    public let performed: Bool

    public init(result: SyncResult, performed: Bool) {
        self.result = result
        self.performed = performed
    }
}

public enum SyncCoordinatorCoreError: LocalizedError, Sendable {
    case notAttached

    public var errorDescription: String? {
        switch self {
        case .notAttached: "Sync is not attached"
        }
    }
}
