import XCTest
@testable import iTu

@MainActor
final class PlanningTests: XCTestCase {
    func testAllTasksPlanningKeepsAssignedInProgressTaskVisible() {
        let model = AppModel()
        var task = ProductivityTask.optimistic(
            id: "01JTESTTASK000000000000003",
            title: "Processing task",
            taskListId: "list-1"
        )
        task.status = .inProgress
        model.tasks = [task]

        XCTAssertEqual(model.tasks(for: .inbox).map(\.id), [task.id])
    }

    func testApplyingAuthoritativeEmptyTaskSnapshotClearsStaleTasks() {
        let model = AppModel()
        model.tasks = [ProductivityTask.optimistic(id: "01JTESTTASK000000000000004", title: "Deleted elsewhere")]

        var snapshot = OfflineSnapshot()
        snapshot.tasks = []
        model.apply(snapshot)

        XCTAssertTrue(model.tasks.isEmpty)
    }

    func testCyclingTaskStatusInvalidatesPlanningProjection() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: directory) }

        let store = OfflineStore(accountID: "planning-test", baseURL: directory)
        _ = try await store.load()
        let created = try await store.createTask(title: "Start task").task
        let model = AppModel()
        model.offlineStore = store
        model.apply(try await store.load())
        let settings = model.settingsStore.planningSettings(for: .inbox)
        _ = model.planningRenderProjection(for: .inbox, filterQuery: "", taskListId: nil, settings: settings)

        await model.cycleTaskStatus(created)

        XCTAssertEqual(
            model.planningRenderProjection(for: .inbox, filterQuery: "", taskListId: nil, settings: settings)
                .activeGroups.flatMap(\.tasks).first?.status,
            .inProgress
        )
    }
}
