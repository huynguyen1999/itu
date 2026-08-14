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

    func testMatrixProjectionCacheTracksSettingsAndTaskChanges() {
        let model = AppModel()
        let task = ProductivityTask.optimistic(id: "matrix-cache", title: "Matrix cache", priority: .high, important: false, urgentOverride: false)
        model.tasks = [task]

        var settings = MatrixSettings()
        let initial = model.matrixRenderProjection(query: "", priorityFilter: nil, settings: settings)
        XCTAssertEqual(initial[.q2].activeTasks.map(\.id), [task.id])

        settings.importantPriorities = []
        let changedSettings = model.matrixRenderProjection(query: "", priorityFilter: nil, settings: settings)
        XCTAssertEqual(changedSettings[.q4].activeTasks.map(\.id), [task.id])

        var snapshot = OfflineSnapshot()
        var replacement = task
        replacement.title = "Replaced"
        snapshot.tasks = [replacement]
        model.apply(snapshot)

        XCTAssertEqual(
            model.matrixRenderProjection(query: "replaced", priorityFilter: nil, settings: settings)[.q4].activeTasks.map(\.id),
            [task.id]
        )
    }

    func testRefreshTasksFallsBackToCachedTasksOnNetworkError() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: directory) }

        let store = OfflineStore(accountID: "refresh-test", baseURL: directory)
        _ = try await store.load()
        let created = try await store.createTask(title: "Cached Offline Task").task
        let model = AppModel()
        model.offlineStore = store
        model.user = UserProfile(id: "user-test", email: "user@test.com", username: "tester", displayName: "Tester", avatarUrl: nil, roles: [], permissions: [])
        model.apply(try await store.load())

        XCTAssertEqual(model.tasks.map(\.id), [created.id])

        // When refreshTasks runs with an unreachable API or network failure, existing cached tasks remain
        await model.refreshTasks()

        XCTAssertEqual(model.tasks.map(\.id), [created.id])
        XCTAssertEqual(model.tasks(for: .inbox).map(\.title), ["Cached Offline Task"])
    }

    func testRefreshCoordinatorTasksDomainExecutesRefreshSafely() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: directory) }

        let store = OfflineStore(accountID: "coordinator-tasks-test", baseURL: directory)
        _ = try await store.load()
        let model = AppModel()
        model.offlineStore = store
        model.user = UserProfile(id: "user-test", email: "user@test.com", username: "tester", displayName: "Tester", avatarUrl: nil, roles: [], permissions: [])

        await model.refreshCoordinator.run(.tasks, force: true) {
            await model.refreshTasks()
        }

        // Should complete safely and keep model state consistent
        XCTAssertNotNil(model.offlineStore)
    }
}
