import XCTest
import iTuOffline
@testable import iTuSync

final class SyncCoordinatorCoreTests: XCTestCase {
    func testConcurrentPassesCoalesceAndRequestOneFollowup() async throws {
        let store = try await makeStore()
        let transport = DelayedTransport(response: response(cursor: "1"))
        let core = SyncCoordinatorCore(
            store: store,
            transport: transport,
            deviceId: "device",
            clientInstanceId: "client"
        )

        async let first = core.synchronize()
        while await transport.callCount == 0 {
            try await Task.sleep(for: .milliseconds(1))
        }
        async let second = core.synchronize()
        let firstOutcome = try await first
        let secondOutcome = try await second

        let callCount = await transport.callCount
        XCTAssertEqual(callCount, 1)
        XCTAssertTrue(firstOutcome.performed)
        XCTAssertFalse(secondOutcome.performed)
        XCTAssertTrue(core.consumeFollowupRequest())
        XCTAssertFalse(core.consumeFollowupRequest())
    }

    func testRequestFiltersFutureRetriesAndAppliesResponseCursor() async throws {
        let store = try await makeStore()
        _ = try await store.enqueue(SyncMutation(
            id: "ready",
            kind: "task.create",
            entityId: "task-ready",
            payload: [:],
            occurredAt: "2026-08-17T00:00:00Z"
        ))
        _ = try await store.enqueue(SyncMutation(
            id: "later",
            kind: "task.create",
            entityId: "task-later",
            payload: [:],
            occurredAt: "2026-08-17T00:00:00Z",
            nextRetryAt: "2999-01-01T00:00:00Z"
        ))
        let transport = RecordingTransport(response: response(cursor: "7"))
        let core = SyncCoordinatorCore(
            store: store,
            transport: transport,
            deviceId: "device",
            clientInstanceId: "client"
        )

        _ = try await core.synchronize()

        let recordedRequests = await transport.requests
        let request = try XCTUnwrap(recordedRequests.first)
        XCTAssertEqual(request.deviceId, "device")
        XCTAssertEqual(request.clientInstanceId, "client")
        XCTAssertEqual(request.cursor, "0")
        XCTAssertEqual(request.mutations.map(\.id), ["ready"])
        let snapshot = await store.snapshot()
        XCTAssertEqual(snapshot.cursor, "7")
    }

    func testTransportFailureRecordsRetryMetadata() async throws {
        let store = try await makeStore()
        _ = try await store.enqueue(SyncMutation(
            id: "mutation",
            kind: "task.create",
            entityId: "task",
            payload: [:],
            occurredAt: "2026-08-17T00:00:00Z"
        ))
        let core = SyncCoordinatorCore(
            store: store,
            transport: FailingTransport(),
            deviceId: "device",
            clientInstanceId: "client"
        )

        do {
            _ = try await core.synchronize()
            XCTFail("expected transport failure")
        } catch is TestFailure {
            let snapshot = await store.snapshot()
            let mutation = try XCTUnwrap(snapshot.mutations.first)
            XCTAssertEqual(mutation.lastErrorCode, "RATE_LIMITED")
            XCTAssertEqual(mutation.attemptCount, 1)
            XCTAssertNotNil(mutation.nextRetryAt)
        }
    }

    func testPermanentFailureIsHeldOutOfTheNextRequest() async throws {
        let store = try await makeStore()
        _ = try await store.enqueue(SyncMutation(
            id: "mutation",
            kind: "task.create",
            entityId: "task",
            payload: [:],
            occurredAt: "2026-08-17T00:00:00Z"
        ))
        let transport = PermanentFailureTransport()
        let core = SyncCoordinatorCore(
            store: store,
            transport: transport,
            deviceId: "device",
            clientInstanceId: "client"
        )

        do {
            _ = try await core.synchronize()
            XCTFail("expected permanent failure")
        } catch is PermanentFailure {}

        _ = try? await core.synchronize()
        let callCount = await transport.callCount
        XCTAssertEqual(callCount, 2)
        let requests = await transport.requests
        XCTAssertEqual(requests.last?.mutations.count, 0)
        let snapshot = await store.snapshot()
        let mutation = try XCTUnwrap(snapshot.mutations.first)
        XCTAssertEqual(mutation.lastErrorCode, "INVALID_SYNC_MUTATION")
        XCTAssertNil(mutation.nextRetryAt)
    }

    func testMutationIdReuseGetsANewClientId() async throws {
        let store = try await makeStore()
        _ = try await store.enqueue(SyncMutation(
            id: "reused",
            kind: "habitoccurrence.checkin",
            entityId: "occurrence",
            payload: [:],
            occurredAt: "2026-08-17T00:00:00Z"
        ))
        let core = SyncCoordinatorCore(
            store: store,
            transport: ReusedMutationFailureTransport(),
            deviceId: "device",
            clientInstanceId: "client"
        )

        do {
            _ = try await core.synchronize()
            XCTFail("expected mutation ID failure")
        } catch is ReusedMutationFailure {}

        let snapshot = await store.snapshot()
        let mutation = try XCTUnwrap(snapshot.mutations.first)
        XCTAssertNotEqual(mutation.id, "reused")
        XCTAssertNil(mutation.lastErrorCode)
    }

