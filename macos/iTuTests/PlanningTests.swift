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
        _ = model.planningTasks(for: .inbox, filterQuery: "", taskListId: nil)

        await model.cycleTaskStatus(created)

        XCTAssertEqual(
            model.planningTasks(for: .inbox, filterQuery: "", taskListId: nil).first?.status,
            .inProgress
        )
    }
}
