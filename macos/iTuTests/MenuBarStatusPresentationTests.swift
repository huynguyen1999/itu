import XCTest
import SwiftUI
@testable import iTu

@MainActor
final class MenuBarStatusPresentationTests: XCTestCase {

    func testSnapshotActiveWork() async {
        let model = AppModel()
        _ = model.focusTimer.startOptimisticSession(
            phase: .work,
            plannedSeconds: 1500,
            taskId: nil,
            customTitle: "Writing Code",
            idempotencyKey: nil
        )

        let snapshot = MenuBarStatusPresentation.snapshot(model: model, appearance: .dark)
        XCTAssertEqual(snapshot.layout, .focus)
        XCTAssertEqual(snapshot.title, "Writing Code")
        XCTAssertEqual(snapshot.phase, .work)
        XCTAssertFalse(snapshot.isPaused)
        XCTAssertFalse(snapshot.isOvertime)
        XCTAssertTrue(snapshot.accessibilityLabel.contains("Writing Code"))
        XCTAssertTrue(snapshot.accessibilityLabel.contains("Focus"))
    }

    func testSnapshotActiveShortBreak() async {
        let model = AppModel()
        _ = model.focusTimer.startOptimisticSession(
            phase: .shortBreak,
            plannedSeconds: 300,
            taskId: nil,
            customTitle: nil,
            idempotencyKey: nil
        )

        let snapshot = MenuBarStatusPresentation.snapshot(model: model, appearance: .dark)
        XCTAssertEqual(snapshot.layout, .shortBreak)
        XCTAssertEqual(snapshot.title, "")
        XCTAssertEqual(snapshot.phase, .shortBreak)
        XCTAssertTrue(snapshot.accessibilityLabel.contains("Short break"))
    }

    func testSnapshotActiveLongBreak() async {
        let model = AppModel()
        _ = model.focusTimer.startOptimisticSession(
            phase: .longBreak,
            plannedSeconds: 900,
            taskId: nil,
            customTitle: nil,
            idempotencyKey: nil
        )

        let snapshot = MenuBarStatusPresentation.snapshot(model: model, appearance: .light)
        XCTAssertEqual(snapshot.layout, .longBreak)
        XCTAssertEqual(snapshot.title, "")
        XCTAssertEqual(snapshot.phase, .longBreak)
        XCTAssertTrue(snapshot.accessibilityLabel.contains("Long break"))
    }

    func testSnapshotPausedState() async {
        let model = AppModel()
        _ = model.focusTimer.startOptimisticSession(
            phase: .work,
            plannedSeconds: 1500,
            taskId: nil,
            customTitle: "Task",
            idempotencyKey: nil
        )
        model.focusTimer.pauseActiveSession()

        let snapshot = MenuBarStatusPresentation.snapshot(model: model, appearance: .dark)
        XCTAssertTrue(snapshot.isPaused)
        XCTAssertTrue(snapshot.accessibilityLabel.contains("paused"))
    }

    func testSnapshotPendingStates() async {
        let model = AppModel()

        // Pending break
        model.focusTimer.isBreakPending = true
        let breakSnapshot = MenuBarStatusPresentation.snapshot(model: model, appearance: .dark)
        XCTAssertTrue(breakSnapshot.layout == .pendingShortBreak || breakSnapshot.layout == .pendingLongBreak)

        // Pending work
        model.focusTimer.isBreakPending = false
        model.focusTimer.isWorkPending = true
        let workSnapshot = MenuBarStatusPresentation.snapshot(model: model, appearance: .dark)
        XCTAssertEqual(workSnapshot.layout, .pendingFocus)

        // Idle
        model.focusTimer.isWorkPending = false
        let idleSnapshot = MenuBarStatusPresentation.snapshot(model: model, appearance: .dark)
        XCTAssertEqual(idleSnapshot.layout, .idle)
    }
}
