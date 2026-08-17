import Foundation
import XCTest
@testable import iTuOffline

final class OfflineModelsTests: XCTestCase {
    func testContractsKeepRetryConflictOutboxSnapshotAndLocationSemantics() throws {
        let mutation = SyncMutation(
            id: "retry-1",
            kind: "task.update",
            entityId: "task-1",
            baseVersion: 2,
            payload: ["title": .string("draft")],
            fieldEditedAt: ["title": "2026-08-17T00:00:00Z"],
            occurredAt: "2026-08-17T00:00:00Z",
            attemptCount: 3,
            lastAttemptAt: "2026-08-17T00:01:00Z",
            nextRetryAt: "2026-08-17T00:02:00Z",
            lastErrorCode: "TIMEOUT"
        )
        let conflict = SyncConflict(
            mutationId: mutation.id,
            entityType: "task",
            entityId: mutation.entityId,
            reason: "VERSION_CONFLICT",
            serverData: .object(["version": .number(4)]),
            localDraft: mutation.payload,
            conflictingFields: ["title"],
            kind: mutation.kind,
            occurredAt: mutation.occurredAt
        )
        let decodedMutation = try JSONDecoder().decode(SyncMutation.self, from: JSONEncoder().encode(mutation))
        let decodedConflict = try JSONDecoder().decode(SyncConflict.self, from: JSONEncoder().encode(conflict))
        XCTAssertEqual(decodedMutation, mutation)
        XCTAssertEqual(decodedConflict, conflict)
        XCTAssertEqual(SyncMutationPayload(mutation).fieldEditedAt, mutation.fieldEditedAt)

        let legacy = #"{"mutations":[{"id":"legacy-budget","kind":"budgettransaction.create","entityId":"budget-1","payload":{},"occurredAt":"2026-08-17T00:00:00Z"},{"id":"retry-1","kind":"task.update","entityId":"task-1","payload":{"title":"draft"},"occurredAt":"2026-08-17T00:00:00Z","attemptCount":3,"nextRetryAt":"2026-08-17T00:02:00Z"}],"conflicts":[{"mutationId":"retry-1","entityType":"task","entityId":"task-1","reason":"VERSION_CONFLICT","serverData":{"version":4},"localDraft":{"title":"draft"},"conflictingFields":["title"],"kind":"task.update","occurredAt":"2026-08-17T00:00:00Z"}]}"#.data(using: .utf8)!
        let snapshot = try JSONDecoder().decode(OfflineSnapshot.self, from: legacy)
        XCTAssertEqual(OfflineSnapshot().schemaVersion, 2)
        XCTAssertEqual(snapshot.schemaVersion, 1)
        XCTAssertEqual(snapshot.budgetDataEpoch, 1)
        XCTAssertEqual(snapshot.mutations.map(\.id), ["retry-1"])
        XCTAssertEqual(snapshot.mutations.first?.nextRetryAt, "2026-08-17T00:02:00Z")
        XCTAssertEqual(snapshot.conflicts.first?.id, "retry-1")

        let event = OutboxEvent.enqueued(urgent: true)
        if case let .enqueued(urgent) = event { XCTAssertTrue(urgent) } else { XCTFail("unexpected outbox event") }
        XCTAssertEqual(OfflineStoreLocation(rootURL: URL(fileURLWithPath: "/tmp/iTu")), OfflineStoreLocation(rootURL: URL(fileURLWithPath: "/tmp/iTu")))
    }
}
