import XCTest
@testable import iTuDomain

final class WidgetSnapshotTests: XCTestCase {
    func testSnapshotRoundTripsWithSchemaAndAccountFields() throws {
        let nextTask = WidgetTaskSnapshot(
            id: "task-1",
            title: "Write",
            status: .planned,
            dueAt: "2026-01-01T12:00:00Z",
            scheduledStartAt: "2026-01-01T10:00:00Z"
        )
        let focus = WidgetFocusSnapshot(
            id: "focus-1",
            title: "Write",
            status: .active,
            phase: .work,
            plannedSeconds: 1_500,
            startedAt: "2026-01-01T10:00:00Z"
        )
        let snapshot = WidgetSnapshot(
            accountID: "account-1",
            generatedAt: "2026-01-01T10:00:00Z",
            localDate: "2026-01-01",
            taskTotal: 3,
            taskCompleted: 1,
            taskRemaining: 2,
            nextTask: nextTask,
            todayTasks: [nextTask],
            habitsRemaining: 2,
            activeFocus: focus
        )

        let decoded = try JSONDecoder().decode(
            WidgetSnapshot.self,
            from: JSONEncoder().encode(snapshot)
        )

        XCTAssertEqual(decoded, snapshot)
        XCTAssertEqual(decoded.schemaVersion, WidgetSnapshot.currentSchemaVersion)
        XCTAssertEqual(decoded.accountID, "account-1")
    }

    func testStoreMissingAndCorruptData() throws {
        let url = temporaryURL()
        let root = url.deletingLastPathComponent().deletingLastPathComponent()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = WidgetSnapshotStore(fileURL: url, expectedAccountID: "account-1")

        XCTAssertNil(try store.load())

        try FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        try Data("not json".utf8).write(to: url)
        XCTAssertThrowsError(try store.load()) { error in
            XCTAssertEqual(error as? WidgetSnapshotStoreError, .corruptData)
        }
    }

    func testStoreCreatesParentAtomicallyLoadsAndClears() throws {
        let url = temporaryURL()
        let root = url.deletingLastPathComponent().deletingLastPathComponent()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = WidgetSnapshotStore(fileURL: url, expectedAccountID: "account-1")
        let snapshot = WidgetSnapshot(
            accountID: "account-1",
            generatedAt: "2026-01-01T10:00:00Z",
            localDate: "2026-01-01",
            taskTotal: 0,
            taskCompleted: 0,
            taskRemaining: 0,
            habitsRemaining: 0
        )

        try store.save(snapshot)

        XCTAssertTrue(FileManager.default.fileExists(atPath: url.path))
        XCTAssertEqual(try store.load(), snapshot)
        try store.clear()
        XCTAssertNil(try store.load())
        try store.clear()
    }

    func testStoreRejectsMismatchedAccountOnSaveAndLoad() throws {
        let url = temporaryURL()
        let root = url.deletingLastPathComponent().deletingLastPathComponent()
        defer { try? FileManager.default.removeItem(at: root) }
        let expected = WidgetSnapshotStore(fileURL: url, expectedAccountID: "account-1")
        let otherSnapshot = WidgetSnapshot(
            accountID: "account-2",
            generatedAt: "2026-01-01T10:00:00Z",
            localDate: "2026-01-01",
            taskTotal: 0,
            taskCompleted: 0,
            taskRemaining: 0,
            habitsRemaining: 0
        )

        XCTAssertThrowsError(try expected.save(otherSnapshot)) { error in
            XCTAssertEqual(error as? WidgetSnapshotStoreError, .accountMismatch(expected: "account-1", actual: "account-2"))
        }

        let actual = WidgetSnapshotStore(fileURL: url, expectedAccountID: "account-2")
        try actual.save(otherSnapshot)
        XCTAssertThrowsError(try expected.load()) { error in
            XCTAssertEqual(error as? WidgetSnapshotStoreError, .accountMismatch(expected: "account-1", actual: "account-2"))
        }
    }

    func testFocusRemainingSecondsAndDeadline() {
        let started = date("2026-01-01T00:00:00Z")
        let now = date("2026-01-01T00:01:40Z")
        let active = WidgetFocusSnapshot(
            id: "focus-1",
            title: "Focus",
            status: .active,
            phase: .work,
            plannedSeconds: 300,
            startedAt: "2026-01-01T00:00:00Z"
        )
        XCTAssertEqual(active.remainingSeconds(at: now), 200)
        XCTAssertEqual(active.deadline(at: now), started.addingTimeInterval(300))

        let paused = WidgetFocusSnapshot(
            id: "focus-1",
            title: "Focus",
            status: .paused,
            phase: .work,
            plannedSeconds: 300,
            startedAt: "2026-01-01T00:00:00Z",
            pausedAt: "2026-01-01T00:01:20Z",
            accumulatedPauseSeconds: 10
        )
        XCTAssertEqual(paused.remainingSeconds(at: now), 230)
        XCTAssertNil(paused.deadline(at: now))

        let resumed = WidgetFocusSnapshot(
            id: "focus-1",
            title: "Focus",
            status: .active,
            phase: .work,
            plannedSeconds: 300,
            startedAt: "2026-01-01T00:00:00Z",
            accumulatedPauseSeconds: 20
        )
        XCTAssertEqual(resumed.remainingSeconds(at: now), 220)
    }

    func testFocusTerminalStatesAndCountdownClampToZero() {
        let now = date("2026-01-01T01:00:00Z")
        for status in [FocusSessionStatus.completed, .abandoned] {
            let terminal = WidgetFocusSnapshot(
                id: "focus-1",
                title: "Focus",
                status: status,
                phase: .work,
                plannedSeconds: 300,
                startedAt: "2026-01-01T00:00:00Z"
            )
            XCTAssertNil(terminal.remainingSeconds(at: now))
            XCTAssertNil(terminal.deadline(at: now))
        }

        let expired = WidgetFocusSnapshot(
            id: "focus-1",
            title: "Focus",
            status: .active,
            phase: .work,
            plannedSeconds: 300,
            startedAt: "2026-01-01T00:00:00Z"
        )
        XCTAssertEqual(expired.remainingSeconds(at: now), 0)
    }

    private func temporaryURL() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("iTuWidgetTests-\(UUID().uuidString)")
            .appendingPathComponent("nested")
            .appendingPathComponent("widget.json")
    }

    private func date(_ value: String) -> Date {
        ISO8601DateFormatter().date(from: value)!
    }
}
