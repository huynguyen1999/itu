import XCTest
@testable import iTu

@MainActor
final class FocusTaskLifecycleTests: XCTestCase {
    var model: AppModel!

    override func setUp() {
        super.setUp()
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        let store = OfflineStore(accountID: "test-account", baseURL: directory)
        model = AppModel()
        model.offlineStore = store
    }

    override func tearDown() {
        model = nil
        super.tearDown()
    }

    func testStartFocusForPlannedTaskSetsInProgress() async {
        let task = ProductivityTask.optimistic(id: "focus-task-1", title: "Planned Task", taskListId: "inbox")
        model.tasks = [task]
        await model.setTaskStatus(task, status: .planned)
        let plannedTask = model.tasks.first(where: { $0.id == task.id })!

        await model.startFocus(for: plannedTask)
        XCTAssertEqual(model.tasks.first?.status, .inProgress)
        XCTAssertEqual(model.focusTimer.linkedTask?.id, task.id)
    }

    func testStartFocusForInboxTaskSetsInProgress() async {
        let task = ProductivityTask.optimistic(id: "focus-task-2", title: "Inbox Task", taskListId: "inbox")
        model.tasks = [task]

        await model.startFocus(for: task)
        XCTAssertEqual(model.tasks.first?.status, .inProgress)
    }

    func testStartFocusForInProgressTaskLeavesInProgress() async {
        let task = ProductivityTask.optimistic(id: "focus-task-3", title: "In Progress Task", taskListId: "inbox")
        model.tasks = [task]

        await model.startFocus(for: task)
        XCTAssertEqual(model.tasks.first?.status, .inProgress)
    }

    func testCompletingFocusSessionLeavesTaskInProgress() async {
        let task = ProductivityTask.optimistic(id: "focus-task-4", title: "Focusing Task", taskListId: "inbox")
        model.tasks = [task]

        await model.startFocus(for: task)
        XCTAssertEqual(model.tasks.first?.status, .inProgress)

        await model.performFocusAction("complete")
        XCTAssertEqual(model.tasks.first?.status, .inProgress)
    }

    func testAbandoningFocusSessionLeavesTaskInProgress() async {
        let task = ProductivityTask.optimistic(id: "focus-task-5", title: "Focusing Task 2", taskListId: "inbox")
        model.tasks = [task]

        await model.startFocus(for: task)
        XCTAssertEqual(model.tasks.first?.status, .inProgress)

        await model.performFocusAction("abandon")
        XCTAssertEqual(model.tasks.first?.status, .inProgress)
    }
}