    func testPartialFailureRemovesOnlyMutationsAlreadyAcknowledgedByServer() async throws {
        let store = try await makeStore()
        _ = try await store.enqueue(SyncMutation(
            id: "applied",
            kind: "task.update",
            entityId: "task-1",
            payload: [:],
            occurredAt: "2026-08-17T00:00:00Z"
        ))
        _ = try await store.enqueue(SyncMutation(
            id: "failed",
            kind: "task.update",
            entityId: "task-2",
            payload: [:],
            occurredAt: "2026-08-17T00:00:01Z"
        ))
        let core = SyncCoordinatorCore(
            store: store,
            transport: PartialFailureTransport(),
            deviceId: "device",
            clientInstanceId: "client"
        )

        do {
            _ = try await core.synchronize()
            XCTFail("expected partial sync failure")
        } catch is PartialFailure {}

        let snapshot = await store.snapshot()
        XCTAssertNil(snapshot.mutations.first(where: { $0.id == "applied" }))
        let failed = try XCTUnwrap(snapshot.mutations.first(where: { $0.id == "failed" }))
        XCTAssertEqual(failed.lastErrorCode, "INVALID_SYNC_MUTATION")
    }

    func testFailurePolicyCanSkipRecordingAtFailureTime() async throws {
        let store = try await makeStore()
        _ = try await store.enqueue(SyncMutation(
            id: "mutation",
            kind: "task.create",
            entityId: "task",
            payload: [:],
            occurredAt: "2026-08-17T00:00:00Z"
        ))
        let core = SyncCoordinatorCore(
            store: store,
            transport: FailingTransport(),
            deviceId: "device",
            clientInstanceId: "client"
        )
        let before = await store.snapshot()

        do {
            _ = try await core.synchronize(recordFailures: { false })
            XCTFail("expected transport failure")
        } catch is TestFailure {
            let after = await store.snapshot()
            XCTAssertEqual(after.mutations, before.mutations)
        }
    }

    func testStaleResponseCannotApplyToReplacementStore() async throws {
        let firstStore = try await makeStore(accountID: "first")
        let secondStore = try await makeStore(accountID: "second")
        let transport = GatedTransport(response: response(cursor: "9"))
        let core = SyncCoordinatorCore(
            store: firstStore,
            transport: transport,
            deviceId: "device",
            clientInstanceId: "client",
            generation: 1
        )

        async let result = core.synchronize()
        while await transport.callCount == 0 {
            try await Task.sleep(for: .milliseconds(1))
        }
        core.attach(store: secondStore, generation: 2)
        await transport.release()
        _ = try await result

        let firstSnapshot = await firstStore.snapshot()
        let secondSnapshot = await secondStore.snapshot()
        XCTAssertEqual(firstSnapshot.cursor, "0")
        XCTAssertEqual(secondSnapshot.cursor, "0")
    }

    private func makeStore(accountID: String = UUID().uuidString) async throws -> OfflineStore {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("iTuSyncTests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let store = OfflineStore(accountID: accountID, baseURL: root)
        _ = try await store.load()
        return store
    }

    private func response(cursor: String) -> SyncResponse {
        SyncResponse(
            acknowledgedMutationIds: [],
            cursor: cursor,
            changes: [],
            conflicts: []
        )
    }
}

private actor RecordingTransport: SyncTransport {
    let response: SyncResponse
    var requests: [SyncRequest] = []

    init(response: SyncResponse) { self.response = response }

    func synchronize(_ request: SyncRequest) async throws -> SyncResponse {
        requests.append(request)
        return response
    }
}

private actor DelayedTransport: SyncTransport {
    let response: SyncResponse
    var callCount = 0

    init(response: SyncResponse) { self.response = response }

    func synchronize(_: SyncRequest) async throws -> SyncResponse {
        callCount += 1
        try await Task.sleep(for: .milliseconds(100))
        return response
    }
}

private struct TestFailure: SyncTransportFailure {
    let syncFailureCode = "RATE_LIMITED"
    let syncRetryAfter: TimeInterval? = 60
    let syncRetryable = true
}

private struct PermanentFailure: SyncTransportFailure {
    let syncFailureCode = "INVALID_SYNC_MUTATION"
    let syncRetryAfter: TimeInterval? = nil
    let syncRetryable = false
}

private struct ReusedMutationFailure: SyncTransportFailure {
    let syncFailureCode = "INVALID_SYNC_MUTATION"
    let syncRetryAfter: TimeInterval? = nil
    let syncRetryable = false
    let syncRecoverableMutationIDs = ["reused"]
}

private struct PartialFailure: SyncTransportFailure {
    let syncFailureCode = "INVALID_SYNC_MUTATION"
    let syncRetryAfter: TimeInterval? = nil
    let syncRetryable = false
    let syncAcknowledgedMutationIDs = ["applied"]
}

private actor PermanentFailureTransport: SyncTransport {
    var callCount = 0
    var requests: [SyncRequest] = []

    func synchronize(_ request: SyncRequest) async throws -> SyncResponse {
        callCount += 1
        requests.append(request)
        if request.mutations.isEmpty {
            return SyncResponse(acknowledgedMutationIds: [], cursor: "0", changes: [], conflicts: [])
        }
        throw PermanentFailure()
    }
}

private struct ReusedMutationFailureTransport: SyncTransport {
    func synchronize(_: SyncRequest) async throws -> SyncResponse { throw ReusedMutationFailure() }
}

private struct PartialFailureTransport: SyncTransport {
    func synchronize(_: SyncRequest) async throws -> SyncResponse { throw PartialFailure() }
}

private struct FailingTransport: SyncTransport {
    func synchronize(_: SyncRequest) async throws -> SyncResponse { throw TestFailure() }
}

private actor GatedTransport: SyncTransport {
    let response: SyncResponse
    var callCount = 0
    var continuation: CheckedContinuation<SyncResponse, Never>?

    init(response: SyncResponse) { self.response = response }

    func synchronize(_: SyncRequest) async throws -> SyncResponse {
        callCount += 1
        return await withCheckedContinuation { continuation in
            self.continuation = continuation
        }
    }

    func release() {
        continuation?.resume(returning: response)
        continuation = nil
    }
}
