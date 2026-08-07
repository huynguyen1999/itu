import XCTest
import AppKit
import SwiftUI
@testable import iTu

@MainActor
final class StatusItemControllerTests: XCTestCase {

    func testStartStopIdempotency() {
        let model = AppModel()
        let controller = StatusItemController(model: model, openMainWindow: {})

        XCTAssertNil(controller.statusItem)

        controller.start()
        let item1 = controller.statusItem
        XCTAssertNotNil(item1)

        // Calling start second time should not recreate statusItem
        controller.start()
        let item2 = controller.statusItem
        XCTAssertTrue(item1 === item2)

        controller.stop()
        XCTAssertNil(controller.statusItem)

        // Calling stop second time should not crash
        controller.stop()
        XCTAssertNil(controller.statusItem)
    }

    func testVisibilityToggle() {
        let model = AppModel()
        let controller = StatusItemController(model: model, openMainWindow: {})

        controller.start()
        XCTAssertNotNil(controller.statusItem)
        XCTAssertTrue(controller.statusItem?.isVisible == true)

        // Hide item
        var settings = model.settingsStore.focusSettings
        settings.showMenuBarItem = false
        model.settingsStore.focusSettings = settings

        controller.updateStatusItem(force: true)
        XCTAssertFalse(controller.statusItem?.isVisible == true)

        // Restore item
        settings.showMenuBarItem = true
        model.settingsStore.focusSettings = settings

        controller.updateStatusItem(force: true)
        XCTAssertTrue(controller.statusItem?.isVisible == true)

        controller.stop()
    }

    func testButtonImagePositionForLayouts() {
        let model = AppModel()
        let controller = StatusItemController(model: model, openMainWindow: {})
        controller.start()

        // Idle state
        controller.updateStatusItem(force: true)
        XCTAssertEqual(controller.statusItem?.button?.imagePosition, .imageOnly)

        // Active work state
        _ = model.focusTimer.startOptimisticSession(
            phase: .work,
            plannedSeconds: 1500,
            taskId: nil,
            customTitle: "Writing Tests",
            idempotencyKey: nil
        )
        controller.updateStatusItem(force: true)
        XCTAssertEqual(controller.statusItem?.button?.imagePosition, .imageTrailing)
        XCTAssertEqual(controller.statusItem?.button?.title, "Writing Tests  ")

        // Short break state
        _ = model.focusTimer.startOptimisticSession(
            phase: .shortBreak,
            plannedSeconds: 300,
            taskId: nil,
            customTitle: nil,
            idempotencyKey: nil
        )
        controller.updateStatusItem(force: true)
        XCTAssertEqual(controller.statusItem?.button?.imagePosition, .imageOnly)
        XCTAssertEqual(controller.statusItem?.button?.title, "")

        controller.stop()
    }
}
