import XCTest
@testable import iTu

@MainActor
final class SyncCoordinatorTests: XCTestCase {
    func testStartAndStopExposeTheCurrentLifecycleAndAdvanceGenerationOnAttach() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("iTu-sync-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }

        let first = OfflineStore(accountID: "sync-one", baseURL: root)
        let second = OfflineStore(accountID: "sync-two", baseURL: root)
        _ = try await first.load()
        _ = try await second.load()
        let coordinator = SyncCoordinator(apiClient: APIClient(), offlineStore: first)

        coordinator.start(periodicAction: {})
        XCTAssertTrue(coordinator.isActive)
        let startedGeneration = coordinator.generation

        coordinator.attach(store: second)
        XCTAssertTrue(coordinator.isActive)
        XCTAssertEqual(coordinator.generation, startedGeneration + 1)

        coordinator.stop()
        XCTAssertFalse(coordinator.isActive)
        XCTAssertGreaterThan(coordinator.generation, startedGeneration + 1)
    }

    func testUrgentFlushRunsTheRegisteredActionWhileActive() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("iTu-sync-flush-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }

        let store = OfflineStore(accountID: "sync-flush", baseURL: root)
        _ = try await store.load()
        let coordinator = SyncCoordinator(apiClient: APIClient(), offlineStore: store)
        let actionRan = expectation(description: "urgent sync action")
        coordinator.start {
            actionRan.fulfill()
        }
        coordinator.requestFlush(urgent: true)

        await fulfillment(of: [actionRan], timeout: 1)
        coordinator.stop()
    }

    func testDebouncedFlushIsCancelledWhenTheSessionStops() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("iTu-sync-debounce-" + UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }

        let store = OfflineStore(accountID: "sync-debounce", baseURL: root)
        _ = try await store.load()
        let coordinator = SyncCoordinator(apiClient: APIClient(), offlineStore: store)
        let actionRan = expectation(description: "debounced sync action")
        actionRan.isInverted = true
        coordinator.start { actionRan.fulfill() }
        coordinator.requestFlush()
        coordinator.stop()

        await fulfillment(of: [actionRan], timeout: 1.7)
    }

    func testEventsFromAnAttachedAccountDoNotFlushTheReplacementAccount() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("iTu-sync-account-" + UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }

        let first = OfflineStore(accountID: "sync-account-a", baseURL: root)
        let second = OfflineStore(accountID: "sync-account-b", baseURL: root)
        _ = try await first.load()
        _ = try await second.load()
        let coordinator = SyncCoordinator(apiClient: APIClient(), offlineStore: first)
        let actionRan = expectation(description: "stale account sync action")
        actionRan.isInverted = true
        coordinator.start { actionRan.fulfill() }
        coordinator.attach(store: second)

        _ = try await first.createTask(title: "stale account change")
        await fulfillment(of: [actionRan], timeout: 0.2)
        coordinator.stop()
    }
}
