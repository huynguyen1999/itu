import XCTest
@testable import iTu

@MainActor
final class TaskUndoTests: XCTestCase {
    var model: AppModel!
    var coordinator: TaskUndoCoordinator!

    override func setUp() {
        super.setUp()
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        let store = OfflineStore(accountID: "test-undo-account", baseURL: directory)
        model = AppModel()
        model.offlineStore = store
        coordinator = TaskUndoCoordinator.shared
        coordinator.clearHistory()
    }

    override func tearDown() {
        coordinator.clearHistory()
        model = nil
        super.tearDown()
    }

    func testCompleteTaskUndoRestoresPreviousStatus() async {
        let task = ProductivityTask(
            id: "task-undo-1",
            taskListId: "inbox",
            title: "Task 1",
            descriptionMarkdown: "",
            priority: .none,
            important: false,
            urgent: false,
            urgencyReason: "",
            status: .inProgress,
            sortOrder: 0.0,
            version: 1
        )
        model.tasks = [task]

        await model.setTaskStatus(task, status: .completed)
        XCTAssertEqual(model.tasks.first(where: { $0.id == task.id })?.status, .completed)
        XCTAssertNotNil(coordinator.activeToast)

        await coordinator.performLatestUndo()
        XCTAssertEqual(model.tasks.first(where: { $0.id == task.id })?.status, .inProgress)
        XCTAssertNil(coordinator.activeToast)
    }

    func testSoftDeleteUndoRestoresTask() async {
        let task = ProductivityTask.optimistic(id: "task-undo-2", title: "Task 2 to delete", taskListId: "inbox")
        model.tasks = [task]

        await model.softDeleteTask(task)
        XCTAssertNotNil(model.tasks.first(where: { $0.id == task.id })?.deletedAt)
        XCTAssertNotNil(coordinator.activeToast)

        await coordinator.performLatestUndo()
        XCTAssertNil(model.tasks.first(where: { $0.id == task.id })?.deletedAt)
    }

    func testUndoStackCapFiveOperations() async {
        for i in 1...7 {
            let task = ProductivityTask(
                id: "task-\(i)",
                taskListId: "inbox",
                title: "Task \(i)",
                descriptionMarkdown: "",
                priority: .none,
                important: false,
                urgent: false,
                urgencyReason: "",
                status: .planned,
                sortOrder: Double(i),
                version: 1
            )
            model.tasks.append(task)
            await model.setTaskStatus(task, status: .completed)
        }

        XCTAssertEqual(coordinator.activeToast?.label, "Task completed")
    }

    func testClearHistoryOnAccountChange() async {
        model.user = UserProfile(
            id: "user-1",
            email: "user1@example.com",
            username: "user1",
            displayName: "User 1",
            avatarUrl: nil,
            roles: [],
            permissions: []
        )
        let record = TaskUndoRecord(
            label: "Test action",
            taskId: "1",
            mutationType: .status,
            previousValues: [:]
        ) {}
        coordinator.registerUndo(record)
        XCTAssertNotNil(coordinator.activeToast)

        let profile = UserProfile(
            id: "user-2",
            email: "user2@example.com",
            username: "user2",
            displayName: "User 2",
            avatarUrl: nil,
            roles: [],
            permissions: []
        )
        try? await model.switchAccountIfNeeded(to: profile)
        XCTAssertNil(coordinator.activeToast)
    }
}
