import XCTest
import iTuDomain
@testable import iTuOffline

final class HydrationTests: XCTestCase {
    func testHydrationRollsBackWhenPendingReplayFails() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("iTuHydrationTests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }

        let store = OfflineStore(location: OfflineStoreLocation(rootURL: root))
        _ = try await store.load()
        let task = ProductivityTask.optimistic(id: "task-1", title: "Existing task")
        _ = try await store.updateTasks([task])
        _ = try await store.enqueue(SyncMutation(
            id: "mutation-1",
            kind: "task.update",
            entityId: task.id,
            payload: ["status": .string("NOT_A_STATUS")],
            occurredAt: "2026-08-17T00:00:00Z"
        ))
        let before = await store.snapshot()

        do {
            _ = try await store.applyHydration(OfflineHydrationResources(tasks: [task]))
            XCTFail("Expected pending replay to fail")
        } catch {
            // The hydration transaction must restore the pre-fetch snapshot.
        }
        let after = await store.snapshot()
        XCTAssertEqual(after, before)
    }
}
