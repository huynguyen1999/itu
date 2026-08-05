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
}
